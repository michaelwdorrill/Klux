export type Color = number; // 0..colorCount-1

export interface ScoringConfig {
  horizontal: number;
  vertical: number;
  diagonal: number;
  extraTile: number;
  bigKluxBonus: number;
  waveClearPerDrop: number;
}

export interface GameConfig {
  cols: number;
  rows: number;
  colorCount: number;
  paddleCapacity: number;
  maxDrops: number;
  minRun: number;

  baseTravelMs: number;
  minTravelMs: number;
  rampPerTile: number;
  baseSpawnMs: number;
  minSpawnMs: number;
  spawnStepPerWave: number;

  scoring: ScoringConfig;
  seed?: number;
}

export interface Tile {
  id: number;
  color: Color;
}

export type Cell = Tile | null;
export type Well = Cell[][]; // well[row][col]; row 0 = bottom

export interface FallingTile {
  tile: Tile;
  lane: number;   // 0..cols-1
  progress: number; // 0 (top) → 1 (at lip)
}

export type GoalType = 'SCORE' | 'KLUXES' | 'HORIZONTALS' | 'DIAGONALS' | 'SURVIVE';

export interface Wave {
  index: number;
  goal: GoalType;
  target: number;
}

export type Phase = 'title' | 'playing' | 'waveClear' | 'paused' | 'gameOver';

export interface KluxLine {
  tiles: Array<{ row: number; col: number }>;
  orientation: 'horizontal' | 'vertical' | 'diagonal';
}

export interface ClearEvent {
  lines: KluxLine[];
  chainStep: number;
  points: number;
}

export interface RngState {
  seed: number;
}

export interface FxState {
  clears: ClearEvent[];
  chainStep: number;
  lastFoul?: 'fullColumn' | 'missed';
  caught: boolean;  // true if at least one tile was caught this step
}

export interface GameState {
  config: GameConfig;
  phase: Phase;
  well: Well;
  paddle: Tile[];       // index 0 = bottom, last = top
  paddleLane: number;
  conveyor: FallingTile[];
  score: number;
  dropsRemaining: number;
  wave: Wave;
  waveProgress: number; // toward wave.target
  tilesFedThisWave: number;
  nextTileId: number;
  spawnTimer: number;   // ms until next spawn
  rng: RngState;
  fx: FxState;
}
