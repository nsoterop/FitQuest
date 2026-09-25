export type DurableSwitchResult = 'complete' | 'logout_incomplete' | 'destination_failed';

/** Test-bound handoff. stopCurrent must synchronously invalidate local access and sender/UI work. */
export class DurableAccountSwitch {
  private stopped = false;
  private stopFailed = false;
  private locked = false;
  private lockFlight: Promise<boolean> | null = null;
  private destinationFlight: Promise<DurableSwitchResult> | null = null;
  private destination: (() => Promise<void>) | null = null;
  constructor(private readonly stopCurrent: () => void, private readonly lockCurrent: () => Promise<boolean>) {}

  switchTo(next: () => Promise<void>): Promise<DurableSwitchResult> {
    if (this.destinationFlight) return this.destinationFlight;
    if (this.stopFailed) return Promise.resolve('logout_incomplete');
    // The last request made before durable lock wins. Once destination work starts,
    // later requests only observe that same result and cannot launch a stale callback.
    this.destination = next;
    if (!this.stopped) {
      this.stopped = true;
      try { this.stopCurrent(); }
      catch { this.stopFailed = true; return Promise.resolve('logout_incomplete'); }
    }
    if (this.locked) return this.finish();
    if (!this.lockFlight) {
      const flight = Promise.resolve().then(() => this.lockCurrent()).then(Boolean, () => false);
      this.lockFlight = flight;
      void flight.finally(() => { if (this.lockFlight === flight) this.lockFlight = null; });
    }
    return this.lockFlight.then(locked => {
      if (!locked) return 'logout_incomplete';
      this.locked = true;
      return this.finish();
    });
  }

  private finish(): Promise<DurableSwitchResult> {
    if (this.destinationFlight) return this.destinationFlight;
    const chosen = this.destination;
    this.destination = null;
    // A destination callback can partially run before throwing. It is never replayed
    // automatically; the durable old-account lock remains and the caller reconciles.
    this.destinationFlight = Promise.resolve().then(() => chosen?.()).then(() => 'complete' as const, () => 'destination_failed' as const);
    return this.destinationFlight;
  }
}
