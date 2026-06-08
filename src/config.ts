import type { GameConfig } from './core/types';

export const DEFAULT_CONFIG: GameConfig = {
  cols: 5,
  rows: 5,
  colorCount: 5,
  paddleCapacity: 5,
  maxDrops: 3,
  minRun: 3,

  // Tile travel time from top of conveyor to paddle lip.
  // Decreases within a wave as more tiles are fed (rampPerTile), and between
  // waves via shorter spawn intervals (spawnStepPerWave).
  baseTravelMs: 3500,   // generous on wave 1 — gives time to learn the controls
  minTravelMs: 750,     // maximum speed reached deep into late waves
  rampPerTile: 12,      // ms reduction per tile fed this wave (gentle within-wave ramp)

  // Time between tile spawns — decreases each wave
  baseSpawnMs: 2200,    // one tile every 2.2s on wave 1
  minSpawnMs: 550,      // floor: one tile every 0.55s on late waves
  spawnStepPerWave: 110,// ms reduction per wave (wave 5 ≈ 1650ms, wave 10 ≈ 1100ms)

  scoring: {
    horizontal: 1000,
    vertical: 1000,
    diagonal: 5000,
    extraTile: 1000,
    bigKluxBonus: 5000,
    waveClearPerDrop: 1000,
  },
};
