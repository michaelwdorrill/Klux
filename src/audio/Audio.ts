import type { FxState } from '../core/types';

// Music playback rate scales with the game's tempo — 0 = base speed, 1 = max
// game speed (spawn interval at the floor). Caller passes a normalized factor.
const MUSIC_BASE_RATE = 1.0;
const MUSIC_MAX_RATE = 1.45;
const MUSIC_RAMP_S = 2.5;
const MUSIC_VOLUME = 0.38;

// Each chain step raises Klux.wav pitch by 4 semitones
const CHAIN_SEMITONES_PER_STEP = 4;
const SEMITONE_RATIO = Math.pow(2, 1 / 12);

function rateForFactor(speedFactor: number): number {
  const clamped = Math.max(0, Math.min(1, speedFactor));
  return MUSIC_BASE_RATE + (MUSIC_MAX_RATE - MUSIC_BASE_RATE) * clamped;
}

function chainPitchRate(chainStep: number): number {
  return Math.pow(SEMITONE_RATIO, CHAIN_SEMITONES_PER_STEP * (chainStep - 1));
}

const SFX_FILES: Record<string, string> = {
  Catch: './audio/Catch.wav',
  Drop: './audio/Drop.wav',
  Klux: './audio/Klux.wav',
  LevelClear: './audio/LevelClear.wav',
  Wow: './audio/wow.mp3',
  Curse: './audio/Curse.wav',
};

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicBuffer: AudioBuffer | null = null;

  private sfxBuffers = new Map<string, AudioBuffer>();
  private sfxRaw = new Map<string, ArrayBuffer>();

  private muted = false;
  private musicPlaying = false;
  private currentSpeedFactor = 0;

  // ── Lifecycle ────────────────────────────────────────────────────

  /** True once the AudioContext is running (either via autoplay or user gesture). */
  get isUnlocked(): boolean { return this.ctx?.state === 'running'; }

  /** Suspend audio output (page hidden / app backgrounded). */
  suspend(): void { this.ctx?.suspend(); }

  /** Resume audio output (page visible again). */
  resume(): void { if (this.ctx?.state === 'suspended') this.ctx.resume(); }

  /** Call on the first user gesture to satisfy browser autoplay policy. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = MUSIC_VOLUME;
    this.musicGain.connect(this.master);

    // Decode any SFX that were fetched before the AudioContext existed
    void this.decodePendingSfx();

    if (this.musicBuffer && !this.musicPlaying) this.startMusicInternal();
  }

  /** Attempt silent autoplay — resolves true if audio started, false if blocked. */
  async tryAutoplay(): Promise<boolean> {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = MUSIC_VOLUME;
        this.musicGain.connect(this.master);
        void this.decodePendingSfx();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      if (this.ctx.state === 'running') {
        if (this.musicBuffer && !this.musicPlaying) this.startMusicInternal();
        return true;
      }
    } catch { /* blocked */ }
    return false;
  }

  /** Load the background music file. Silently no-ops if missing or on error. */
  async loadMusic(url: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const raw = await res.arrayBuffer();
      const decodeCtx = this.ctx ?? new AudioContext();
      this.musicBuffer = await decodeCtx.decodeAudioData(raw);
      if (this.ctx && !this.musicPlaying) this.startMusicInternal();
    } catch {
      // Music is optional
    }
  }

  /** Fetch all WAV SFX files. Decodes immediately if AudioContext is ready,
   *  otherwise stores raw bytes for decoding on first user gesture. */
  loadSfxFiles(): void {
    for (const [key, url] of Object.entries(SFX_FILES)) {
      void this.fetchSfx(key, url);
    }
  }

  private async fetchSfx(key: string, url: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const raw = await res.arrayBuffer();
      if (this.ctx) {
        this.sfxBuffers.set(key, await this.ctx.decodeAudioData(raw));
      } else {
        this.sfxRaw.set(key, raw);
      }
    } catch {
      // SFX is optional
    }
  }

  private async decodePendingSfx(): Promise<void> {
    if (!this.ctx) return;
    for (const [key, raw] of this.sfxRaw) {
      try {
        this.sfxBuffers.set(key, await this.ctx.decodeAudioData(raw));
      } catch {
        // skip undecodable file
      }
    }
    this.sfxRaw.clear();
  }

  // ── Music control ────────────────────────────────────────────────

  /** Set music tempo as a normalized speed factor (0 = base, 1 = max game speed).
   *  Caller derives this from the actual game tempo so music tracks gameplay
   *  instead of just wave-number. */
  setSpeedFactor(factor: number): void {
    this.currentSpeedFactor = Math.max(0, Math.min(1, factor));
    if (this.musicSource && this.ctx) {
      const target = rateForFactor(this.currentSpeedFactor);
      this.musicSource.playbackRate.linearRampToValueAtTime(
        target,
        this.ctx.currentTime + MUSIC_RAMP_S
      );
    }
  }

  private startMusicInternal(): void {
    if (!this.ctx || !this.musicBuffer || !this.musicGain) return;
    this.musicSource?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    src.loop = true;
    src.playbackRate.value = rateForFactor(this.currentSpeedFactor);
    src.connect(this.musicGain);
    src.start();
    this.musicSource = src;
    this.musicPlaying = true;
  }

  // ── SFX consumption (catch/foul each frame; clears handled per-event) ──

  consume(fx: FxState): void {
    if (!this.ctx || this.muted) return;
    if (fx.caught) this.playSfx('Catch');
    if (fx.lastFoul === 'missed' || fx.lastFoul === 'fullColumn') {
      this.playSfx('Drop');
    }
  }

  /** Normal Klux SFX — pitched up per chain step, louder for multi-KLUX. */
  playKlux(chainStep: number, lineCount: number): void {
    if (!this.ctx || this.muted) return;
    const gainMult = lineCount > 1 ? 1.6 : 1.0;
    const rate = chainPitchRate(chainStep);
    this.playSfx('Klux', gainMult, rate);
  }

  /** Easter-egg Klux substitute. Plays in place of Klux.wav. */
  playWow(): void {
    if (!this.ctx || this.muted) return;
    this.playSfx('Wow', 1.4);
  }

  /** Play the curse sound when an opponent power hits you. */
  sfxCurse(): void {
    this.playSfx('Curse', 1.8);
  }

  /** Play the level-clear jingle (called from main.ts on waveClear transition).
   *  Ducks the music so the jingle is the moment. */
  sfxWaveClear(): void {
    this.playSfx('LevelClear', 2.2);
    this.duckMusic(2.6);
  }

  private duckMusic(durationS: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const g = this.musicGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(MUSIC_VOLUME * 0.75, t + 0.08);
    g.setValueAtTime(MUSIC_VOLUME * 0.75, t + durationS - 0.4);
    g.linearRampToValueAtTime(MUSIC_VOLUME, t + durationS);
  }

  // ── Settings ─────────────────────────────────────────────────────

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  get isMuted(): boolean { return this.muted; }

  // ── Low-level WAV playback ────────────────────────────────────────

  private playSfx(key: string, gainMult = 1.0, rate = 1.0, delayS = 0): void {
    if (!this.ctx || !this.master) return;
    const buffer = this.sfxBuffers.get(key);
    if (!buffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const env = this.ctx.createGain();
    env.gain.value = gainMult;

    src.connect(env);
    env.connect(this.master);
    src.start(this.ctx.currentTime + delayS);
  }
}
