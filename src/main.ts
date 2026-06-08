import { DEFAULT_CONFIG } from './config';
import { startGame, step } from './core/game';
import type { GameState } from './core/types';
import { Renderer } from './render/Renderer';
import { InputManager } from './input/InputManager';
import { KeyboardAdapter } from './input/KeyboardAdapter';

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
let acc = 0;
let last = performance.now();
let paused = false;

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'playing') {
    state = { ...state, phase: 'paused' };
  }
  if (!document.hidden) {
    last = performance.now(); // reset timer to avoid spiral-of-death after tab-away
    paused = false;
  }
});

function frame(now: number): void {
  if (!paused) {
    acc += Math.min(now - last, 250);
  }
  last = now;

  while (acc >= FIXED_MS) {
    const commands = input.drain();
    state = step(state, FIXED_MS, commands);
    acc -= FIXED_MS;
  }

  renderer.draw(state, acc / FIXED_MS);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
