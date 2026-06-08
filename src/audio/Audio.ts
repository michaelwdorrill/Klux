import type { FxState } from '../core/types';

// Music playback rate per wave index — 2.2% faster each wave, capped at 1.45×
// At 1.45× a 120 BPM track plays at ~174 BPM, which is intense but readable.
const MUSIC_BASE_RATE = 1.0;
const MUSIC_RATE_PER_WAVE = 0.022;
const MUSIC_MAX_RATE = 1.45;
const MUSIC_RAMP_S = 2.5; // seconds to ramp to new rate when wave changes
const MUSIC_VOLUME = 0.38;

function waveRate(waveIndex: number): number {
  return Math.min(MUSIC_MAX_RATE, MUSIC_BASE_RATE + waveIndex * MUSIC_RATE_PER_WAVE);
}

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicBuffer: AudioBuffer | null = null;

  private muted = false;
  private musicPlaying = false;
  private currentWave = 0;

  // ── Lifecycle ────────────────────────────────────────────────────

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

    // Start music if the buffer was already decoded
    if (this.musicBuffer && !this.musicPlaying) {
      this.startMusicInternal();
    }
  }

  /** Load the background music file. Silently no-ops if missing or on error. */
  async loadMusic(url: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const raw = await res.arrayBuffer();
      // Decode using existing ctx or a temporary one
      const decodeCtx = this.ctx ?? new AudioContext();
      this.musicBuffer = await decodeCtx.decodeAudioData(raw);
      if (this.ctx && !this.musicPlaying) this.startMusicInternal();
    } catch {
      // Music is optional — SFX always works
    }
  }

  // ── Music control ────────────────────────────────────────────────

  /** Notify the audio system that the wave changed so it can ramp the tempo. */
  setWave(waveIndex: number): void {
    this.currentWave = waveIndex;
    if (this.musicSource && this.ctx) {
      const target = waveRate(waveIndex);
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
    src.playbackRate.value = waveRate(this.currentWave);
    src.connect(this.musicGain);
    src.start();
    this.musicSource = src;
    this.musicPlaying = true;
  }

  // ── SFX consumption (called every frame with game FX state) ──────

  consume(fx: FxState): void {
    if (!this.ctx || this.muted) return;

    if (fx.caught) this.sfxCatch();

    if (fx.lastFoul === 'missed' || fx.lastFoul === 'fullColumn') {
      this.sfxFoul();
    }

    for (const ev of fx.clears) {
      if (ev.chainStep > 1) {
        this.sfxChain(ev.chainStep);
      } else {
        this.sfxKlux(ev.lines.length);
      }
    }
  }

  // ── Individual SFX ───────────────────────────────────────────────

  sfxCatch(): void {
    // Short rising blip
    this.tone(320, 520, 0.07, 'sine', 0.18);
  }

  sfxDrop(): void {
    // Soft thud
    this.tone(160, 90, 0.12, 'triangle', 0.22);
  }

  sfxWaveClear(): void {
    // Ascending 5-note jingle
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this.tone(f, f, 0.1, 'square', 0.2, i * 0.1)
    );
  }

  private sfxKlux(lineCount: number): void {
    // Rising arpeggio; extra high note for multi-KLUX
    const notes = [523, 659, 784];
    if (lineCount > 1) notes.push(1047);
    notes.forEach((f, i) => this.tone(f, f * 1.015, 0.07, 'square', 0.22, i * 0.07));
  }

  private sfxChain(step: number): void {
    // Each chain step starts a semitone higher
    const base = 523 * Math.pow(1.122, step - 1); // ~one tone per step
    [base, base * 1.26, base * 1.5].forEach((f, i) =>
      this.tone(f, f * 1.01, 0.07, 'square', 0.28, i * 0.06)
    );
  }

  private sfxFoul(): void {
    // Descending buzz
    this.tone(280, 110, 0.22, 'sawtooth', 0.25);
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

  // ── Low-level tone generator ──────────────────────────────────────

  private tone(
    startHz: number,
    endHz: number,
    durationS: number,
    type: OscillatorType,
    gain: number,
    delayS = 0
  ): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delayS;

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startHz, t);
    if (endHz !== startHz) {
      osc.frequency.linearRampToValueAtTime(endHz, t + durationS);
    }

    env.gain.setValueAtTime(gain * 0.28, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + durationS);

    osc.connect(env);
    env.connect(this.master);
    osc.start(t);
    osc.stop(t + durationS + 0.02);
  }
}
