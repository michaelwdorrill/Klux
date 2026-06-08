import { describe, it, expect } from 'vitest';
import { scoreLines } from '../src/core/scoring';
import type { KluxLine, ScoringConfig } from '../src/core/types';

const scoring: ScoringConfig = {
  horizontal: 1000,
  vertical: 1000,
  diagonal: 5000,
  extraTile: 1000,
  bigKluxBonus: 5000,
  waveClearPerDrop: 1000,
};

function hLine(len: number): KluxLine {
  return {
    orientation: 'horizontal',
    color: 0,
    tiles: Array.from({ length: len }, (_, i) => ({ row: 0, col: i })),
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
  it('scores a horizontal 3-line at base value', () => {
    expect(scoreLines([hLine(3)], scoring, 1)).toBe(1000);
  });

  it('diagonal scores higher than horizontal (same length)', () => {
    const h = scoreLines([hLine(3)], scoring, 1);
    const d = scoreLines([dLine(3)], scoring, 1);
    expect(d).toBeGreaterThan(h);
  });

  it('each extra tile beyond 3 adds extraTile points', () => {
    // 4-tile horizontal = 1000 + 1000 = 2000
    expect(scoreLines([hLine(4)], scoring, 1)).toBe(2000);
    // 5-tile horizontal = 1000 + 2*1000 + 5000 bigBonus = 8000
    expect(scoreLines([hLine(5)], scoring, 1)).toBe(8000);
  });

  it('big KLUX bonus applies at 5 tiles', () => {
    const score4 = scoreLines([hLine(4)], scoring, 1);
    const score5 = scoreLines([hLine(5)], scoring, 1);
    expect(score5 - score4).toBe(scoring.extraTile + scoring.bigKluxBonus);
  });

  it('multi-KLUX multiplier: 2 lines → score × 2', () => {
    const single = scoreLines([hLine(3)], scoring, 1);
    const multi = scoreLines([hLine(3), hLine(3)], scoring, 1);
    expect(multi).toBe(single * 2 * 2); // (1000+1000) × 2
  });

  it('chain step 1 → no multiplier', () => {
    expect(scoreLines([hLine(3)], scoring, 1)).toBe(1000);
  });

  it('chain step 2 → ×2 multiplier', () => {
    expect(scoreLines([hLine(3)], scoring, 2)).toBe(2000);
  });

  it('chain step 3 → ×3 multiplier', () => {
    expect(scoreLines([hLine(3)], scoring, 3)).toBe(3000);
  });

  it('returns 0 for empty lines array', () => {
    expect(scoreLines([], scoring, 1)).toBe(0);
  });
});
