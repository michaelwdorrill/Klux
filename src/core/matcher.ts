import type { Well, KluxLine, Cell } from './types';

interface Direction {
  dr: number;
  dc: number;
  orientation: KluxLine['orientation'];
}

const DIRECTIONS: Direction[] = [
  { dr: 0, dc: 1, orientation: 'horizontal' },
  { dr: 1, dc: 0, orientation: 'vertical' },
  { dr: 1, dc: 1, orientation: 'diagonal' },
  { dr: 1, dc: -1, orientation: 'diagonal' },
];

/** Find all KLUXes (runs of minRun+ same-color tiles) in the well. */
export function findKluxes(well: Well, minRun: number): KluxLine[] {
  const rows = well.length;
  const cols = well[0].length;
  const lines: KluxLine[] = [];

  for (const { dr, dc, orientation } of DIRECTIONS) {
    for (let startRow = 0; startRow < rows; startRow++) {
      for (let startCol = 0; startCol < cols; startCol++) {
        const origin: Cell = well[startRow][startCol];
        if (origin === null) continue;

        // Only start a run from a cell that isn't the continuation of a longer run
        const prevRow = startRow - dr;
        const prevCol = startCol - dc;
        if (
          prevRow >= 0 && prevRow < rows &&
          prevCol >= 0 && prevCol < cols &&
          well[prevRow][prevCol]?.color === origin.color
        ) {
          continue; // part of a longer run — skip
        }

        // Extend the run
        const positions: Array<{ row: number; col: number }> = [{ row: startRow, col: startCol }];
        let r = startRow + dr;
        let c = startCol + dc;
        while (r >= 0 && r < rows && c >= 0 && c < cols && well[r][c]?.color === origin.color) {
          positions.push({ row: r, col: c });
          r += dr;
          c += dc;
        }

        if (positions.length >= minRun) {
          lines.push({ tiles: positions, orientation, color: origin.color });
        }
      }
    }
  }

  return lines;
}

/** Collect all unique cell positions from a set of KLUX lines. */
export function collectClearPositions(
  lines: KluxLine[]
): Array<{ row: number; col: number }> {
  const seen = new Set<string>();
  const result: Array<{ row: number; col: number }> = [];
  for (const line of lines) {
    for (const pos of line.tiles) {
      const key = `${pos.row},${pos.col}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(pos);
      }
    }
  }
  return result;
}
