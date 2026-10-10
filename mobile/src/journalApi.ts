import {
  validJournal,
  type Journal,
  type JournalCommand,
  type JournalReceipt,
  type JournalList,
} from '../../backend/src/journalContract';
export const journalMessage = (code: string) =>
  (
    ({
      journal_changed:
        'This log changed elsewhere. Your edits are kept. Review the saved version before applying your changes.',
      journal_source_unavailable:
        'This accepted prescription could not be found. Your other logs remain available in workout history.',
      journal_missing: 'This workout log could not be found.',
      future_journal: 'Choose today or an earlier performed date.',
      invalid_request:
        'Check your date, units and numeric entries. Blank means unlogged; zero is allowed.',
      operation_conflict:
        'This saved request conflicts with an earlier operation. Your draft is kept.',
      session_ended: 'Your session ended. Sign in again to resume this account’s journal.',
    }) as Record<string, string>
  )[code] ??
  'The save could not be confirmed. Your draft is kept. Retry the same request to check saved status.';
export class JournalError extends Error {
  code: string;
  constructor(code: string) {
    super(journalMessage(code));
    this.code = code;
  }
}
export async function journalRequest<T extends Journal | JournalList | JournalReceipt>(
  path: string,
  token: string,
  signal: AbortSignal,
  command?: JournalCommand,
): Promise<T> {
  try {
    const u = new URL(process.env.EXPO_PUBLIC_API_URL ?? '');
    if (u.protocol !== 'https:' || u.username || u.password || !token || signal.aborted)
      throw Error();
    const suffix = new URL('/workout-journal' + path, u.origin);
    u.pathname = u.pathname.replace(/\/$/, '') + suffix.pathname;
    u.search = suffix.search;
    u.hash = '';
    const r = await fetch(u.toString(), {
      method: command ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(command ? { 'Content-Type': 'application/json' } : {}),
      },
      body: command ? JSON.stringify(command) : undefined,
      signal,
    });
    if (signal.aborted) throw Error();
    if (r.status === 401) throw new JournalError('session_ended');
    const v = await r.json();
    if (r.status !== 200) throw new JournalError(v?.code ?? 'unavailable');
    if (!v || typeof v !== 'object') throw Error();
    if (path.startsWith('/operations/') || command) {
      if (
        typeof v.id !== 'string' ||
        typeof v.journalId !== 'string' ||
        !Number.isInteger(v.revision)
      )
        throw Error();
    } else if (path.startsWith('?') || path === '') {
      if (!Array.isArray(v.items) || v.items.length > 50) throw Error();
    } else if (!validJournal(v)) throw Error();
    return v as T;
  } catch (e) {
    if (e instanceof JournalError) throw e;
    throw new JournalError('unavailable');
  }
}
