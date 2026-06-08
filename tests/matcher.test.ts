import { describe, it, expect } from 'vitest';
import { findKluxes, collectClearPositions } from '../src/core/matcher';
import type { Well } from '../src/core/types';

const E = null;
const R = (id: number) => ({ id, color: 0 }); // red
const B = (id: number) => ({ id, color: 1 }); // blue

function makeWell(rows: number[][]): Well {
  // rows[0] is the bottom row; rows array passed bottom-up
  return rows.map((row) =>
    row.map((c) => (c === -1 ? null : { id: c === 0 ? 99 : c, color: c === 0 ? 0 : c - 1 }))
  );
}

describe('findKluxes', () => {
  it('detects a horizontal run of 3', () => {
    const well: Well = [
      [R(1), R(2), R(3), E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const lines = findKluxes(well, 3);
    expect(lines).toHaveLength(1);
    expect(lines[0].orientation).toBe('horizontal');
    expect(lines[0].tiles).toHaveLength(3);
  });

  it('detects a vertical run of 3', () => {
    const well: Well = [
      [R(1), E, E, E, E],
      [R(2), E, E, E, E],
      [R(3), E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const lines = findKluxes(well, 3);
    expect(lines).toHaveLength(1);
    expect(lines[0].orientation).toBe('vertical');
  });

  it('detects a diagonal run (top-left to bottom-right)', () => {
    const well: Well = [
      [R(1), E, E, E, E],
      [E, R(2), E, E, E],
      [E, E, R(3), E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const lines = findKluxes(well, 3);
    expect(lines).toHaveLength(1);
    expect(lines[0].orientation).toBe('diagonal');
  });

  it('detects a diagonal run (top-right to bottom-left)', () => {
    const well: Well = [
      [E, E, R(3), E, E],
      [E, R(2), E, E, E],
      [R(1), E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const lines = findKluxes(well, 3);
    expect(lines).toHaveLength(1);
    expect(lines[0].orientation).toBe('diagonal');
  });

  it('does not flag a run of 2 as a KLUX', () => {
    const well: Well = [
      [R(1), R(2), E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    expect(findKluxes(well, 3)).toHaveLength(0);
  });

  it('detects a run of 5', () => {
    const well: Well = [
      [R(1), R(2), R(3), R(4), R(5)],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const lines = findKluxes(well, 3);
    expect(lines).toHaveLength(1);
    expect(lines[0].tiles).toHaveLength(5);
  });

  it('detects two separate horizontal runs', () => {
    const well: Well = [
      [R(1), R(2), R(3), E, E],
      [B(4), B(5), B(6), E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const lines = findKluxes(well, 3);
    expect(lines).toHaveLength(2);
  });

  it('counts a tile that participates in both H and V lines', () => {
    // Three reds in a row + three reds in a column sharing the corner
    const well: Well = [
      [R(1), R(2), R(3), E, E],
      [R(4), E, E, E, E],
      [R(5), E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    const lines = findKluxes(well, 3);
    expect(lines).toHaveLength(2); // one H + one V

    const positions = collectClearPositions(lines);
    // (0,0) appears in both but should only appear once
    const count00 = positions.filter((p) => p.row === 0 && p.col === 0).length;
    expect(count00).toBe(1);
  });

  it('no false positives on an empty well', () => {
    const well: Well = Array.from({ length: 5 }, () => Array(5).fill(null));
    expect(findKluxes(well, 3)).toHaveLength(0);
  });

  it('handles run at the right edge', () => {
    const well: Well = [
      [E, E, R(1), R(2), R(3)],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
    ];
    expect(findKluxes(well, 3)).toHaveLength(1);
  });

  it('handles run at the top row', () => {
    const well: Well = [
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [E, E, E, E, E],
      [R(1), R(2), R(3), E, E],
    ];
    expect(findKluxes(well, 3)).toHaveLength(1);
  });
});
