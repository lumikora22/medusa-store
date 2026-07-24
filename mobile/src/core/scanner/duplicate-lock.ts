export class DuplicateScanLock {
  private readonly scans = new Map<string, number>();

  constructor(private readonly lockMs = 1500) {}

  accept(value: string, timestamp = Date.now()): boolean {
    const code = value.trim().toUpperCase();
    const previous = this.scans.get(code);
    if (previous !== undefined && timestamp - previous < this.lockMs) return false;
    this.scans.set(code, timestamp);
    for (const [key, time] of this.scans) {
      if (timestamp - time > this.lockMs * 4) this.scans.delete(key);
    }
    return true;
  }

  clear(): void {
    this.scans.clear();
  }
}
