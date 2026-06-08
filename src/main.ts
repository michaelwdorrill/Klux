import { DEFAULT_CONFIG } from './config';
import { startGame, step } from './core/game';
import { spawnIntervalMs } from './core/waves';
import type { GameState } from './core/types';
import { Renderer } from './render/Renderer';
import { InputManager } from './input/InputManager';
import { KeyboardAdapter } from './input/KeyboardAdapter';
import { TouchAdapter } from './input/TouchAdapter';
import { PointerAdapter } from './input/PointerAdapter';
import { OnScreenControls } from './input/OnScreenControls';
import { Audio } from './audio/Audio';
import type { Command } from './core/commands';
import { loadHighScores, recordScore, getMuted, setMuted } from './persistence/store';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const audio = new Audio();
const input = new InputManager();

let state: GameState = { ...startGame(DEFAULT_CONFIG), phase: 'title' };

const onScreenControls = new OnScreenControls();
const pointerAdapter = new PointerAdapter(
  canvas,
  () => renderer.getLayout(),
  () => state.paddleLane,
);
input.register(new KeyboardAdapter());
input.register(new TouchAdapter(
  canvas,
  () => renderer.getLayout(),
  () => state.paddleLane,
  () => state.phase,
));
input.register(pointerAdapter);
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

// Restore persisted mute preference + high scores
if (getMuted()) audio.setMuted(true);
let highScores = loadHighScores();
renderer.setHighScores(highScores);

onScreenControls.setMuteHandler(() => {
  const muted = audio.toggleMute();
  setMuted(muted);
  return muted;
});
onScreenControls.setMuteState(audio.isMuted);

// Backtick toggles debug overlay; M toggles mute (and persists)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') renderer.debugMode = !renderer.debugMode;
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    setMuted(muted);
    onScreenControls.setMuteState(muted);
  }
});

const FIXED_MS = 1000 / 60;
const WAVE_CLEAR_AUTO_MS = 3000;

let acc = 0;
let last = performance.now();
let waveClearEnteredAt: number | null = null;
let lastSpeedTier = -1;
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

  // Music tempo bumps in discrete tiers — coarser than the spawn ramp so the
  // track doesn't outpace the gameplay:
  //  - classic: every full wave cycle (5 waves)
  //  - endless: every 10 KLUXes
  // The factor is derived from the spawn interval at the equivalent wave
  // index for that tier, so music tops out at game-tempo max.
  const tier = state.mode === 'endless'
    ? Math.floor(state.kluxCount / 10)
    : Math.floor(state.wave.index / 5);
  if (tier !== lastSpeedTier) {
    const { baseSpawnMs, minSpawnMs, spawnStepPerWave } = state.config;
    const equivalentWave = state.mode === 'endless' ? tier : tier * 5;
    const spawnMs = spawnIntervalMs(equivalentWave, baseSpawnMs, minSpawnMs, spawnStepPerWave);
    const factor = (baseSpawnMs - spawnMs) / (baseSpawnMs - minSpawnMs);
    audio.setSpeedFactor(factor);
    lastSpeedTier = tier;
  }

  // Play wave-clear jingle on transition
  if (state.phase === 'waveClear' && lastPhase === 'playing') {
    audio.sfxWaveClear();
  }

  // On game-over, record the score and flag a new best for the overlay
  if (state.phase === 'gameOver' && lastPhase !== 'gameOver') {
    const isNewBest = recordScore(state.mode, state.score);
    renderer.setNewBest(isNewBest);
    if (isNewBest) {
      highScores = loadHighScores();
      renderer.setHighScores(highScores);
    }
  }
  if (state.phase === 'playing' && lastPhase !== 'playing') {
    renderer.setNewBest(false);
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
  renderer.draw(state, acc / FIXED_MS, pointerAdapter.hoveredLane);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
