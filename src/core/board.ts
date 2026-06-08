import type { Well, Cell, Tile, GameConfig } from './types';

export function createWell(config: GameConfig): Well {
  return Array.from({ length: config.rows }, () =>
    Array.from({ length: config.cols }, () => null)
  );
}

export function columnHeight(well: Well, col: number): number {
  for (let row = well.length - 1; row >= 0; row--) {
    if (well[row][col] !== null) return row + 1;
  }
  return 0;
}

export function isColumnFull(well: Well, col: number): boolean {
  return well[well.length - 1][col] !== null;
}

/** Drop a tile onto the top of a column. Returns new well, or null if column is full. */
export function dropTile(well: Well, col: number, tile: Tile): Well | null {
  const height = columnHeight(well, col);
  if (height >= well.length) return null;

  const next = well.map((row) => [...row]);
  next[height][col] = tile;
  return next;
}

/** Compact all columns downward after a clear. Tiles fall to fill gaps. */
export function applyGravity(well: Well): Well {
  const rows = well.length;
  const cols = well[0].length;
  const next: Well = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null as Cell)
  );

  for (let col = 0; col < cols; col++) {
    let writeRow = 0;
    for (let row = 0; row < rows; row++) {
      if (well[row][col] !== null) {
        next[writeRow][col] = well[row][col];
        writeRow++;
      }
    }
  }

  return next;
}

/**
 * Remove cleared positions, unlock any locked tiles orthogonally adjacent
 * to the cleared set (converting them to 'normal'), then apply gravity.
 */
export function clearCells(well: Well, positions: Array<{ row: number; col: number }>): Well {
  const rows = well.length;
  const cols = well[0].length;
  const cleared = new Set(positions.map(p => `${p.row},${p.col}`));

  const next = well.map(row => [...row]);

  // Remove cleared cells
  for (const { row, col } of positions) {
    next[row][col] = null;
  }

  // Unlock locked tiles that are orthogonally adjacent to a cleared position
  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const { row, col } of positions) {
    for (const [dr, dc] of ORTHO) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (cleared.has(`${nr},${nc}`)) continue; // also being cleared
      const tile = next[nr][nc];
      if (tile?.type === 'locked') {
        next[nr][nc] = { ...tile, type: 'normal' };
      }
    }
  }

  return applyGravity(next);
}

export function cloneWell(well: Well): Well {
  return well.map((row) => [...row]);
}
