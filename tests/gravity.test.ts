import { describe, it, expect } from 'vitest';
import { applyGravity, clearCells } from '../src/core/board';
import type { Well } from '../src/core/types';

const E = null;
const T = (id: number, color = 0) => ({ id, color });

describe('applyGravity', () => {
  it('compacts a single gap in a column', () => {
    const well: Well = [
      [T(1), E, E, E, E],
      [E, E, E, E, E],
      [T(2), E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const result = applyGravity(well);
    expect(result[0][0]?.id).toBe(1);
    expect(result[1][0]?.id).toBe(2);
    expect(result[2][0]).toBeNull();
  });

  it('compacts multiple gaps in one column', () => {
    const well: Well = [
      [T(1), E, E, E, E],
      [E, E, E, E, E],
      [T(2), E, E, E, E],
      [E, E, E, E, E],
      [T(3), E, E, E, E],
    ];
    const result = applyGravity(well);
    expect(result[0][0]?.id).toBe(1);
    expect(result[1][0]?.id).toBe(2);
    expect(result[2][0]?.id).toBe(3);
    expect(result[3][0]).toBeNull();
    expect(result[4][0]).toBeNull();
  });

  it('does not affect other columns', () => {
    const well: Well = [
      [T(1), T(5), E, E, E],
      [E, T(6), E, E, E],
      [T(2), T(7), E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const result = applyGravity(well);
    expect(result[0][1]?.id).toBe(5);
    expect(result[1][1]?.id).toBe(6);
    expect(result[2][1]?.id).toBe(7);
  });

  it('no-op on already compact well', () => {
    const well: Well = [
      [T(1), E, E, E, E],
      [T(2), E, E, E, E],
      [T(3), E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const result = applyGravity(well);
    expect(result[0][0]?.id).toBe(1);
    expect(result[1][0]?.id).toBe(2);
    expect(result[2][0]?.id).toBe(3);
  });
});

describe('clearCells', () => {
  it('clears specified cells and applies gravity', () => {
    const well: Well = [
      [T(1), E, E, E, E],
      [T(2), E, E, E, E],
      [T(3), E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const result = clearCells(well, [{ row: 1, col: 0 }]);
    expect(result[0][0]?.id).toBe(1);
    expect(result[1][0]?.id).toBe(3);
    expect(result[2][0]).toBeNull();
  });

  it('clears multiple cells from multiple columns', () => {
    const well: Well = [
      [T(1), T(4), E, E, E],
      [T(2), T(5), E, E, E],
      [T(3), T(6), E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const result = clearCells(well, [
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ]);
    expect(result[0][0]?.id).toBe(2);
    expect(result[0][1]?.id).toBe(4);
  });
});
