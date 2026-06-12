const MAX_OUTSTANDING = 2;
const MAX_RTT_MS = 2000;

type Challenge = { id: number; sentAt: number };

/**
 * Server-owned ping tokens. The client echoes only the id.
 * RTT is now - stored send time. The client cannot pick the timestamp.
 */
export class RttChallengeBook {
  private nextId = 1;
  private pending = new Map<string, Challenge[]>();

  issue(sessionId: string, sentAt: number): number {
    const id = this.nextId++;
    const list = this.pending.get(sessionId) ?? [];
    list.push({ id, sentAt });
    while (list.length > MAX_OUTSTANDING) {
      list.shift();
    }
    this.pending.set(sessionId, list);
    return id;
  }

  /** Valid echo returns RTT in ms. Unknown, replayed, or stale ids return null. */
  take(sessionId: string, challengeId: number, now: number): number | null {
    if (!Number.isFinite(challengeId) || challengeId <= 0) return null;
    const list = this.pending.get(sessionId);
    if (!list) return null;
    const idx = list.findIndex((c) => c.id === challengeId);
    if (idx < 0) return null;
    const [entry] = list.splice(idx, 1);
    this.pending.set(sessionId, list);
    const rtt = now - entry.sentAt;
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > MAX_RTT_MS) return null;
    return rtt;
  }

  clear(sessionId: string): void {
    this.pending.delete(sessionId);
  }
}
