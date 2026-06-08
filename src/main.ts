import { DEFAULT_CONFIG } from './config';
import { startGame, step } from './core/game';
import type { GameState } from './core/types';
import { Renderer } from './render/Renderer';
import { InputManager } from './input/InputManager';
import { KeyboardAdapter } from './input/KeyboardAdapter';
import { TouchAdapter } from './input/TouchAdapter';
import { OnScreenControls } from './input/OnScreenControls';
import type { Command } from './core/commands';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new InputManager();

// Start in title phase
let state: GameState = { ...startGame(DEFAULT_CONFIG), phase: 'title' };

// All adapters registered; InputManager activates each one whose isApplicable() is true.
// Keyboard + touch can both be active simultaneously on hybrid devices.
const onScreenControls = new OnScreenControls();
input.register(new KeyboardAdapter());
input.register(new TouchAdapter(
  canvas,
  () => renderer.getLayout(),
  () => state.paddleLane,
  () => state.phase,
));
input.register(onScreenControls);

function applyCanvasSize(): void {
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  renderer.resize();
}

applyCanvasSize();
window.addEventListener('resize', applyCanvasSize);
window.addEventListener('orientationchange', applyCanvasSize);

// Backtick toggles debug overlay
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') renderer.debugMode = !renderer.debugMode;
});

const FIXED_MS = 1000 / 60;
const WAVE_CLEAR_AUTO_MS = 3000;

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

  // Auto-advance wave-clear screen after timeout
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

  // Keep on-screen controls in sync with game phase
  onScreenControls.update(state.phase);

  renderer.draw(state, acc / FIXED_MS);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
