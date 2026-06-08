import type { GameState, GameConfig, Tile, FallingTile, ClearEvent, Wave } from './types';
import { createWell, dropTile, clearCells, columnHeight, isColumnFull } from './board';
import { findKluxes, collectClearPositions } from './matcher';
import { canCatch, catchTile, dropTop, movePaddle } from './paddle';
import { scoreLines, waveClearBonus } from './scoring';
import { getWave, spawnIntervalMs, travelMs } from './waves';
import { nextInt, createRng } from './rng';
import type { Command } from './commands';

let _nextId = 1;

function newTile(color: number): Tile {
  return { id: _nextId++, color };
}

function spawnTile(state: GameState): GameState {
  const { config, rng } = state;
  const tile = newTile(nextInt(rng, 0, config.colorCount));
  const lane = nextInt(rng, 0, config.cols);
  const falling: FallingTile = { tile, lane, progress: 0 };
  const interval = spawnIntervalMs(
    state.wave.index,
    config.baseSpawnMs,
    config.minSpawnMs,
    config.spawnStepPerWave
  );
  return {
    ...state,
    conveyor: [...state.conveyor, falling],
    tilesFedThisWave: state.tilesFedThisWave + 1,
    spawnTimer: interval,
  };
}

/** Run match detection → clear → gravity → chain loop. Returns updated state with fx. */
function resolveMatches(state: GameState): GameState {
  let current = state;
  let chainStep = 0;
  const allClears: ClearEvent[] = [];

  while (true) {
    const lines = findKluxes(current.well, current.config.minRun);
    if (lines.length === 0) break;

    chainStep++;
    const positions = collectClearPositions(lines);
    const points = scoreLines(lines, current.config.scoring, chainStep);
    const event: ClearEvent = { lines, chainStep, points };
    allClears.push(event);

    let progress = current.waveProgress;
    const goal = current.wave.goal;
    if (goal === 'KLUXES') progress += lines.length;
    else if (goal === 'HORIZONTALS') progress += lines.filter((l) => l.orientation === 'horizontal').length;
    else if (goal === 'DIAGONALS') progress += lines.filter((l) => l.orientation === 'diagonal').length;
    else if (goal === 'SCORE') progress = current.score + points;

    current = {
      ...current,
      well: clearCells(current.well, positions),
      score: current.score + points,
      waveProgress: goal === 'SCORE' ? current.score + points : progress,
    };
  }

  if (allClears.length === 0) return current;

  // Check wave goal
  let phase = current.phase;
  let score = current.score;
  if (current.waveProgress >= current.wave.target && current.phase === 'playing') {
    phase = 'waveClear';
    score += waveClearBonus(current.dropsRemaining, current.config.scoring);
  }

  return {
    ...current,
    score,
    phase,
    fx: {
      ...current.fx,
      clears: [...current.fx.clears, ...allClears],
      chainStep,
    },
  };
}

function applyCommand(state: GameState, cmd: Command): GameState {
  if (state.phase === 'waveClear' || state.phase === 'gameOver' || state.phase === 'title') {
    if (cmd.type === 'CONFIRM') return handleConfirm(state);
    return state;
  }
  if (state.phase === 'paused') {
    if (cmd.type === 'PAUSE_TOGGLE' || cmd.type === 'CONFIRM') {
      return { ...state, phase: 'playing' };
    }
    return state;
  }

  switch (cmd.type) {
    case 'MOVE_LEFT':
      return { ...state, paddleLane: movePaddle(state.paddleLane, -1, state.config.cols) };
    case 'MOVE_RIGHT':
      return { ...state, paddleLane: movePaddle(state.paddleLane, +1, state.config.cols) };
    case 'MOVE_TO':
      return { ...state, paddleLane: Math.max(0, Math.min(state.config.cols - 1, cmd.lane)) };
    case 'DROP':
      return handleDrop(state);
    case 'FLIP':
      return handleFlip(state);
    case 'PAUSE_TOGGLE':
      return { ...state, phase: 'paused' };
    case 'CONFIRM':
      return handleConfirm(state);
  }
}

function handleDrop(state: GameState): GameState {
  const result = dropTop(state.paddle);
  if (result === null) return state; // empty paddle — no-op

  const { tile, remaining } = result;
  const col = state.paddleLane;

  if (isColumnFull(state.well, col)) {
    // Foul: column full
    const drops = state.dropsRemaining - 1;
    return {
      ...state,
      paddle: remaining,
      dropsRemaining: drops,
      phase: drops <= 0 ? 'gameOver' : 'playing',
      fx: { ...state.fx, lastFoul: 'fullColumn' },
    };
  }

  const newWell = dropTile(state.well, col, tile)!;
  let next: GameState = { ...state, paddle: remaining, well: newWell };

  // Update SURVIVE goal progress — count tiles dropped
  if (state.wave.goal === 'SURVIVE') {
    next = { ...next, waveProgress: state.waveProgress + 1 };
    if (next.waveProgress >= next.wave.target) {
      next = { ...next, phase: 'waveClear', score: next.score + waveClearBonus(next.dropsRemaining, next.config.scoring) };
    }
  }

  return resolveMatches(next);
}

function handleFlip(state: GameState): GameState {
  const result = dropTop(state.paddle);
  if (result === null) return state;

  const { tile, remaining } = result;
  const travel = travelMs(state.tilesFedThisWave, state.config.baseTravelMs, state.config.minTravelMs, state.config.rampPerTile);
  const flipped: FallingTile = { tile, lane: state.paddleLane, progress: 0 };
  // Flipped tile re-enters at progress 0 with current travel speed
  void travel;

  return { ...state, paddle: remaining, conveyor: [...state.conveyor, flipped] };
}

function handleConfirm(state: GameState): GameState {
  if (state.phase === 'title') {
    return startGame(state.config);
  }
  if (state.phase === 'waveClear') {
    return startWave(state, state.wave.index + 1);
  }
  if (state.phase === 'gameOver') {
    return startGame(state.config);
  }
  return state;
}

function startWave(state: GameState, waveIndex: number): GameState {
  const wave: Wave = getWave(waveIndex);
  return {
    ...state,
    phase: 'playing',
    wave,
    waveProgress: 0,
    tilesFedThisWave: 0,
    spawnTimer: spawnIntervalMs(waveIndex, state.config.baseSpawnMs, state.config.minSpawnMs, state.config.spawnStepPerWave),
    conveyor: [],
    fx: { clears: [], chainStep: 0 },
  };
}

export function startGame(config: GameConfig): GameState {
  const rng = createRng(config.seed ?? Date.now());
  const wave = getWave(0);
  return {
    config,
    phase: 'playing',
    well: createWell(config),
    paddle: [],
    paddleLane: Math.floor(config.cols / 2),
    conveyor: [],
    score: 0,
    dropsRemaining: config.maxDrops,
    wave,
    waveProgress: 0,
    tilesFedThisWave: 0,
    nextTileId: 1,
    spawnTimer: config.baseSpawnMs,
    rng,
    fx: { clears: [], chainStep: 0 },
  };
}

/** Pure reducer: (state, dtMs, commands) → next state. No I/O. */
export function step(state: GameState, dtMs: number, commands: Command[]): GameState {
  if (state.phase !== 'playing') {
    let s = state;
    for (const cmd of commands) s = applyCommand(s, cmd);
    return s;
  }

  // Clear transient FX from previous frame
  let s: GameState = { ...state, fx: { clears: [], chainStep: 0, lastFoul: undefined } };

  // Apply commands first
  for (const cmd of commands) {
    s = applyCommand(s, cmd);
    if (s.phase !== 'playing') return s;
  }

  // Advance conveyor
  const travel = travelMs(s.tilesFedThisWave, s.config.baseTravelMs, s.config.minTravelMs, s.config.rampPerTile);
  const progressDelta = dtMs / travel;

  const nextConveyor: FallingTile[] = [];
  let drops = s.dropsRemaining;
  let paddle = s.paddle;
  // Preserve any foul set by a command (e.g. fullColumn) — conveyor may add 'missed' on top
  let foul: GameState['fx']['lastFoul'] = s.fx.lastFoul;

  for (const ft of s.conveyor) {
    const newProgress = ft.progress + progressDelta;
    if (newProgress >= 1) {
      // Tile reached the lip
      if (ft.lane === s.paddleLane && canCatch(paddle, s.config)) {
        paddle = catchTile(paddle, ft.tile);
      } else {
        drops--;
        foul = 'missed';
      }
    } else {
      nextConveyor.push({ ...ft, progress: newProgress });
    }
  }

  // Spawn new tile?
  let spawnTimer = s.spawnTimer - dtMs;
  if (spawnTimer <= 0) {
    s = spawnTile({ ...s, spawnTimer: 0 });
    spawnTimer = s.spawnTimer;
  }

  // SURVIVE goal: count tiles fed
  let waveProgress = s.waveProgress;
  if (s.wave.goal === 'SURVIVE') {
    waveProgress = s.tilesFedThisWave;
  }

  const gameOver = drops <= 0 && foul !== undefined;

  s = {
    ...s,
    conveyor: nextConveyor,
    paddle,
    dropsRemaining: Math.max(0, drops),
    spawnTimer,
    waveProgress,
    fx: { ...s.fx, lastFoul: foul },
    phase: gameOver ? 'gameOver' : s.phase,
  };

  if (s.wave.goal === 'SURVIVE' && s.waveProgress >= s.wave.target) {
    s = { ...s, phase: 'waveClear', score: s.score + waveClearBonus(s.dropsRemaining, s.config.scoring) };
  }

  return s;
}

export function columnHeightFromState(state: GameState, col: number): number {
  return columnHeight(state.well, col);
}
