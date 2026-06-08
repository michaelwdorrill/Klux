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

/**
 * Two cells are "run-compatible" if either is wild or they share a color.
 * runColor === -1 means "not yet determined" (run started with a wild).
 * Locked tiles are never compatible — they break every run.
 */
function matches(cell: NonNullable<Cell>, runColor: number): boolean {
  if (cell.type === 'locked') return false;
  return cell.type === 'wild' || runColor === -1 || cell.color === runColor;
}

/** Find all KLUXes (runs of minRun+ same-color tiles) in the well. */
export function findKluxes(well: Well, minRun: number): KluxLine[] {
  const rows = well.length;
  const cols = well[0].length;
  const lines: KluxLine[] = [];

  for (const { dr, dc, orientation } of DIRECTIONS) {
    for (let startRow = 0; startRow < rows; startRow++) {
      for (let startCol = 0; startCol < cols; startCol++) {
        const origin = well[startRow][startCol];
        if (origin === null) continue;

        // Locked tiles never start or continue a run.
        if (origin.type === 'locked') continue;

        // Skip if this position is a continuation of a longer run.
        // Wild tiles: only skip if the previous cell also matches the run.
        const prevRow = startRow - dr;
        const prevCol = startCol - dc;
        if (prevRow >= 0 && prevRow < rows && prevCol >= 0 && prevCol < cols) {
          const prev = well[prevRow][prevCol];
          if (prev !== null && prev.type !== 'locked') {
            const compatible =
              prev.type === 'wild' ||
              origin.type === 'wild' ||
              prev.color === origin.color;
            if (compatible) continue;
          }
        }

        // Extend the run.
        // runColor: -1 = undetermined (started with wild), otherwise the established color.
        let runColor = origin.type === 'wild' ? -1 : origin.color;
        const positions: Array<{ row: number; col: number }> = [
          { row: startRow, col: startCol },
        ];

        let r = startRow + dr;
        let c = startCol + dc;
        while (r >= 0 && r < rows && c >= 0 && c < cols) {
          const cell = well[r][c];
          if (cell === null) break;
          if (!matches(cell, runColor)) break;
          // First non-wild tile establishes the canonical run color
          if (runColor === -1 && cell.type !== 'wild') runColor = cell.color;
          positions.push({ row: r, col: c });
          r += dr;
          c += dc;
        }

        if (positions.length >= minRun) {
          const doubled  = positions.some(p => well[p.row][p.col]!.type === 'double');
          const negative = positions.some(p => well[p.row][p.col]!.type === 'negative');
          const lineColor = runColor === -1 ? 0 : runColor;
          lines.push({ tiles: positions, orientation, color: lineColor, doubled, negative });
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
