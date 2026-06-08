import type { RngState } from './types';

// Mulberry32 — fast, seedable, good distribution
function mulberry32(state: RngState): number {
  let t = (state.seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
}

export function nextFloat(state: RngState): number {
  return mulberry32(state);
}

export function nextInt(state: RngState, min: number, max: number): number {
  return min + Math.floor(mulberry32(state) * (max - min));
}

export function createRng(seed: number): RngState {
  return { seed };
}
