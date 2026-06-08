export type Color = number; // 0..colorCount-1
export type TileType = 'normal' | 'wild' | 'double';

/**
 * Per-orientation score tables indexed by run length:
 *   index 0 → 3 tiles, index 1 → 4 tiles, index 2 → 5 tiles
 * Matches original Klax arcade manual values.
 */
export interface ScoringConfig {
  vertical:         [number, number, number]; // 50 / 1 000 / 1 500
  horizontal:       [number, number, number]; // 100 / 500 / 1 000
  diagonal:         [number, number, number]; // 500 / 1 000 / 1 500
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
  wildChance:   number; // probability a spawned tile is wild   (e.g. 0.01)
  doubleChance: number; // probability a spawned tile is double (e.g. 0.04)
  seed?: number;
}

export interface Tile {
  id: number;
  color: Color;
  type: TileType;
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

export type GameMode = 'classic' | 'endless';

export interface KluxLine {
  tiles: Array<{ row: number; col: number }>;
  orientation: 'horizontal' | 'vertical' | 'diagonal';
  color: Color;
  doubled: boolean; // true if any tile in the line is type 'double'
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
  mode: GameMode;
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
  /** Total KLUX lines made — drives the speed tier in endless mode. */
  kluxCount: number;
}
