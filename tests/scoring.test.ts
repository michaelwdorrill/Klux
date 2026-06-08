import { describe, it, expect } from 'vitest';
import { scoreLines } from '../src/core/scoring';
import type { KluxLine, ScoringConfig } from '../src/core/types';

// Matches Klax arcade manual: [3-tile, 4-tile, 5-tile]
const scoring: ScoringConfig = {
  vertical:         [50,  1000, 1500],
  horizontal:       [100,  500, 1000],
  diagonal:         [500, 1000, 1500],
  waveClearPerDrop: 1000,
};

function hLine(len: number): KluxLine {
  return {
    orientation: 'horizontal',
    color: 0,
    tiles: Array.from({ length: len }, (_, i) => ({ row: 0, col: i })),
  };
}

function vLine(len: number): KluxLine {
  return {
    orientation: 'vertical',
    color: 0,
    tiles: Array.from({ length: len }, (_, i) => ({ row: i, col: 0 })),
  };
}

function dLine(len: number): KluxLine {
  return {
    orientation: 'diagonal',
    color: 0,
    tiles: Array.from({ length: len }, (_, i) => ({ row: i, col: i })),
  };
}

describe('scoreLines', () => {
  it('horizontal 3-tile = 100', () => {
    expect(scoreLines([hLine(3)], scoring, 1)).toBe(100);
  });

  it('horizontal 4-tile = 500', () => {
    expect(scoreLines([hLine(4)], scoring, 1)).toBe(500);
  });

  it('horizontal 5-tile = 1000', () => {
    expect(scoreLines([hLine(5)], scoring, 1)).toBe(1000);
  });

  it('vertical 3-tile = 50', () => {
    expect(scoreLines([vLine(3)], scoring, 1)).toBe(50);
  });

  it('vertical 4-tile = 1000', () => {
    expect(scoreLines([vLine(4)], scoring, 1)).toBe(1000);
  });

  it('vertical 5-tile = 1500', () => {
    expect(scoreLines([vLine(5)], scoring, 1)).toBe(1500);
  });

  it('diagonal 3-tile = 500', () => {
    expect(scoreLines([dLine(3)], scoring, 1)).toBe(500);
  });

  it('diagonal 4-tile = 1000', () => {
    expect(scoreLines([dLine(4)], scoring, 1)).toBe(1000);
  });

  it('diagonal 5-tile = 1500', () => {
    expect(scoreLines([dLine(5)], scoring, 1)).toBe(1500);
  });

  it('diagonal scores higher than horizontal (same 3-tile length)', () => {
    expect(scoreLines([dLine(3)], scoring, 1)).toBeGreaterThan(scoreLines([hLine(3)], scoring, 1));
  });

  it('multi-KLUX: 2 simultaneous lines → sum × 2', () => {
    const single = scoreLines([hLine(3)], scoring, 1); // 100
    const multi  = scoreLines([hLine(3), hLine(3)], scoring, 1); // (100+100) × 2 = 400
    expect(multi).toBe(single * 2 * 2);
  });

  it('chain step 1 → no multiplier', () => {
    expect(scoreLines([hLine(3)], scoring, 1)).toBe(100);
  });

  it('chain step 2 → ×2 multiplier', () => {
    expect(scoreLines([hLine(3)], scoring, 2)).toBe(200);
  });

  it('chain step 3 → ×3 multiplier', () => {
    expect(scoreLines([hLine(3)], scoring, 3)).toBe(300);
  });

  it('returns 0 for empty lines array', () => {
    expect(scoreLines([], scoring, 1)).toBe(0);
  });
});
