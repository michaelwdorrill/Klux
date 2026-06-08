import type { Wave, GoalType } from './types';

const WAVE_SEQUENCE: Array<{ goal: GoalType; baseTarget: number }> = [
  { goal: 'KLUXES', baseTarget: 3 },
  { goal: 'SCORE', baseTarget: 5000 },
  { goal: 'HORIZONTALS', baseTarget: 3 },
  { goal: 'DIAGONALS', baseTarget: 2 },
  { goal: 'SURVIVE', baseTarget: 20 },
  { goal: 'KLUXES', baseTarget: 5 },
  { goal: 'SCORE', baseTarget: 15000 },
  { goal: 'DIAGONALS', baseTarget: 4 },
];

export function getWave(index: number): Wave {
  const template = WAVE_SEQUENCE[index % WAVE_SEQUENCE.length];
  const tier = Math.floor(index / WAVE_SEQUENCE.length);
  // Scale targets each full cycle through the sequence
  const scale = 1 + tier * 0.5;
  return {
    index,
    goal: template.goal,
    target: Math.round(template.baseTarget * scale),
  };
}

export function spawnIntervalMs(waveIndex: number, baseSpawnMs: number, minSpawnMs: number, spawnStepPerWave: number): number {
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
