import { DEFAULT_CONFIG } from './config';
import { startGame, step } from './core/game';
import { spawnIntervalMs } from './core/waves';
import type { GameState, Difficulty } from './core/types';
import { Renderer } from './render/Renderer';
import { Renderer3D } from './render/Renderer3D';
import { InputManager } from './input/InputManager';
import { KeyboardAdapter } from './input/KeyboardAdapter';
import { TouchAdapter } from './input/TouchAdapter';
import { PointerAdapter } from './input/PointerAdapter';
import { OnScreenControls } from './input/OnScreenControls';
import { Audio } from './audio/Audio';
import type { Command } from './core/commands';
import { loadHighScores, getHighScore, recordScore, getMuted, setMuted, getTutorialDone, setTutorialDone } from './persistence/store';
import { NameEntry } from './ui/NameEntry';
import { postScore, getTopScores, leaderboardKey, type LeaderboardEntry } from './leaderboard';
import { VsLobby } from './ui/VsLobby';
import { AutoPlayer } from './debug/AutoPlayer';

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

// Auto-reload when a new service worker takes over so the PWA gets the latest build
navigator.serviceWorker?.addEventListener('controllerchange', () => window.location.reload());

// Unlock AudioContext on first gesture (browser autoplay policy)
const unlockAudio = () => audio.unlock();
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', (e) => {
  unlockAudio();
  // Dismiss How to Play on any canvas tap
  if (e.target === canvas) renderer.setShowHowToPlay(false);
});

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
onScreenControls.setHowToPlayHandler(() => renderer.toggleHowToPlay());

const vsClient = vsLobby.getClient();

// VS intro state
const VS_INTRO_MS = 3000;
let vsIntroState: { seed: number; ourName: string; opponentName: string; difficulty: Difficulty; countdownMs: number } | null = null;

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
      audio.sfxCurse();
      renderer.triggerCurse();
    } else if (ev.type === 'gameover') {
      input.inject({ type: 'VS_WIN' });
      vsClient.stopPolling();
    } else if (ev.type === 'disconnect') {
      renderer.setVsDisconnectWin(true);
      input.inject({ type: 'VS_WIN' });
      vsClient.stopPolling();
    } else if (ev.type === 'ready') {
      // opponentName updated in VsClient.poll; difficulty override for player B
      if (vsIntroState) {
        vsIntroState.opponentName = vsClient.opponentName;
        const p = ev.payload as { difficulty?: string };
        if (p.difficulty && vsIntroState.difficulty === 'normal') {
          vsIntroState.difficulty = p.difficulty as Difficulty;
        }
      }
    }
  };
  vsClient.onStaleDisconnect = () => {
    renderer.setVsDisconnectWin(true);
    input.inject({ type: 'VS_WIN' });
    vsClient.stopPolling();
  };
}
wireVsEvents();

onScreenControls.setVsHandler(() => {
  vsLobby.show((matchId, seed, player, difficulty, myName) => {
    vsClient.matchId = matchId;
    vsClient.player  = player;
    wireVsEvents();          // restore handler after lobby overwrites it
    vsClient.startPolling();
    renderer.setVsDisconnectWin(false);
    vsClient.sendReady(myName, difficulty);
    // Start intro countdown — game will start after it finishes
    vsIntroState = { seed, difficulty, ourName: myName, opponentName: '', countdownMs: VS_INTRO_MS };
    renderer.setVsIntro(vsIntroState);
  });
});

// Backtick toggles debug overlay; F fires VS power; Ctrl+D toggles auto-play bot; ? = how to play
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') renderer.debugMode = !renderer.debugMode;
  if (e.code === 'KeyD' && e.ctrlKey) {
    e.preventDefault();
    autoPlayer.toggle();
  }
  if (e.code === 'KeyF' && state.mode === 'versus' && state.phase === 'playing') {
    input.inject({ type: 'FIRE_POWER' });
  }
  if (e.key === '?') renderer.toggleHowToPlay();
});

window.addEventListener('beforeunload', () => {
  if (state.mode === 'versus' && state.phase === 'playing') {
    vsClient.disconnect();
  }
});

const FIXED_MS = 1000 / 60;
const WAVE_CLEAR_AUTO_MS = 3000;

const autoPlayer = new AutoPlayer();

let acc = 0;
let last = performance.now();
let waveClearEnteredAt: number | null = null;
let lastSpeedTier = -1;
let lastPhase = state.phase;
let titleLeaderboardFetched = false;
let vsBoardSyncTimer = 0;

// ── Tutorial state machine ────────────────────────────────────────────────────
// Steps:
//  1 — catch first tile (show "catch" message + paddle highlight)
//  2 — drop first tile into well  (after first catch)
//  3 — make first KLUX            (after first drop)
//  4/5/6 — three timed messages   (after first KLUX, 3 s each with fade)
const isTouchLike = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;
type TutStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // 0=inactive, 7=done
let tutStep: TutStep = getTutorialDone() ? 7 : 1;
let tutAlpha = 0;       // current rendered alpha
let tutFadeDir = 1;     // +1 fade in, -1 fade out
let tutHoldMs = 0;      // ms remaining at full alpha (steps 4-6 only)
const TUT_FADE_MS = 500;
const TUT_HOLD_MS = 3000;

function tutMessage(step: TutStep): string {
  const mobile = isTouchLike();
  switch (step) {
    case 1: return mobile
      ? 'Tap a lane to catch a tile'
      : 'Hover a lane (or use ← →) to move\nthen catch a tile on your paddle';
    case 2: return mobile
      ? 'Tap the same lane again to drop\na tile into the well'
      : 'Click (or press Space / ↓) to drop\na tile into the well';
    case 3: return 'Place 3 matching tiles\nin a row for a KLUX!';
    case 4: return 'Horizontal KLUXes score more\nthan vertical ones';
    case 5: return 'Diagonals beat horizontals!';
    case 6: return 'Good luck!';
    default: return '';
  }
}

function tutTick(dtMs: number): void {
  if (tutStep === 0 || tutStep === 7) return;

  // Steps 4–6: hold then auto-advance
  if (tutStep >= 4) {
    if (tutFadeDir === 1) {
      tutAlpha = Math.min(1, tutAlpha + dtMs / TUT_FADE_MS);
      if (tutAlpha >= 1) { tutAlpha = 1; tutFadeDir = 0; tutHoldMs = TUT_HOLD_MS; }
    } else if (tutFadeDir === 0) {
      tutHoldMs -= dtMs;
      if (tutHoldMs <= 0) tutFadeDir = -1;
    } else {
      tutAlpha = Math.max(0, tutAlpha - dtMs / TUT_FADE_MS);
      if (tutAlpha <= 0) {
        const next = (tutStep + 1) as TutStep;
        if (next > 6) { tutStep = 7; setTutorialDone(); }
        else { tutStep = next; tutFadeDir = 1; }
      }
    }
  } else {
    // Steps 1–3: fade in to max, stay until trigger
    tutAlpha = Math.min(1, tutAlpha + dtMs / TUT_FADE_MS);
  }
}

function tutAdvance(to: TutStep): void {
  if (tutStep === 7 || tutStep >= to) return;
  tutStep = to;
  tutAlpha = 0;
  tutFadeDir = 1;
  tutHoldMs = 0;
  if (to === 7) setTutorialDone();
}
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTitleLeaderboard(): Promise<void> {
  const keys: string[] = ['classic', 'endless', 'classic_hard', 'endless_hard', 'classic_elite', 'endless_elite'];
  const results = await Promise.all(keys.map(k => getTopScores(k, 5)));
  const map: Record<string, LeaderboardEntry[]> = {};
  keys.forEach((k, i) => { map[k] = results[i]; });
  renderer.setTitleLeaderboard(map);
}

// Pre-fetch on load so the title screen shows it immediately
fetchTitleLeaderboard().catch(() => {});

let pausedByHide = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.phase === 'playing') {
      state = { ...state, phase: 'paused' };
      pausedByHide = true;
    }
  } else {
    last = performance.now();
    if (pausedByHide && state.phase === 'paused') {
      state = { ...state, phase: 'playing' };
    }
    pausedByHide = false;
  }
});

function frame(now: number): void {
  const frameDt = Math.min(now - last, 250);
  acc += frameDt;
  last = now;

  // VS intro countdown — delay game start until countdown finishes
  if (vsIntroState) {
    vsIntroState.countdownMs -= frameDt;
    vsIntroState.opponentName = vsClient.opponentName;
    renderer.setVsIntro({ ...vsIntroState });
    if (vsIntroState.countdownMs <= 0) {
      const { seed, difficulty } = vsIntroState;
      vsIntroState = null;
      renderer.setVsIntro(null);
      // Force state so START_VS is accepted
      if (state.phase !== 'title' && state.phase !== 'gameOver') {
        state = { ...state, phase: 'gameOver' };
      }
      input.inject({ type: 'START_VS', seed, difficulty });
    }
  }

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

  // Auto-player — ticks once per render frame, injects at most one command
  const autoCmd = autoPlayer.tick(frameDt, state);
  if (autoCmd) input.inject(autoCmd);

  let tutCaught = false;
  let tutDropped = false;
  let tutKluxed = false;

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
    if (state.fx.caught) tutCaught = true;
    if (state.fx.tileDropped) tutDropped = true;
    if (state.fx.clears.length > 0) tutKluxed = true;
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
      vsClient.sendBoard(encoded, state.dropsRemaining, state.vsPowerMeter);
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
      const diff = state.config.difficulty;
      const isNewBest = recordScore(state.mode, diff, state.score);
      renderer.setNewBest(isNewBest);
      renderer.setLeaderboard(null);
      if (isNewBest) {
        highScores = {
          classic: getHighScore('classic', diff),
          endless: getHighScore('endless', diff),
        };
        renderer.setHighScores(highScores);
      }
      const capturedMode  = state.mode;
      const capturedScore = state.score;
      const capturedWave  = state.wave.index + 1;
      const capturedDiff  = diff;
      nameEntry.show(async (name) => {
        const lbMode = leaderboardKey(capturedMode, capturedDiff);
        await postScore(lbMode, name, capturedScore, capturedWave);
        const lbKeys = ['classic', 'endless', 'classic_hard', 'endless_hard', 'classic_elite', 'endless_elite'];
        const [entries, ...lbResults] = await Promise.all([
          getTopScores(lbMode, 10),
          ...lbKeys.map(k => getTopScores(k, 5)),
        ]) as [LeaderboardEntry[], ...LeaderboardEntry[][]];
        const lbMap: Record<string, LeaderboardEntry[]> = {};
        lbKeys.forEach((k, i) => { lbMap[k] = lbResults[i]; });
        renderer.setLeaderboard(entries, capturedScore);
        renderer.setTitleLeaderboard(lbMap);
        nameEntry.showResults(
          () => input.inject(capturedMode === 'classic'
            ? { type: 'START_CLASSIC', difficulty: capturedDiff }
            : { type: 'START_ENDLESS', difficulty: capturedDiff }),
          () => input.inject({ type: 'QUIT_TO_TITLE' }),
        );
      });
    }
  }
  if (state.phase === 'playing' && lastPhase !== 'playing') {
    renderer.setNewBest(false);
    renderer.setLeaderboard(null);
    nameEntry.hide();
    // Update high scores display for the current difficulty
    const diff = state.config.difficulty;
    highScores = {
      classic: getHighScore('classic', diff),
      endless: getHighScore('endless', diff),
    };
    renderer.setHighScores(highScores);
  }
  if (state.phase === 'title' && lastPhase !== 'title') {
    // Clean up VS session if quitting mid-game
    if (lastPhase === 'playing' || lastPhase === 'paused') {
      if (vsClient.matchId) vsClient.disconnect();
    }
    renderer.setVsDisconnectWin(false);
    if (!titleLeaderboardFetched) {
      titleLeaderboardFetched = true;
    } else {
      fetchTitleLeaderboard().catch(() => {});
    }
  }

  // Tutorial state machine ticks every render frame
  if (state.phase === 'playing' && state.mode !== 'versus') {
    tutTick(frameDt);
    if (tutStep === 1 && tutCaught) tutAdvance(2);
    if (tutStep === 2 && tutDropped) tutAdvance(3);
    if (tutStep === 3 && tutKluxed) tutAdvance(4);
    const msg = tutMessage(tutStep as TutStep);
    renderer.setTutorial(msg, tutAlpha);
  } else if (state.phase !== 'playing') {
    renderer.setTutorial('', 0);
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
    renderer.setOpponentState(vsClient.opponentWell, vsClient.opponentDrops, vsClient.opponentPower, vsClient.boardEventCount);
  }
  renderer.setAutoPlay(autoPlayer.enabled);
  try {
    renderer.draw(state, acc / FIXED_MS, pointerAdapter.hoveredLane);
  } catch (err) {
    console.error('[KLUX] render crash:', err);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
