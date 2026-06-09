import type { GameState, GameConfig, Tile, FallingTile, ClearEvent, Wave, GameMode } from './types';
import { createWell, dropTile, clearCells, columnHeight, isColumnFull } from './board';
import { findKluxes, collectClearPositions } from './matcher';
import { canCatch, catchTile, dropTop, movePaddle } from './paddle';
import { scoreLines, waveClearBonus } from './scoring';
import { getWave, spawnIntervalMs, travelMs } from './waves';
import { nextInt, createRng } from './rng';
import type { Command } from './commands';
import { buildConfig } from '../config';

let _nextId = 1;

function newTile(color: number, type: Tile['type'] = 'normal'): Tile {
  return { id: _nextId++, color, type };
}

/** The "speed tier" driving spawn cadence and music tempo. Classic uses the
 *  wave index; endless ramps once every 10 KLUXes so the player feels gradual
 *  acceleration without any wave structure. */
export function speedTier(state: GameState): number {
  return state.mode === 'endless' ? Math.floor(state.kluxCount / 10) : state.wave.index;
}

function spawnTile(state: GameState): GameState {
  const { config, rng } = state;

  let tileType: Tile['type'] = 'normal';
  let vsNegativeCount = state.vsNegativeCount;

  if (state.totalTilesFed >= 20) {
    // Roll for special type in priority order (rarest first)
    const roll = Math.random();
    let cumulative = 0;
    tileType =
      roll < (cumulative += config.wildChance)    ? 'wild'     :
      roll < (cumulative += config.lockedChance)  ? 'locked'   :
      roll < (cumulative += config.doubleChance)  ? 'double'   :
      roll < (cumulative += config.negativeChance)? 'negative' :
      'normal';

    // VS power 4: opponent cursed the next N tiles to be negative
    if (vsNegativeCount > 0 && tileType === 'normal') {
      tileType = 'negative';
      vsNegativeCount--;
    }
  }

  const tile = newTile(nextInt(rng, 0, config.colorCount), tileType);
  const lane = nextInt(rng, 0, config.cols);
  const falling: FallingTile = { tile, lane, progress: 0 };

  // Spawn tier: classic ramps per wave, endless/versus ramp per tiles fed.
  // VS uses tiles-fed so the pace escalates naturally during a match.
  const tier = state.mode === 'classic'
    ? state.wave.index
    : Math.floor(state.tilesFedThisWave / 15);
  const interval = spawnIntervalMs(
    tier,
    config.baseSpawnMs,
    config.minSpawnMs,
    config.spawnStepPerWave,
  );

  return {
    ...state,
    conveyor: [...state.conveyor, falling],
    tilesFedThisWave: state.tilesFedThisWave + 1,
    totalTilesFed: state.totalTilesFed + 1,
    vsNegativeCount,
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

    const newScore = Math.max(0, current.score + points);
    // VS: positive KLUXes charge the power meter; negative ones drain it
    const newPower = current.mode === 'versus'
      ? Math.max(0, Math.min(6000, current.vsPowerMeter + points))
      : current.vsPowerMeter;
    current = {
      ...current,
      well: clearCells(current.well, positions),
      score: newScore,
      waveProgress: goal === 'SCORE' ? newScore : progress,
      kluxCount: current.kluxCount + lines.length,
      vsPowerMeter: newPower,
    };
  }

  if (allClears.length === 0) return current;

  // Classic only: check the wave goal and transition. Endless never breaks.
  let next = current;
  if (
    current.mode === 'classic' &&
    current.waveProgress >= current.wave.target &&
    current.phase === 'playing'
  ) {
    const bonus = waveClearBonus(current.dropsRemaining, current.config.scoring);
    next = { ...current, phase: 'waveClear', score: current.score + bonus };
  }

  return {
    ...next,
    fx: {
      ...next.fx,
      clears: [...next.fx.clears, ...allClears],
      chainStep,
    },
  };
}

function applyCommand(state: GameState, cmd: Command): GameState {
  if (cmd.type === 'START_CLASSIC' && (state.phase === 'title' || state.phase === 'gameOver')) {
    return startGame(buildConfig(cmd.difficulty), 'classic');
  }
  if (cmd.type === 'START_ENDLESS' && (state.phase === 'title' || state.phase === 'gameOver')) {
    return startGame(buildConfig(cmd.difficulty), 'endless');
  }
  if (cmd.type === 'START_VS') {
    return startGame({ ...buildConfig(cmd.difficulty), seed: cmd.seed }, 'versus');
  }
  if (cmd.type === 'QUIT_TO_TITLE') {
    return { ...startGame(state.config), phase: 'title' };
  }

  // VS effects injected by opponent's power use
  if (cmd.type === 'VS_WIN') {
    return { ...state, phase: 'gameOver', vsWon: true };
  }
  if (cmd.type === 'FIRE_POWER' && state.mode === 'versus') {
    return { ...state, vsPowerMeter: 0 };
  }
  if (cmd.type === 'VS_LOCKED' && state.phase === 'playing') {
    const lane = nextInt(state.rng, 0, state.config.cols);
    const tile = newTile(nextInt(state.rng, 0, state.config.colorCount), 'locked');
    return { ...state, conveyor: [...state.conveyor, { tile, lane, progress: 0 }] };
  }
  if (cmd.type === 'VS_EXTRA_SPAWN' && state.phase === 'playing') {
    // Inject an extra tile immediately without disturbing the normal spawn rhythm
    const { config, rng } = state;
    let vsNegativeCount = state.vsNegativeCount;
    let tileType: Tile['type'] = 'normal';
    if (state.totalTilesFed >= 20 && vsNegativeCount > 0) { tileType = 'negative'; vsNegativeCount--; }
    const tile = newTile(nextInt(rng, 0, config.colorCount), tileType);
    const lane = nextInt(rng, 0, config.cols);
    const falling: FallingTile = { tile, lane, progress: 0 };
    return { ...state, conveyor: [...state.conveyor, falling], vsNegativeCount, tilesFedThisWave: state.tilesFedThisWave + 1, totalTilesFed: state.totalTilesFed + 1 };
  }
  if (cmd.type === 'VS_SPEED_BOOST' && state.phase === 'playing') {
    return { ...state, vsSpeedBoost: 10_000 };
  }
  if (cmd.type === 'VS_NEGATIVE_TILES' && state.phase === 'playing') {
    return { ...state, vsNegativeCount: 3 };
  }
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
    case 'START_CLASSIC':
    case 'START_ENDLESS':
      return state; // handled above
    default:
      return state;
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
  let next: GameState = { ...state, paddle: remaining, well: newWell, fx: { ...state.fx, tileDropped: true } };

  // Update SURVIVE goal progress (classic only — endless has no waves to clear)
  if (state.mode === 'classic' && state.wave.goal === 'SURVIVE') {
    next = { ...next, waveProgress: state.waveProgress + 1 };
    if (next.waveProgress >= next.wave.target) {
      const bonus = waveClearBonus(next.dropsRemaining, next.config.scoring);
      next = { ...next, phase: 'waveClear', score: next.score + bonus };
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
    return startGame(state.config, 'classic');
  }
  if (state.phase === 'waveClear') {
    return startWave(state, state.wave.index + 1);
  }
  if (state.phase === 'gameOver') {
    return startGame(state.config, state.mode);
  }
  return state;
}

function startWave(state: GameState, waveIndex: number): GameState {
  const wave: Wave = getWave(waveIndex);
  return {
    ...state,
    phase: 'playing',
    well: createWell(state.config),  // clear the board between waves
    paddle: [],                       // clear the paddle stack too
    wave,
    waveProgress: 0,
    tilesFedThisWave: 0,
    spawnTimer: spawnIntervalMs(waveIndex, state.config.baseSpawnMs, state.config.minSpawnMs, state.config.spawnStepPerWave),
    conveyor: [],
    fx: { clears: [], chainStep: 0, caught: false, tileDropped: false },
  };
}

export function startGame(config: GameConfig, mode: GameMode = 'classic'): GameState {
  const rng = createRng(config.seed ?? Date.now());
  const wave = getWave(0);
  return {
    config,
    phase: 'playing',
    mode,
    well: createWell(config),
    paddle: [],
    paddleLane: Math.floor(config.cols / 2),
    conveyor: [],
    score: 0,
    dropsRemaining: config.maxDrops,
    wave,
    waveProgress: 0,
    tilesFedThisWave: 0,
    totalTilesFed: 0,
    nextTileId: 1,
    spawnTimer: config.baseSpawnMs,
    rng,
    fx: { clears: [], chainStep: 0, caught: false, tileDropped: false },
    kluxCount: 0,
    vsPowerMeter:    0,
    vsSpeedBoost:    0,
    vsNegativeCount: 0,
    vsWon:           false,
  };
}

/** Pure reducer: (state, dtMs, commands) → next state. No I/O. */
export function step(state: GameState, dtMs: number, commands: Command[]): GameState {
  if (state.phase !== 'playing') {
    // Clear transient FX so sounds don't loop while game is paused/over
    let s: GameState = { ...state, fx: { clears: [], chainStep: 0, lastFoul: undefined, caught: false, tileDropped: false } };
    for (const cmd of commands) s = applyCommand(s, cmd);
    return s;
  }

  // Clear transient FX from previous frame
  let s: GameState = { ...state, fx: { clears: [], chainStep: 0, lastFoul: undefined, caught: false, tileDropped: false } };

  // Apply commands first
  for (const cmd of commands) {
    s = applyCommand(s, cmd);
    if (s.phase !== 'playing') return s;
  }

  // Spawn before advancing so the new tile is included in this frame's conveyor pass
  // Speed boost (level 3 curse) doubles both spawn rate and tile travel speed.
  let vsSpeedBoost = s.vsSpeedBoost;
  const speedMultiplier = vsSpeedBoost > 0 ? 2 : 1;
  let spawnTimer = s.spawnTimer - dtMs * speedMultiplier;
  if (spawnTimer <= 0) {
    s = spawnTile({ ...s, spawnTimer: 0 });
    spawnTimer = s.spawnTimer;
  }

  // Advance conveyor — double speed during VS speed boost
  const travel = travelMs(s.tilesFedThisWave, s.config.baseTravelMs, s.config.minTravelMs, s.config.rampPerTile);
  const effectiveTravelMs = vsSpeedBoost > 0 ? travel / 2 : travel;
  if (vsSpeedBoost > 0) vsSpeedBoost = Math.max(0, vsSpeedBoost - dtMs);
  const progressDelta = dtMs / effectiveTravelMs;

  const nextConveyor: FallingTile[] = [];
  let drops = s.dropsRemaining;
  let paddle = s.paddle;
  let foul: GameState['fx']['lastFoul'] = s.fx.lastFoul;
  let caught = false;

  for (const ft of s.conveyor) {
    const newProgress = ft.progress + progressDelta;
    if (newProgress >= 1) {
      if (ft.lane === s.paddleLane && canCatch(paddle, s.config)) {
        paddle = catchTile(paddle, ft.tile);
        caught = true;
      } else {
        drops--;
        foul = 'missed';
      }
    } else {
      nextConveyor.push({ ...ft, progress: newProgress });
    }
  }

  // SURVIVE goal: count tiles fed (classic only)
  let waveProgress = s.waveProgress;
  if (s.mode === 'classic' && s.wave.goal === 'SURVIVE') {
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
    vsSpeedBoost,
    fx: { ...s.fx, lastFoul: foul, caught },
    phase: gameOver ? 'gameOver' : s.phase,
  };

  if (s.mode === 'classic' && s.wave.goal === 'SURVIVE' && s.waveProgress >= s.wave.target) {
    const bonus = waveClearBonus(s.dropsRemaining, s.config.scoring);
    s = { ...s, phase: 'waveClear', score: s.score + bonus };
  }

  return s;
}

export function columnHeightFromState(state: GameState, col: number): number {
  return columnHeight(state.well, col);
}
