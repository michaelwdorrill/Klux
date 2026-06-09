import { DEFAULT_CONFIG } from './config';
import { startGame, step } from './core/game';
import { spawnIntervalMs } from './core/waves';
import type { GameState } from './core/types';
import { Renderer } from './render/Renderer';
import { Renderer3D } from './render/Renderer3D';
import { InputManager } from './input/InputManager';
import { KeyboardAdapter } from './input/KeyboardAdapter';
import { TouchAdapter } from './input/TouchAdapter';
import { PointerAdapter } from './input/PointerAdapter';
import { OnScreenControls } from './input/OnScreenControls';
import { Audio } from './audio/Audio';
import type { Command } from './core/commands';
import { loadHighScores, recordScore, getMuted, setMuted } from './persistence/store';
import { NameEntry } from './ui/NameEntry';
import { postScore, getTopScores, type LeaderboardEntry } from './leaderboard';
import { VsLobby } from './ui/VsLobby';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const nameEntry = new NameEntry();
const vsLobby = new VsLobby();
const USE_3D = true;
const renderer: Renderer = USE_3D ? new Renderer3D(canvas) : new Renderer(canvas);
const audio = new Audio();
const input = new InputManager();

let state: GameState = { ...startGame(DEFAULT_CONFIG), phase: 'title' };

const onScreenControls = new OnScreenControls();
const pointerAdapter = new PointerAdapter(
  canvas,
  () => renderer.getLayout(),
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

const vsClient = vsLobby.getClient();

function wireVsEvents(): void {
  vsClient.onEvent = (ev) => {
    if (ev.type === 'power') {
      const level = (ev.payload as { level: number }).level;
      const cmd: Command =
        level >= 4 ? { type: 'VS_NEGATIVE_TILES' } :
        level >= 3 ? { type: 'VS_SPEED_BOOST' } :
        level >= 2 ? { type: 'VS_EXTRA_SPAWN' } :
                     { type: 'VS_LOCKED' };
      input.inject(cmd);
    } else if (ev.type === 'gameover') {
      input.inject({ type: 'VS_WIN' });
      vsClient.stopPolling();
    } else if (ev.type === 'disconnect') {
      input.inject({ type: 'VS_WIN' });
      vsClient.stopPolling();
    }
  };
}
wireVsEvents();

onScreenControls.setVsHandler(() => {
  vsLobby.show((matchId, seed, player) => {
    vsClient.matchId = matchId;
    vsClient.player  = player;
    wireVsEvents();          // restore handler after lobby overwrites it
    vsClient.startPolling();
    input.inject({ type: 'START_VS', seed });
  });
});

// Backtick toggles debug overlay; M toggles mute; F fires VS power
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') renderer.debugMode = !renderer.debugMode;
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    setMuted(muted);
    onScreenControls.setMuteState(muted);
  }
  if (e.code === 'KeyF' && state.mode === 'versus' && state.phase === 'playing') {
    input.inject({ type: 'FIRE_POWER' });
  }
});

window.addEventListener('beforeunload', () => {
  if (state.mode === 'versus' && state.phase === 'playing') {
    vsClient.disconnect();
  }
});

const FIXED_MS = 1000 / 60;
const WAVE_CLEAR_AUTO_MS = 3000;

let acc = 0;
let last = performance.now();
let waveClearEnteredAt: number | null = null;
let lastSpeedTier = -1;
let lastPhase = state.phase;
let titleLeaderboardFetched = false;
let vsBoardSyncTimer = 0;

async function fetchTitleLeaderboard(): Promise<void> {
  const [classic, endless] = await Promise.all([
    getTopScores('classic', 5),
    getTopScores('endless', 5),
  ]);
  renderer.setTitleLeaderboard({ classic, endless });
}

// Pre-fetch on load so the title screen shows it immediately
fetchTitleLeaderboard().catch(() => {});

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
    // Intercept FIRE_POWER to call vsClient and derive the level from current meter
    for (const cmd of commands) {
      if (cmd.type === 'FIRE_POWER' && state.mode === 'versus') {
        const p = state.vsPowerMeter;
        const level = p >= 6000 ? 4 : p >= 4500 ? 3 : p >= 3000 ? 2 : p >= 1500 ? 1 : 0;
        if (level > 0) vsClient.fire(level);
      }
    }
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

  // Board sync for VS — send well state to opponent every ~750ms
  if (state.mode === 'versus' && state.phase === 'playing') {
    vsBoardSyncTimer -= FIXED_MS;
    if (vsBoardSyncTimer <= 0) {
      vsBoardSyncTimer = 750;
      const encoded = state.well.map(row => row.map(cell => cell ? cell.color : -1));
      vsClient.sendBoard(encoded, state.dropsRemaining);
    }
  } else {
    vsBoardSyncTimer = 0;
  }

  // On game-over, record local best and show name-entry for leaderboard (non-VS only)
  if (state.phase === 'gameOver' && lastPhase !== 'gameOver') {
    if (state.mode === 'versus') {
      vsClient.gameover(state.score);   // notify opponent so they get VS_WIN
      renderer.setNewBest(false);
      renderer.setLeaderboard(null);
    } else {
      const isNewBest = recordScore(state.mode, state.score);
      renderer.setNewBest(isNewBest);
      renderer.setLeaderboard(null);
      if (isNewBest) {
        highScores = loadHighScores();
        renderer.setHighScores(highScores);
      }
      const capturedMode  = state.mode;
      const capturedScore = state.score;
      const capturedWave  = state.wave.index + 1;
      nameEntry.show(async (name) => {
        nameEntry.hide();
        await postScore(capturedMode, name, capturedScore, capturedWave);
        const [entries, c, e] = await Promise.all([
          getTopScores(capturedMode, 10),
          getTopScores('classic', 5),
          getTopScores('endless', 5),
        ]) as [LeaderboardEntry[], LeaderboardEntry[], LeaderboardEntry[]];
        renderer.setLeaderboard(entries, capturedScore);
        renderer.setTitleLeaderboard({ classic: c, endless: e });
      });
    }
  }
  if (state.phase === 'playing' && lastPhase !== 'playing') {
    renderer.setNewBest(false);
    renderer.setLeaderboard(null);
    nameEntry.hide();
  }
  if (state.phase === 'title' && lastPhase !== 'title') {
    if (!titleLeaderboardFetched) {
      titleLeaderboardFetched = true;
    } else {
      fetchTitleLeaderboard().catch(() => {});
    }
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

  onScreenControls.update(state.phase, state.mode, state.vsPowerMeter);
  if (state.mode === 'versus') {
    renderer.setOpponentState(vsClient.opponentWell, vsClient.opponentDrops);
  }
  renderer.draw(state, acc / FIXED_MS, pointerAdapter.hoveredLane);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
