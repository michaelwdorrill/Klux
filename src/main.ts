import { DEFAULT_CONFIG } from './config';
import { startGame, step } from './core/game';
import { spawnIntervalMs } from './core/waves';
import type { GameState } from './core/types';
import { Renderer } from './render/Renderer';
import { InputManager } from './input/InputManager';
import { KeyboardAdapter } from './input/KeyboardAdapter';
import { TouchAdapter } from './input/TouchAdapter';
import { OnScreenControls } from './input/OnScreenControls';
import { Audio } from './audio/Audio';
import type { Command } from './core/commands';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const audio = new Audio();
const input = new InputManager();

let state: GameState = { ...startGame(DEFAULT_CONFIG), phase: 'title' };

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

// Unlock AudioContext on first gesture (browser autoplay policy)
const unlockAudio = () => audio.unlock();
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);

// Load background music — put your Suno export at public/audio/theme.mp3
audio.loadMusic('./audio/theme.mp3');
audio.loadSfxFiles();
renderer.getEffects().loadOwen('./images/owen.png');

// Backtick toggles debug overlay; M toggles mute
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') renderer.debugMode = !renderer.debugMode;
  if (e.code === 'KeyM') audio.toggleMute();
});

const FIXED_MS = 1000 / 60;
const WAVE_CLEAR_AUTO_MS = 3000;

let acc = 0;
let last = performance.now();
let waveClearEnteredAt: number | null = null;
let lastWaveIndex = -1;
let lastPhase = state.phase;

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.phase === 'playing') {
    state = { ...state, phase: 'paused' };
  }
  if (!document.hidden) last = performance.now();
});

function frame(now: number): void {
  acc += Math.min(now - last, 250);
  last = now;

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

  // Ramp music tempo with the actual game tempo (spawn interval), so music
  // tracks the speed ramp instead of marching ahead on raw wave count.
  if (state.wave.index !== lastWaveIndex) {
    const { baseSpawnMs, minSpawnMs, spawnStepPerWave } = state.config;
    const spawnMs = spawnIntervalMs(state.wave.index, baseSpawnMs, minSpawnMs, spawnStepPerWave);
    const factor = (baseSpawnMs - spawnMs) / (baseSpawnMs - minSpawnMs);
    audio.setSpeedFactor(factor);
    lastWaveIndex = state.wave.index;
  }

  // Play wave-clear jingle on transition
  if (state.phase === 'waveClear' && lastPhase === 'playing') {
    audio.sfxWaveClear();
  }

  // Per-frame SFX (catch + foul). Klux/Wow handled per-clear below.
  audio.consume(state.fx);

  // Per-clear: 1 in 20 KLUX moments triggers the Owen easter egg
  for (const ev of state.fx.clears) {
    if (Math.random() < 1 / 20) {
      audio.playWow();
      renderer.getEffects().triggerOwen();
    } else {
      audio.playKlux(ev.chainStep, ev.lines.length);
    }
  }

  lastPhase = state.phase;

  onScreenControls.update(state.phase);
  renderer.draw(state, acc / FIXED_MS);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
