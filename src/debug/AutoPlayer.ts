import type { GameState } from '../core/types';
import type { Command } from '../core/commands';

// Color index → preferred column
// 0=red→0, 1=blue→1, 2=green→2, 3=orange→4, 4=purple→3
const COLOR_COL: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 3 };

export class AutoPlayer {
  enabled = false;
  private timer = 0;
  private readonly INTERVAL = 140; // ms between actions

  toggle(): void { this.enabled = !this.enabled; }

  /** Call each frame; returns a command to inject (or null). */
  tick(dtMs: number, state: GameState): Command | null {
    if (!this.enabled || state.phase !== 'playing') return null;

    this.timer -= dtMs;
    if (this.timer > 0) return null;
    this.timer = this.INTERVAL;

    // Priority 1: if paddle has tiles, move to color column and drop
    if (state.paddle.length > 0) {
      const top = state.paddle[state.paddle.length - 1];
      const target = COLOR_COL[top.color] ?? 0;
      if (state.paddleLane < target) return { type: 'MOVE_RIGHT' };
      if (state.paddleLane > target) return { type: 'MOVE_LEFT' };
      return { type: 'DROP' };
    }

    // Priority 2: move to intercept the tile closest to landing
    if (state.conveyor.length > 0) {
      const next = state.conveyor.reduce((best, ft) =>
        ft.progress > best.progress ? ft : best, state.conveyor[0]);
      if (state.paddleLane < next.lane) return { type: 'MOVE_RIGHT' };
      if (state.paddleLane > next.lane) return { type: 'MOVE_LEFT' };
    }

    return null;
  }
}
