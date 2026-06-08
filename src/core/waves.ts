import type { Wave, GoalType } from './types';

// Each wave has a goal type and base target. Targets scale each cycle.
const WAVE_SEQUENCE: Array<{ goal: GoalType; baseTarget: number }> = [
  { goal: 'KLUXES',      baseTarget: 2  }, // wave 1 — learn the controls
  { goal: 'SCORE',       baseTarget: 3000 },
  { goal: 'HORIZONTALS', baseTarget: 2  },
  { goal: 'KLUXES',      baseTarget: 4  },
  { goal: 'SURVIVE',     baseTarget: 18 },
  { goal: 'DIAGONALS',   baseTarget: 1  }, // diagonals first appear late wave 1 cycle
  { goal: 'SCORE',       baseTarget: 8000 },
  { goal: 'DIAGONALS',   baseTarget: 3  },
];

export function getWave(index: number): Wave {
  const template = WAVE_SEQUENCE[index % WAVE_SEQUENCE.length];
  const tier = Math.floor(index / WAVE_SEQUENCE.length);
  const scale = 1 + tier * 0.6;
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
