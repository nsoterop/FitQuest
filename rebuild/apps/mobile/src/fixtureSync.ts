import { ApiErrorSchema, IdentityResponseSchema, OperationOutcomeSchema, ProfileSnapshotSchema, SessionSnapshotSchema, type Command } from '@fitquest-rebuild/contracts';
import { TransportError, type SyncTransport } from './sync';

const endpoint = 'http://127.0.0.1:3401';

/** Loopback fixture transport only. The reusable sender never selects A/B or an endpoint. */
export class LocalHttpTransport implements SyncTransport {
  private controllers = new Set<AbortController>();
  private closed = false;
  constructor(private readonly token: () => Promise<string | null>, private readonly fetcher: typeof fetch = fetch) {
    if (!__DEV__) throw new Error('Synthetic transport unavailable in Release');
  }
  private async request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    if (this.closed) throw new TransportError(0, 'TRANSPORT_CLOSED');
    const bearer = await this.token();
    if (this.closed) throw new TransportError(0, 'TRANSPORT_CLOSED');
    if (!bearer) throw new TransportError(401, 'UNAUTHORIZED');
    const controller = new AbortController(); this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetcher(`${endpoint}${path}`, {
        method, signal: controller.signal, headers: { Authorization: `Bearer ${bearer}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = ApiErrorSchema.safeParse(payload);
        throw new TransportError(response.status, error.success ? error.data.code : 'BAD_RESPONSE');
      }
      return payload;
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
  }
  async identity() { return IdentityResponseSchema.parse(await this.request('/v1/identity')).accountId; }
  async command(command: Command) { return OperationOutcomeSchema.parse(await this.request('/v1/commands', 'POST', command)); }
  async profile() { return ProfileSnapshotSchema.parse(await this.request('/v1/profile')); }
  async session(id: string) { return SessionSnapshotSchema.parse(await this.request(`/v1/sessions/${encodeURIComponent(id)}`)); }
  close() { this.closed = true; for (const controller of this.controllers) controller.abort(); this.controllers.clear(); }
}
