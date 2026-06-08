import { DEFAULT_CONFIG } from './config';
import { startGame, step } from './core/game';
import type { GameState } from './core/types';
import { Renderer } from './render/Renderer';
import { InputManager } from './input/InputManager';
import { KeyboardAdapter } from './input/KeyboardAdapter';
import type { Command } from './core/commands';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new InputManager();
input.register(new KeyboardAdapter());

function applyCanvasSize(): void {
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  renderer.resize();
}

applyCanvasSize();
window.addEventListener('resize', applyCanvasSize);
window.addEventListener('orientationchange', applyCanvasSize);

// Start on the title screen — CONFIRM transitions to 'playing'
let state: GameState = { ...startGame(DEFAULT_CONFIG), phase: 'title' };

// Backtick toggles debug overlay
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') renderer.debugMode = !renderer.debugMode;
});

const FIXED_MS = 1000 / 60;
const WAVE_CLEAR_AUTO_MS = 3000; // auto-advance wave clear after this long

let acc = 0;
let last = performance.now();
let waveClearEnteredAt: number | null = null;

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'playing') {
    state = { ...state, phase: 'paused' };
  }
  if (!document.hidden) {
    last = performance.now();
  }
});

function frame(now: number): void {
  acc += Math.min(now - last, 250);
  last = now;

  // Auto-advance the wave-clear screen after WAVE_CLEAR_AUTO_MS
  const extraCmds: Command[] = [];
  if (state.phase === 'waveClear') {
    if (waveClearEnteredAt === null) waveClearEnteredAt = now;
    if (now - waveClearEnteredAt >= WAVE_CLEAR_AUTO_MS) {
      extraCmds.push({ type: 'CONFIRM' });
      waveClearEnteredAt = null;
    }
  } else {
    waveClearEnteredAt = null;
  }

  while (acc >= FIXED_MS) {
    const commands = [...input.drain(), ...extraCmds.splice(0)];
    state = step(state, FIXED_MS, commands);
    acc -= FIXED_MS;
  }

  renderer.draw(state, acc / FIXED_MS);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
