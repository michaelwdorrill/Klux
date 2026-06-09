import type { GameMode } from '../core/types';

// localStorage namespace. Bumping the version drops old keys cleanly.
const NS = 'klux.v1.';
const keyHigh = (mode: GameMode) => `${NS}highScore.${mode}`;
const KEY_MUTED = `${NS}muted`;

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode / quota */ }
}

export function getHighScore(mode: GameMode): number {
  const raw = safeGet(keyHigh(mode));
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Persist `score` if it beats the existing record. Returns true on new best. */
export function recordScore(mode: GameMode, score: number): boolean {
  const current = getHighScore(mode);
  if (score > current) {
    safeSet(keyHigh(mode), String(score));
    return true;
  }
  return false;
}

export function getMuted(): boolean {
  return safeGet(KEY_MUTED) === '1';
}

export function setMuted(muted: boolean): void {
  safeSet(KEY_MUTED, muted ? '1' : '0');
}

const KEY_TUTORIAL = `${NS}tutorialDone`;

export function getTutorialDone(): boolean {
  return safeGet(KEY_TUTORIAL) === '1';
}

export function setTutorialDone(): void {
  safeSet(KEY_TUTORIAL, '1');
}

export interface HighScores {
  classic: number;
  endless: number;
}

export function loadHighScores(): HighScores {
  return { classic: getHighScore('classic'), endless: getHighScore('endless') };
}
