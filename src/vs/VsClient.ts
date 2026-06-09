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

  /** Called for every event that arrives from the opponent. */
  onEvent: (ev: VsEvent) => void = () => {};

  async create(): Promise<{ id: string; seed: number; player: 'a' }> {
    const r = await fetch(`${API}/vs/create`, { method: 'POST' });
    if (!r.ok) throw new Error('create failed');
    const data = await r.json() as { id: string; seed: number; player: 'a' };
    this.matchId = data.id;
    this.player  = 'a';
    return data;
  }

  async join(id: string): Promise<{ id: string; seed: number; player: 'b' }> {
    const r = await fetch(`${API}/vs/join/${id.toUpperCase()}`, { method: 'POST' });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json() as { id: string; seed: number; player: 'b' };
    this.matchId = data.id;
    this.player  = 'b';
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

  private async poll(): Promise<void> {
    const r = await fetch(
      `${API}/vs/poll/${this.matchId}?since=${this.lastEventId}`,
    );
    const events = await r.json() as VsEvent[];
    for (const ev of events) {
      this.lastEventId = Math.max(this.lastEventId, ev.id);
      if (ev.player !== this.player) this.onEvent(ev);
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
