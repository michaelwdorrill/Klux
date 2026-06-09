const API = 'https://klux-api.michaelwdorrill.workers.dev';

export interface VsEvent {
  id:      number;
  player:  'a' | 'b';
  type:    string;
  payload: Record<string, unknown>;
  ts:      number;
}

export class VsClient {
  matchId  = '';
  player:    'a' | 'b' = 'a';
  private lastEventId = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Latest opponent board state received via 'board' events. */
  opponentWell: number[][] = [];  // [row][col] = color index or -1
  opponentDrops = -1;             // -1 = not yet received
  opponentPower = 0;
  /** Total board events received — shown on opponent panel for debugging. */
  boardEventCount = 0;

  /** Opponent's display name — set from 'ready' events. */
  opponentName = '';

  /** Called for every non-board event that arrives from the opponent. */
  onEvent: (ev: VsEvent) => void = () => {};
  /** Called when no opponent events arrive for ~8 s after the first board sync. */
  onStaleDisconnect: () => void = () => {};

  private lastOpponentEventAt = 0;
  private stalePollCount = 0;

  async create(): Promise<{ id: string; seed: number; player: 'a' }> {
    const r = await fetch(`${API}/vs/create`, { method: 'POST' });
    if (!r.ok) throw new Error('create failed');
    const data = await r.json() as { id: string; seed: number; player: 'a' };
    this.matchId = data.id;
    this.player  = 'a';
    this.reset();
    return data;
  }

  async join(id: string): Promise<{ id: string; seed: number; player: 'b' }> {
    const r = await fetch(`${API}/vs/join/${id.toUpperCase()}`, { method: 'POST' });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json() as { id: string; seed: number; player: 'b' };
    this.matchId = data.id;
    this.player  = 'b';
    this.reset();
    return data;
  }

  fire(level: number): void {
    this.postEvent('power', { level });
  }

  gameover(score: number): void {
    this.postEvent('gameover', { score });
    this.stopPolling();
  }

  disconnect(): void {
    this.postEvent('disconnect', {});
    this.stopPolling();
  }

  /** Send a compact snapshot of the local board so the opponent can render it. */
  sendBoard(well: number[][], drops: number, power: number): void {
    this.postEvent('board', { well, drops, power });
  }

  sendReady(name: string, difficulty: string): void {
    this.postEvent('ready', { name, difficulty });
  }

  startPolling(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = setInterval(() => { this.poll().catch(() => {}); }, 1000);
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private reset(): void {
    this.lastEventId = 0;
    this.opponentWell = [];
    this.opponentDrops = -1;
    this.opponentPower = 0;
    this.boardEventCount = 0;
    this.lastOpponentEventAt = 0;
    this.stalePollCount = 0;
    this.opponentName = '';
  }

  private async poll(): Promise<void> {
    const r = await fetch(
      `${API}/vs/poll/${this.matchId}?since=${this.lastEventId}`,
    );
    const events = await r.json() as VsEvent[];
    let gotOpponentEvent = false;
    for (const ev of events) {
      this.lastEventId = Math.max(this.lastEventId, ev.id);
      if (ev.player === this.player) continue;
      gotOpponentEvent = true;
      // Worker stores payload as a JSON string in D1; parse it back if needed
      if (typeof ev.payload === 'string') {
        try { ev.payload = JSON.parse(ev.payload); } catch { /* leave as-is */ }
      }
      if (ev.type === 'board') {
        const p = ev.payload as { well: number[][]; drops: number; power: number };
        this.opponentWell  = Array.isArray(p.well) ? p.well : [];
        this.opponentDrops = typeof p.drops === 'number' ? p.drops : -1;
        this.opponentPower = p.power ?? 0;
        this.boardEventCount++;
      } else if (ev.type === 'ready') {
        const p = ev.payload as { name?: string; difficulty?: string };
        if (p.name) this.opponentName = p.name;
        this.onEvent(ev);
      } else {
        this.onEvent(ev);
      }
    }

    // Stale-disconnect detection: after first board sync, if 8 consecutive
    // polls return no opponent events, the opponent has likely disconnected.
    if (this.lastOpponentEventAt === 0 && this.boardEventCount > 0) {
      this.lastOpponentEventAt = Date.now();
    }
    if (gotOpponentEvent) {
      this.stalePollCount = 0;
    } else if (this.lastOpponentEventAt > 0) {
      this.stalePollCount++;
      if (this.stalePollCount >= 8) {
        this.stalePollCount = 0;
        this.onStaleDisconnect();
      }
    }
  }

  private postEvent(type: string, payload: Record<string, unknown>): void {
    fetch(`${API}/vs/event/${this.matchId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ player: this.player, type, payload }),
    }).catch(() => {});
  }
}
