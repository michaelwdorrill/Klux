import type { KluxLine, ScoringConfig } from './types';

export function scoreLines(
  lines: KluxLine[],
  scoring: ScoringConfig,
  chainStep: number
): number {
  if (lines.length === 0) return 0;

  let total = 0;

  for (const line of lines) {
    const len = line.tiles.length;
    const base = line.orientation === 'diagonal' ? scoring.diagonal : scoring.horizontal;
    const extraTiles = Math.max(0, len - 3);
    const bigBonus = len >= 5 ? scoring.bigKluxBonus : 0;
    total += base + extraTiles * scoring.extraTile + bigBonus;
  }

  // Multi-KLUX multiplier: multiply by number of simultaneous lines
  if (lines.length > 1) {
    total *= lines.length;
  }

  // Chain multiplier: multiply by chain depth (chain step 1 = no bonus, 2+ = ×step)
  if (chainStep > 1) {
    total *= chainStep;
  }

  return total;
}

export function waveClearBonus(dropsRemaining: number, scoring: ScoringConfig): number {
  return dropsRemaining * scoring.waveClearPerDrop;
}
