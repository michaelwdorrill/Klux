import type { FxState, KluxLine, ClearEvent } from '../core/types';
import type { Layout } from './layout';
import { FILL_COLORS } from './tiles';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  ttl: number;
  maxTtl: number;
  gravity: number;
}

interface Popup {
  x: number;
  y: number;
  vy: number;
  text: string;
  size: number;
  color: string;
  ttl: number;
  maxTtl: number;
}

/** Tween state for a single well tile. A new target retargets in flight,
 *  starting from the currently-rendered position — "snap to truth" never
 *  hard-snaps, but it does redirect quickly to wherever core says the tile is. */
interface TileAnim {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  curX: number;
  curY: number;
  startedAt: number;
}

interface OwenBurst {
  ttl: number;
  maxTtl: number;
}

const SHAKE_DECAY_PER_MS = 0.006;
const FOUL_FLASH_MS = 380;
const PARTICLES_PER_TILE = 7;
const PARTICLE_SPEED = 4.5;
const POPUP_RISE_PX_PER_MS = 0.06;
const POPUP_TTL_MS = 950;
const TILE_DROP_MS = 180;
const OWEN_MS = 1000;
const OWEN_PEAK_ALPHA = 0.35;

export class Effects {
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private shake = 0;
  private foulFlashTtl = 0;
  private prevPhase: string | null = null;

  private tileAnims = new Map<number, TileAnim>();
  private aliveThisFrame = new Set<number>();
  private now = 0;

  private owenImg: HTMLImageElement | null = null;
  private owenReady = false;
  private owenBurst: OwenBurst | null = null;

  loadOwen(url: string): void {
    const img = new Image();
    img.onload = () => { this.owenReady = true; };
    img.src = url;
    this.owenImg = img;
  }

  /** Trigger the Owen easter egg overlay. */
  triggerOwen(): void {
    this.owenBurst = { ttl: OWEN_MS, maxTtl: OWEN_MS };
  }

  /** Ingest fx events from the current step and advance physics. */
  tick(dtMs: number, fx: FxState, layout: Layout, phase: string): void {
    this.now += dtMs;

    for (const ev of fx.clears) {
      this.handleClear(ev, layout);
    }

    if (fx.lastFoul === 'missed' || fx.lastFoul === 'fullColumn') {
      this.shake = Math.max(this.shake, 9);
      this.foulFlashTtl = FOUL_FLASH_MS;
    }

    if (phase === 'gameOver' && this.prevPhase === 'playing') {
      this.shake = Math.max(this.shake, 18);
      this.foulFlashTtl = FOUL_FLASH_MS * 1.5;
    }
    this.prevPhase = phase;

    // Particles
    const stepFactor = dtMs / 16;
    for (const p of this.particles) {
      p.x += p.vx * stepFactor;
      p.y += p.vy * stepFactor;
      p.vy += p.gravity * stepFactor;
      p.vx *= Math.pow(0.96, stepFactor);
      p.ttl -= dtMs;
    }
    this.particles = this.particles.filter((p) => p.ttl > 0);

    // Popups
    for (const p of this.popups) {
      p.y -= p.vy * dtMs;
      p.ttl -= dtMs;
    }
    this.popups = this.popups.filter((p) => p.ttl > 0);

    // Shake + flash
    this.shake *= Math.pow(1 - SHAKE_DECAY_PER_MS, dtMs);
    if (this.shake < 0.2) this.shake = 0;
    if (this.foulFlashTtl > 0) this.foulFlashTtl -= dtMs;

    // Owen
    if (this.owenBurst) {
      this.owenBurst.ttl -= dtMs;
      if (this.owenBurst.ttl <= 0) this.owenBurst = null;
    }
  }

  /** Reset all tile anim state — used between waves / on new game / endless flips. */
  resetTileAnims(): void {
    this.tileAnims.clear();
  }

  beginFrame(): void {
    this.aliveThisFrame.clear();
  }

  /** Returns the visual top-left for a tile. Tween animates from previous
   *  position toward target; new tiles snap. Mid-tween retarget restarts
   *  from current eased position so chains feel continuous. */
  getTileDrawPosition(tileId: number, targetX: number, targetY: number): { x: number; y: number } {
    this.aliveThisFrame.add(tileId);
    let anim = this.tileAnims.get(tileId);

    if (!anim) {
      anim = {
        startX: targetX, startY: targetY,
        targetX, targetY,
        curX: targetX, curY: targetY,
        startedAt: this.now,
      };
      this.tileAnims.set(tileId, anim);
      return { x: targetX, y: targetY };
    }

    if (anim.targetX !== targetX || anim.targetY !== targetY) {
      anim.startX = anim.curX;
      anim.startY = anim.curY;
      anim.targetX = targetX;
      anim.targetY = targetY;
      anim.startedAt = this.now;
    }

    const elapsed = this.now - anim.startedAt;
    const t = Math.min(1, elapsed / TILE_DROP_MS);
    const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
    anim.curX = anim.startX + (anim.targetX - anim.startX) * e;
    anim.curY = anim.startY + (anim.targetY - anim.startY) * e;
    return { x: anim.curX, y: anim.curY };
  }

  endFrame(): void {
    for (const id of this.tileAnims.keys()) {
      if (!this.aliveThisFrame.has(id)) this.tileAnims.delete(id);
    }
  }

  /** Current shake offset to apply via ctx.translate() before drawing the world. */
  shakeOffset(): { x: number; y: number } {
    if (this.shake === 0) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * this.shake * 2,
      y: (Math.random() - 0.5) * this.shake * 2,
    };
  }

  /** Particle burst — drawn inside the shaken world transform. */
  drawWorld(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const lifeFrac = Math.max(0, p.ttl / p.maxTtl);
      ctx.save();
      ctx.globalAlpha = Math.min(1, lifeFrac * 1.4);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.5 + lifeFrac * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Score popups + foul flash + Owen burst — drawn above the HUD. */
  drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, playfieldWidth: number, playfieldCenterX: number, playfieldCenterY: number): void {
    // Owen first (so popups read on top of him)
    if (this.owenBurst && this.owenReady && this.owenImg) {
      const o = this.owenBurst;
      const lifeFrac = 1 - o.ttl / o.maxTtl; // 0 → 1
      const alpha = OWEN_PEAK_ALPHA * Math.sin(Math.PI * lifeFrac); // 0 → peak → 0
      const widthFrac = 0.5 + 0.5 * lifeFrac; // 50% → 100%
      const targetW = playfieldWidth * widthFrac;
      const imgRatio = this.owenImg.naturalWidth / this.owenImg.naturalHeight || 1;
      const targetH = targetW / imgRatio;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.owenImg, playfieldCenterX - targetW / 2, playfieldCenterY - targetH / 2, targetW, targetH);
      ctx.restore();
    }

    if (this.foulFlashTtl > 0) {
      const a = (this.foulFlashTtl / FOUL_FLASH_MS) * 0.35;
      ctx.save();
      ctx.fillStyle = `rgba(230, 57, 70, ${a})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    for (const p of this.popups) {
      const lifeFrac = p.ttl / p.maxTtl;
      const alpha = Math.min(1, lifeFrac * 1.6);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${p.size}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, p.size * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      ctx.restore();
    }
  }

  // ── Internal ─────────────────────────────────────────────────────

  private handleClear(ev: ClearEvent, layout: Layout): void {
    const isMulti = ev.lines.length > 1;
    const isChain = ev.chainStep > 1;
    const isBigDiagonal = ev.lines.some((l) => l.orientation === 'diagonal');

    let shake = 5;
    if (isBigDiagonal) shake += 4;
    if (isMulti) shake += 4;
    shake += Math.min(8, (ev.chainStep - 1) * 3);
    this.shake = Math.max(this.shake, shake);

    for (const line of ev.lines) {
      this.spawnLineParticles(line, layout, ev.chainStep);
    }

    const biggest = ev.lines.reduce((a, b) => (b.tiles.length > a.tiles.length ? b : a));
    const center = lineCentroid(biggest, layout);
    const popupColor = isChain
      ? '#ffd166'
      : isMulti
        ? '#ff5d8f'
        : biggest.orientation === 'diagonal'
          ? '#ffd166'
          : '#ffffff';
    const popupSize = Math.max(16, layout.cellSize * (isMulti || isChain ? 0.65 : 0.5));

    let label = ev.points < 0
      ? ev.points.toLocaleString()           // already has leading minus
      : `+${ev.points.toLocaleString()}`;
    if (isChain) label = `×${ev.chainStep} CHAIN  ${label}`;
    else if (isMulti) label = `MULTI ×${ev.lines.length}  ${label}`;
    else if (biggest.orientation === 'diagonal') label = `DIAGONAL  ${label}`;

    this.popups.push({
      x: center.x,
      y: center.y,
      vy: POPUP_RISE_PX_PER_MS,
      text: label,
      size: popupSize,
      color: popupColor,
      ttl: POPUP_TTL_MS,
      maxTtl: POPUP_TTL_MS,
    });
  }

  private spawnLineParticles(line: KluxLine, layout: Layout, chainStep: number): void {
    const fillColor = FILL_COLORS[line.color % FILL_COLORS.length];
    const speed = PARTICLE_SPEED + Math.min(3, chainStep * 0.7);

    for (const { row, col } of line.tiles) {
      const { x, y } = wellCellCenter(layout, row, col);
      for (let i = 0; i < PARTICLES_PER_TILE; i++) {
        const angle = Math.random() * Math.PI * 2;
        const v = speed * (0.5 + Math.random() * 0.7);
        const ttl = 500 + Math.random() * 350;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v - 1.2,
          r: 2 + Math.random() * 2.5,
          color: fillColor,
          ttl,
          maxTtl: ttl,
          gravity: 0.22,
        });
      }
    }
  }
}

function wellCellCenter(layout: Layout, row: number, col: number): { x: number; y: number } {
  const { cellSize, rows, wellOrigin } = layout;
  return {
    x: wellOrigin.x + col * cellSize + cellSize / 2,
    y: wellOrigin.y + (rows - 1 - row) * cellSize + cellSize / 2,
  };
}

function lineCentroid(line: KluxLine, layout: Layout): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const { row, col } of line.tiles) {
    const c = wellCellCenter(layout, row, col);
    sx += c.x;
    sy += c.y;
  }
  return { x: sx / line.tiles.length, y: sy / line.tiles.length };
}
