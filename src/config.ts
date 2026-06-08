import type { GameConfig } from './core/types';

export const DEFAULT_CONFIG: GameConfig = {
  cols: 5,
  rows: 5,
  colorCount: 5,
  paddleCapacity: 5,
  maxDrops: 3,
  minRun: 3,

  baseTravelMs: 3000,
  minTravelMs: 800,
  rampPerTile: 20,
  baseSpawnMs: 1800,
  minSpawnMs: 600,
  spawnStepPerWave: 80,

  scoring: {
    horizontal: 1000,
    vertical: 1000,
    diagonal: 5000,
    extraTile: 1000,
    bigKluxBonus: 5000,
    waveClearPerDrop: 1000,
  },
};
