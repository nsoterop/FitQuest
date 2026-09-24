/** Serializes authorization mutations while only the latest requested account may install UI state. */
export class AccountTransitions {
  private ticket = 0;
  private queue: Promise<void> = Promise.resolve();
  current(ticket: number) { return this.ticket === ticket; }
  snapshot() { return this.ticket; }
  run(reset: () => void, work: (ticket: number) => Promise<void>): Promise<void> {
    const ticket = ++this.ticket;
    reset();
    this.queue = this.queue.catch(() => undefined).then(() => work(ticket));
    return this.queue;
  }
}
