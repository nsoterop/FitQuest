import { createClient } from '@supabase/supabase-js';

export type Account = { userId: string; sessionId: string };
export type VerifyAccount = (token: string) => Promise<Account | null>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function supabaseVerifier(
  url: string,
  publishableKey: string,
  fetcher: typeof fetch = fetch,
): VerifyAccount {
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetcher(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
  return async (token) => {
    // getUser sends the token to this project's Auth server for verification.
    const { data, error } = await client.auth.getUser(token);
    if (error) {
      if (error.status && error.status >= 400 && error.status < 500) return null;
      throw new Error('Auth unavailable.');
    }
    if (!data.user || data.user.is_anonymous || !data.user.email_confirmed_at) return null;
    try {
      // Decode only AFTER Auth has verified this exact token. Metadata never authorizes access.
      const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
      if (
        claims.sub !== data.user.id ||
        claims.role !== 'authenticated' ||
        !uuid.test(claims.session_id) ||
        !Number.isFinite(claims.exp) ||
        claims.exp * 1000 <= Date.now()
      )
        return null;
      return { userId: data.user.id, sessionId: claims.session_id };
    } catch {
      return null;
    }
  };
}
