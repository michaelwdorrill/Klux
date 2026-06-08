import { DEFAULT_CONFIG } from './config';
import { startGame, step } from './core/game';
import type { GameState } from './core/types';
import { Renderer } from './render/Renderer';
import type { Command } from './core/commands';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);

function applyCanvasSize(): void {
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  renderer.resize();
}

applyCanvasSize();
window.addEventListener('resize', applyCanvasSize);
window.addEventListener('orientationchange', applyCanvasSize);

// Demo board: pre-populated so the Phase 3 renderer has something to show
let state: GameState = startGame({ ...DEFAULT_CONFIG, seed: 1 });
state = {
  ...state,
  well: (() => {
    const w = state.well.map((row) => [...row]);
    w[0][0] = { id: 1, color: 0 };
    w[0][1] = { id: 2, color: 1 };
    w[0][2] = { id: 3, color: 2 };
    w[1][0] = { id: 4, color: 3 };
    w[1][2] = { id: 5, color: 4 };
    w[0][4] = { id: 6, color: 0 };
    return w;
  })(),
  paddle: [{ id: 7, color: 2 }, { id: 8, color: 0 }],
  paddleLane: 2,
  conveyor: [
    { tile: { id: 9, color: 1 }, lane: 1, progress: 0.3 },
    { tile: { id: 10, color: 3 }, lane: 3, progress: 0.65 },
  ],
  score: 3000,
};

const FIXED_MS = 1000 / 60;
let acc = 0;
let last = performance.now();
const pendingCommands: Command[] = [];

function frame(now: number): void {
  acc += Math.min(now - last, 250);
  last = now;
  while (acc >= FIXED_MS) {
    const commands = pendingCommands.splice(0);
    state = step(state, FIXED_MS, commands);
    acc -= FIXED_MS;
  }
  renderer.draw(state, acc / FIXED_MS);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
