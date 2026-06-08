import type { Wave, GoalType } from './types';

// Arcade-faithful 5-wave cycle:
//   5X+1 KLAXES, 5X+2 DIAGONAL, 5X+3 TILE (survive), 5X+4 POINTS, 5X+5 HORIZONTAL
// Each cycle scales the base targets up so the difficulty curve is goal-driven,
// not just speed-driven.
const WAVE_SEQUENCE: Array<{ goal: GoalType; baseTarget: number }> = [
  { goal: 'KLUXES',      baseTarget: 3 },     // wave 1 — get 3 klaxes
  { goal: 'DIAGONALS',   baseTarget: 1 },     // wave 2 — get 1 diagonal
  { goal: 'SURVIVE',     baseTarget: 25 },    // wave 3 — survive 25 tiles
  { goal: 'SCORE',       baseTarget: 5000 },  // wave 4 — score 5,000
  { goal: 'HORIZONTALS', baseTarget: 3 },     // wave 5 — get 3 horizontals
];

export function getWave(index: number): Wave {
  const template = WAVE_SEQUENCE[index % WAVE_SEQUENCE.length];
  const tier = Math.floor(index / WAVE_SEQUENCE.length);
  const scale = 1 + tier * 0.5; // +50% per cycle
  return {
    index,
    goal: template.goal,
    target: Math.round(template.baseTarget * scale),
  };
}

export function spawnIntervalMs(
  waveIndex: number,
  baseSpawnMs: number,
  minSpawnMs: number,
  spawnStepPerWave: number
): number {
  return Math.max(minSpawnMs, baseSpawnMs - waveIndex * spawnStepPerWave);
}

export function travelMs(
  tilesFedThisWave: number,
  baseTravelMs: number,
  minTravelMs: number,
  rampPerTile: number
): number {
  return Math.max(minTravelMs, baseTravelMs - rampPerTile * tilesFedThisWave);
}
