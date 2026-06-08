import { describe, it, expect } from 'vitest';
import { startGame, step } from '../src/core/game';
import { DEFAULT_CONFIG } from '../src/config';
import type { GameConfig, GameState } from '../src/core/types';
import type { Command } from '../src/core/commands';

const config: GameConfig = {
  ...DEFAULT_CONFIG,
  seed: 42,
  baseTravelMs: 3000,
  baseSpawnMs: 9999999, // disable auto-spawn in most tests
};

function runCommands(state: GameState, commands: Command[]): GameState {
  return step(state, 16, commands);
}

function tick(state: GameState, n = 1): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = step(s, 16, []);
  return s;
}

describe('startGame', () => {
  it('creates a playing state', () => {
    const state = startGame(config);
    expect(state.phase).toBe('playing');
    expect(state.dropsRemaining).toBe(3);
    expect(state.score).toBe(0);
  });
});

describe('paddle catching', () => {
  it('does not catch if paddle is full', () => {
    const state = startGame({ ...config, paddleCapacity: 0 });
    expect(state.paddle.length).toBe(0);
  });
});

describe('DROP command', () => {
  it('drops the top tile into the well', () => {
    const state = startGame(config);
    // Manually put a tile on the paddle
    const withTile: GameState = { ...state, paddle: [{ id: 999, color: 0 }] };
    const after = runCommands(withTile, [{ type: 'DROP' }]);
    expect(after.paddle.length).toBe(0);
    // Tile should be in the well at the paddle lane, row 0
    const col = state.paddleLane;
    expect(after.well[0][col]).not.toBeNull();
  });

  it('full-column DROP costs a drop (foul)', () => {
    const s = startGame({ ...config, rows: 1 });
    // Fill col 2 (the default middle lane)
    const col = s.paddleLane;
    const filledWell = s.well.map((row) => [...row]);
    filledWell[0][col] = { id: 1, color: 0 };

    const withTile: GameState = {
      ...s,
      well: filledWell,
      paddle: [{ id: 2, color: 1 }],
    };
    const after = runCommands(withTile, [{ type: 'DROP' }]);
    expect(after.dropsRemaining).toBe(s.dropsRemaining - 1);
    expect(after.fx.lastFoul).toBe('fullColumn');
  });

  it('game over when drops reach 0', () => {
    const s = startGame({ ...config, rows: 1, maxDrops: 1 });
    const col = s.paddleLane;
    const filledWell = s.well.map((row) => [...row]);
    filledWell[0][col] = { id: 1, color: 0 };

    const withTile: GameState = {
      ...s,
      well: filledWell,
      dropsRemaining: 1,
      paddle: [{ id: 2, color: 1 }],
    };
    const after = runCommands(withTile, [{ type: 'DROP' }]);
    expect(after.phase).toBe('gameOver');
  });

  it('no-op when paddle is empty', () => {
    const s = startGame(config);
    expect(s.paddle.length).toBe(0);
    const after = runCommands(s, [{ type: 'DROP' }]);
    expect(after.paddle.length).toBe(0);
    expect(after.dropsRemaining).toBe(s.dropsRemaining);
  });
});

describe('missed tile costs a drop', () => {
  it('deducts a drop when a tile passes the lip uncaught', () => {
    const s = startGame({ ...config, baseTravelMs: 100, minTravelMs: 100 });
    // Add a tile in a lane the paddle is NOT in
    const otherLane = (s.paddleLane + 1) % config.cols;
    const withFalling: GameState = {
      ...s,
      conveyor: [{ tile: { id: 1, color: 0 }, lane: otherLane, progress: 0.99 }],
    };
    // One tick: progress goes past 1.0
    const after = step(withFalling, 50, []);
    expect(after.dropsRemaining).toBe(s.dropsRemaining - 1);
  });
});

describe('FLIP command', () => {
  it('returns top tile to the conveyor', () => {
    const s: GameState = {
      ...startGame(config),
      paddle: [{ id: 1, color: 0 }, { id: 2, color: 1 }],
    };
    const after = runCommands(s, [{ type: 'FLIP' }]);
    expect(after.paddle.length).toBe(1);
    expect(after.conveyor.some((ft) => ft.tile.id === 2)).toBe(true);
  });
});

describe('MOVE commands', () => {
  it('MOVE_LEFT clamps at 0', () => {
    const s: GameState = { ...startGame(config), paddleLane: 0 };
    const after = runCommands(s, [{ type: 'MOVE_LEFT' }]);
    expect(after.paddleLane).toBe(0);
  });

  it('MOVE_RIGHT clamps at cols-1', () => {
    const s: GameState = { ...startGame(config), paddleLane: config.cols - 1 };
    const after = runCommands(s, [{ type: 'MOVE_RIGHT' }]);
    expect(after.paddleLane).toBe(config.cols - 1);
  });

  it('MOVE_TO sets lane directly', () => {
    const s = startGame(config);
    const after = runCommands(s, [{ type: 'MOVE_TO', lane: 4 }]);
    expect(after.paddleLane).toBe(4);
  });
});

describe('PAUSE_TOGGLE', () => {
  it('pauses and resumes the game', () => {
    let s = startGame(config);
    s = runCommands(s, [{ type: 'PAUSE_TOGGLE' }]);
    expect(s.phase).toBe('paused');
    s = runCommands(s, [{ type: 'PAUSE_TOGGLE' }]);
    expect(s.phase).toBe('playing');
  });
});

describe('KLUX detection and scoring', () => {
  it('a 3-tile horizontal KLUX clears and scores', () => {
    // Build a state with 3 same-color tiles in row 0 cols 0-2
    // then drop a matching tile in col 2 (but we need to set up manually)
    const s = startGame(config);
    const well = s.well.map((row) => [...row]);
    well[0][0] = { id: 10, color: 0 };
    well[0][1] = { id: 11, color: 0 };
    // Drop one more in col 2 to complete the line
    const withSetup: GameState = {
      ...s,
      well,
      paddle: [{ id: 12, color: 0 }],
      paddleLane: 2,
    };
    const after = runCommands(withSetup, [{ type: 'DROP' }]);
    expect(after.score).toBeGreaterThan(0);
    expect(after.well[0][0]).toBeNull();
    expect(after.well[0][1]).toBeNull();
    expect(after.well[0][2]).toBeNull();
  });
});

describe('determinism', () => {
  it('same seed produces same sequence', () => {
    const cfg: GameConfig = { ...config, seed: 12345 };
    const s1 = startGame(cfg);
    const s2 = startGame(cfg);
    // Advance both with same commands
    const cmds: Command[] = [{ type: 'MOVE_RIGHT' }, { type: 'DROP' }];
    const r1 = step(step(s1, 100, cmds), 100, []);
    const r2 = step(step(s2, 100, cmds), 100, []);
    expect(r1.score).toBe(r2.score);
    expect(r1.paddleLane).toBe(r2.paddleLane);
  });
});
