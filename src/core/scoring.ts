import type { KluxLine, ScoringConfig } from './types';

function linePoints(line: KluxLine, scoring: ScoringConfig): number {
  const table =
    line.orientation === 'vertical'   ? scoring.vertical   :
    line.orientation === 'diagonal'   ? scoring.diagonal   :
                                        scoring.horizontal;
  const idx = Math.min(2, line.tiles.length - 3);
  const base = table[idx];
  return line.doubled ? base * 2 : base;
}

export function scoreLines(
  lines: KluxLine[],
  scoring: ScoringConfig,
  chainStep: number
): number {
  if (lines.length === 0) return 0;

  let total = 0;
  for (const line of lines) {
    total += linePoints(line, scoring);
  }

  // Multi-KLUX: multiply by number of simultaneous lines
  if (lines.length > 1) {
    total *= lines.length;
  }

  // Chain multiplier: chain step 1 = no bonus, 2+ = ×step
  if (chainStep > 1) {
    total *= chainStep;
  }

  return total;
}

export function waveClearBonus(dropsRemaining: number, scoring: ScoringConfig): number {
  return dropsRemaining * scoring.waveClearPerDrop;
}
