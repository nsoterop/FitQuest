export type EditorStamp = { scope: number; editor: number; key: string; sequence: number };
export type EditorState = 'Unsaved changes' | 'Saving on this device…' | 'Draft saved on this device' | 'Couldn’t save latest changes';

/** Coordinates one visible editor. Durable sequence checks live in LocalStore. */
export class EditorCoordinator {
  private scope = 0;
  private editor = 0;
  private key = '';
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latest: { raw: string; write: (key: string, raw: string, sequence: number) => Promise<number>; status: (state: EditorState, stamp: EditorStamp, error?: unknown) => void } | null = null;

  resetScope(): number { this.cancel(); this.scope++; this.editor++; this.key = ''; this.sequence = 0; this.latest = null; return this.scope; }
  currentScope(scope: number): boolean { return this.scope === scope; }
  select(key: string, sequence: number): EditorStamp {
    this.cancel(); this.editor++; this.key = key; this.sequence = sequence; this.latest = null;
    return this.stamp();
  }
  current(stamp: EditorStamp): boolean { return this.scope === stamp.scope && this.editor === stamp.editor && this.key === stamp.key && this.sequence === stamp.sequence; }
  sameEditor(stamp: EditorStamp): boolean { return this.scope === stamp.scope && this.editor === stamp.editor && this.key === stamp.key; }
  rebase(stamp: EditorStamp, persistedSequence: number) {
    if (!this.sameEditor(stamp) || this.current(stamp) || !this.latest) return;
    this.cancel(); this.sequence = Math.max(this.sequence, persistedSequence) + 1;
    const next = this.stamp(), latest = this.latest;
    latest.status('Unsaved changes', next);
    this.timer = setTimeout(() => { void this.write(next, latest.raw, latest.write, latest.status).catch(() => undefined); }, 350);
  }
  stamp(): EditorStamp { return { scope: this.scope, editor: this.editor, key: this.key, sequence: this.sequence }; }
  private cancel() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private next(): EditorStamp { this.cancel(); this.sequence++; return this.stamp(); }
  edit(raw: string, write: (key: string, raw: string, sequence: number) => Promise<number>, status: (state: EditorState, stamp: EditorStamp, error?: unknown) => void): EditorStamp {
    this.latest = { raw, write, status };
    const stamp = this.next(); status('Unsaved changes', stamp);
    this.timer = setTimeout(() => { void this.write(stamp, raw, write, status).catch(() => undefined); }, 350);
    return stamp;
  }
  async persist(raw: string, write: (key: string, raw: string, sequence: number) => Promise<number>, status: (state: EditorState, stamp: EditorStamp, error?: unknown) => void): Promise<EditorStamp> {
    this.latest = { raw, write, status };
    const stamp = this.next();
    await this.write(stamp, raw, write, status);
    return stamp;
  }
  private async write(stamp: EditorStamp, raw: string, write: (key: string, raw: string, sequence: number) => Promise<number>, status: (state: EditorState, stamp: EditorStamp, error?: unknown) => void) {
    if (!this.current(stamp)) return;
    status('Saving on this device…', stamp);
    try { const saved = await write(stamp.key, raw, stamp.sequence); if (saved !== stamp.sequence) throw new Error('Draft was superseded by a newer write'); if (this.current(stamp)) status('Draft saved on this device', stamp); }
    catch (error) { if (this.current(stamp)) status('Couldn’t save latest changes', stamp, error); throw error; }
  }
}
