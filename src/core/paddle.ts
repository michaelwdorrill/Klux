import type { Tile, GameConfig } from './types';

export function canCatch(paddle: Tile[], config: GameConfig): boolean {
  return paddle.length < config.paddleCapacity;
}

export function catchTile(paddle: Tile[], tile: Tile): Tile[] {
  return [...paddle, tile];
}

export function dropTop(paddle: Tile[]): { tile: Tile; remaining: Tile[] } | null {
  if (paddle.length === 0) return null;
  const tile = paddle[paddle.length - 1];
  return { tile, remaining: paddle.slice(0, -1) };
}

export function peekTop(paddle: Tile[]): Tile | null {
  return paddle.length > 0 ? paddle[paddle.length - 1] : null;
}

export function movePaddle(lane: number, delta: number, cols: number): number {
  return Math.max(0, Math.min(cols - 1, lane + delta));
}
