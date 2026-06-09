import type { GameConfig } from './core/types';
import type { Difficulty } from './core/types';

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
  minTravelMs: 900,     // floor — keeps late waves reactable while goals carry the curve
  rampPerTile: 8,       // ms reduction per tile fed this wave (gentler within-wave ramp)

  // Time between tile spawns — decreases each wave
  baseSpawnMs: 2200,    // one tile every 2.2s on wave 1
  minSpawnMs: 700,      // floor: about one tile every 0.7s on late waves
  spawnStepPerWave: 80, // gentler — wave 5 ≈ 1800ms, wave 10 ≈ 1400ms, wave 20 ≈ 700ms

  wildChance:     0.01,  // 1-in-100: matches any color
  doubleChance:   0.04,  // 1-in-25:  doubles score of any KLUX it's in
  lockedChance:   0.02,  // 1-in-50:  blocks runs; unlocked by adjacent KLUX
  negativeChance: 0.025, // 1-in-40:  subtracts score of any KLUX it's in

  // Klax arcade manual values: [3-tile, 4-tile, 5-tile]
  scoring: {
    vertical:         [50,  1000, 1500],
    horizontal:       [100,  500, 1000],
    diagonal:         [500, 1000, 1500],
    waveClearPerDrop: 1000,
  },
  difficulty: 'normal',
};

export function buildConfig(difficulty: Difficulty = 'normal'): GameConfig {
  const mult = difficulty === 'elite' ? 1.40 : difficulty === 'hard' ? 1.25 : 1.0;
  const colorCount = difficulty === 'elite' ? 7 : difficulty === 'hard' ? 6 : 5;
  const base: GameConfig = {
    ...DEFAULT_CONFIG,
    colorCount,
    difficulty,
    spawnStepPerWave: Math.round(DEFAULT_CONFIG.spawnStepPerWave * mult),
    rampPerTile: DEFAULT_CONFIG.rampPerTile * mult,
  };
  if (difficulty === 'elite') {
    return {
      ...base,
      wildChance:     DEFAULT_CONFIG.wildChance     * 0.5,   // 0.005
      doubleChance:   DEFAULT_CONFIG.doubleChance   * 0.5,   // 0.02
      negativeChance: DEFAULT_CONFIG.negativeChance * 1.2,   // 0.03
      lockedChance:   DEFAULT_CONFIG.lockedChance   * 1.2,   // 0.024
    };
  }
  return base;
}
