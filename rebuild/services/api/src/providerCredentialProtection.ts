import { createCipheriv, createDecipheriv, KeyObject, randomBytes } from 'node:crypto';
import { z } from 'zod';

const algorithm = 'AES-256-GCM' as const;
const maxBytes = 16384;
const uuid = z.uuid(); // Preserve existing project UUID semantics, with lowercase canonical spelling below.
const typedArrayByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
export type ProviderCredentialKeyRing = {
  activeKeyId: string;
  /** The active key must appear exactly once here; all entries are explicitly readable. */
  readableKeys: readonly { keyId: string; key: KeyObject }[];
};
export type ProviderCredentialContext = Readonly<{
  environment: string;
  accountId: string;
  providerIdentityId: string;
  issuer: 'https://appleid.apple.com';
  clientId: string;
  credentialId: string;
  materialVersion: number;
  tokenKind: 'identity' | 'access' | 'refresh';
  sourceId: string;
  expiresAtSeconds: number | null;
}>;
export type ProviderCredentialEnvelope = Readonly<{
  schemaVersion: 1;
  algorithm: typeof algorithm;
  keyId: string;
  envelopeRevision: number;
  iv: string;
  ciphertext: string;
  authenticationTag: string;
}>;
export type ProviderCredentialProtectionFailure = { kind: 'invalid_input' | 'key_unavailable' | 'integrity_failure' | 'crypto_failure' };
export type ProviderCredentialSealResult = { kind: 'protected'; envelope: ProviderCredentialEnvelope } | ProviderCredentialProtectionFailure;
export type ProviderCredentialOpenResult = { kind: 'unprotected'; plaintext: Buffer } | ProviderCredentialProtectionFailure;
export interface ProviderCredentialProtection {
  protect(plaintext: Uint8Array, context: ProviderCredentialContext, envelopeRevision: number): ProviderCredentialSealResult;
  /** Expected context/revision must come from independent trusted authority, never the envelope itself. */
  unprotect(envelope: unknown, expectedContext: ProviderCredentialContext, expectedEnvelopeRevision: number): ProviderCredentialOpenResult;
  rewrap(envelope: unknown, expectedContext: ProviderCredentialContext, expectedEnvelopeRevision: number): ProviderCredentialSealResult;
}
export type ProviderCredentialProtectionConstructionResult =
  | { kind: 'ready'; protection: ProviderCredentialProtection }
  | { kind: 'invalid_configuration' };

class InvalidInput extends Error {}
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const asciiId = (value: unknown, max: number): value is string => typeof value === 'string' && value.length >= 1 && value.length <= max
  && !/[^A-Za-z0-9_-]/.test(value);
const canonicalUuid = (value: unknown): value is string => typeof value === 'string' && value.length === 36
  && value === value.toLowerCase() && uuid.safeParse(value).success;

/** Read strict own data properties only; no inherited fields, accessors or unknown/symbol fields. */
function record(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new InvalidInput();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key)
    || !Object.hasOwn(descriptors[key]!, 'value'))) throw new InvalidInput();
  const copy = Object.create(null) as Record<string, unknown>;
  for (const key of fields) {
    if (!Object.hasOwn(descriptors, key)) throw new InvalidInput();
    copy[key] = descriptors[key]!.value;
  }
  return copy;
}

function context(input: ProviderCredentialContext): ProviderCredentialContext {
  const value = record(input, ['environment', 'accountId', 'providerIdentityId', 'issuer', 'clientId', 'credentialId',
    'materialVersion', 'tokenKind', 'sourceId', 'expiresAtSeconds']);
  if (!asciiId(value.environment, 128) || !canonicalUuid(value.accountId) || !canonicalUuid(value.providerIdentityId)
    || !canonicalUuid(value.credentialId) || !canonicalUuid(value.sourceId) || value.issuer !== 'https://appleid.apple.com'
    || typeof value.clientId !== 'string' || value.clientId.length < 1 || value.clientId.length > 255
    || Buffer.byteLength(value.clientId, 'utf8') > 255 || !positive(value.materialVersion)
    || !['identity', 'access', 'refresh'].includes(value.tokenKind as string)
    || (value.expiresAtSeconds !== null && (typeof value.expiresAtSeconds !== 'number'
      || !Number.isSafeInteger(value.expiresAtSeconds) || value.expiresAtSeconds < 0))) throw new InvalidInput();
  return Object.freeze(value) as ProviderCredentialContext;
}

function decode(input: unknown, min: number, max: number): Buffer {
  // Bound encoded size before allocating/decoding; base64url requires canonical unused bits too.
  if (typeof input !== 'string' || input.length < 1 || input.length > Math.ceil(max * 4 / 3)
    || /[^A-Za-z0-9_-]/.test(input)) throw new InvalidInput();
  const decoded = Buffer.from(input, 'base64url');
  if (decoded.byteLength < min || decoded.byteLength > max || decoded.toString('base64url') !== input) throw new InvalidInput();
  return decoded;
}

function envelope(input: unknown) {
  const value = record(input, ['schemaVersion', 'algorithm', 'keyId', 'envelopeRevision', 'iv', 'ciphertext', 'authenticationTag']);
  if (value.schemaVersion !== 1 || value.algorithm !== algorithm || !asciiId(value.keyId, 64) || !positive(value.envelopeRevision)) throw new InvalidInput();
  return { keyId: value.keyId, revision: value.envelopeRevision,
    iv: decode(value.iv, 12, 12), ciphertext: decode(value.ciphertext, 1, maxBytes), tag: decode(value.authenticationTag, 16, 16) };
}

/** AAD v1 is exactly UTF-8(JSON.stringify([format, version, algorithm, keyId, environment,
 * accountId, providerIdentityId, issuer, clientId, credentialId, materialVersion, tokenKind,
 * sourceId, expiresAtSeconds (or null), envelopeRevision])). Order/values are protocol, not object enumeration.
 */
function aad(binding: ProviderCredentialContext, keyId: string, revision: number): Buffer {
  return Buffer.from(JSON.stringify(['fitquest.provider-credential', 1, algorithm, keyId, binding.environment,
    binding.accountId, binding.providerIdentityId, binding.issuer, binding.clientId, binding.credentialId,
    binding.materialVersion, binding.tokenKind, binding.sourceId, binding.expiresAtSeconds, revision]), 'utf8');
}

/** Unused synchronous server primitive. No import/construction entropy, secret discovery, I/O or authority.
 * Keys must be separate from Apple signing/database/device keys. No injected entropy or fallback.
 */
export function createProviderCredentialProtection(configuration: ProviderCredentialKeyRing): ProviderCredentialProtectionConstructionResult {
  const keys = new Map<string, KeyObject>();
  let activeKeyId: string;
  try {
    const ring = record(configuration, ['activeKeyId', 'readableKeys']);
    if (!asciiId(ring.activeKeyId, 64) || !Array.isArray(ring.readableKeys) || ring.readableKeys.length === 0) throw new InvalidInput();
    activeKeyId = ring.activeKeyId;
    for (let index = 0; index < ring.readableKeys.length; index++) {
      // Dense own entries only; do not discover a key through an array prototype/getter.
      const descriptor = Object.getOwnPropertyDescriptor(ring.readableKeys, String(index));
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new InvalidInput();
      const entry = record(descriptor.value, ['keyId', 'key']);
      if (!asciiId(entry.keyId, 64) || keys.has(entry.keyId) || !(entry.key instanceof KeyObject)
        || entry.key.type !== 'secret' || entry.key.symmetricKeySize !== 32) throw new InvalidInput();
      keys.set(entry.keyId, entry.key);
    }
    if (!keys.has(activeKeyId)) throw new InvalidInput();
  } catch { return { kind: 'invalid_configuration' }; }

  const seal = (plaintext: Buffer, binding: ProviderCredentialContext, revision: number): ProviderCredentialSealResult => {
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keys.get(activeKeyId)!, iv, { authTagLength: 16 });
      cipher.setAAD(aad(binding, activeKeyId, revision));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();
      if (iv.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength !== plaintext.byteLength) return { kind: 'crypto_failure' };
      return { kind: 'protected', envelope: Object.freeze({ schemaVersion: 1, algorithm, keyId: activeKeyId,
        envelopeRevision: revision, iv: iv.toString('base64url'), ciphertext: ciphertext.toString('base64url'), authenticationTag: tag.toString('base64url') }) };
    } catch { return { kind: 'crypto_failure' }; }
  };

  const open = (input: unknown, binding: ProviderCredentialContext, expectedRevision: number): ProviderCredentialOpenResult => {
    let parsed: ReturnType<typeof envelope>;
    try { parsed = envelope(input); } catch { return { kind: 'invalid_input' }; }
    if (parsed.revision !== expectedRevision) return { kind: 'integrity_failure' };
    const key = keys.get(parsed.keyId);
    if (!key) return { kind: 'key_unavailable' };
    let partial: Buffer | undefined;
    let final: Buffer | undefined;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, parsed.iv, { authTagLength: 16 });
      decipher.setAAD(aad(binding, parsed.keyId, expectedRevision));
      decipher.setAuthTag(parsed.tag);
      partial = decipher.update(parsed.ciphertext);
      // Node update output is unauthenticated. Keep it private until final succeeds.
      try { final = decipher.final(); } catch { return { kind: 'integrity_failure' }; }
      if (partial.byteLength + final.byteLength !== parsed.ciphertext.byteLength) return { kind: 'crypto_failure' };
      const plaintext = Buffer.alloc(parsed.ciphertext.byteLength); // Owned, unpooled result, allocated only after authentication.
      plaintext.set(partial); plaintext.set(final, partial.byteLength);
      return { kind: 'unprotected', plaintext };
    } catch { return { kind: 'crypto_failure' }; }
    finally { partial?.fill(0); final?.fill(0); }
  };

  const protection: ProviderCredentialProtection = Object.freeze({
    protect(plaintext: Uint8Array, expectedContext: ProviderCredentialContext, revision: number): ProviderCredentialSealResult {
      let binding: ProviderCredentialContext;
      let copy: Buffer;
      try {
        binding = context(expectedContext);
        if (!positive(revision) || !(plaintext instanceof Uint8Array)) throw new InvalidInput();
        const length: unknown = typedArrayByteLength.call(plaintext);
        if (!positive(length) || length > maxBytes) throw new InvalidInput();
        // Use the intrinsic size, not a caller-shadowed byteLength. Bound allocation before copying.
        copy = Buffer.alloc(length);
        copy.set(plaintext); // Private owned copy, not a view into caller memory.
      } catch { return { kind: 'invalid_input' }; }
      try { return seal(copy, binding, revision); } finally { copy.fill(0); }
    },
    unprotect(input: unknown, expectedContext: ProviderCredentialContext, expectedRevision: number): ProviderCredentialOpenResult {
      let binding: ProviderCredentialContext;
      try { binding = context(expectedContext); if (!positive(expectedRevision)) throw new InvalidInput(); }
      catch { return { kind: 'invalid_input' }; }
      return open(input, binding, expectedRevision);
    },
    rewrap(input: unknown, expectedContext: ProviderCredentialContext, expectedRevision: number): ProviderCredentialSealResult {
      let binding: ProviderCredentialContext;
      try { binding = context(expectedContext); if (!positive(expectedRevision) || expectedRevision === Number.MAX_SAFE_INTEGER) throw new InvalidInput(); }
      catch { return { kind: 'invalid_input' }; }
      const opened = open(input, binding, expectedRevision);
      if (opened.kind !== 'unprotected') return opened;
      try { return seal(opened.plaintext, binding, expectedRevision + 1); }
      finally { opened.plaintext.fill(0); }
    },
  });
  return { kind: 'ready', protection };
}
