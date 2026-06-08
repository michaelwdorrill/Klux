import type { GameState, GoalType } from '../core/types';
import { computeLayout, type Layout } from './layout';
import { drawTile, drawGhostTile, FILL_COLORS } from './tiles';
import { Effects } from './effects';

const BG = '#1a1a2e';
const WELL_BG = '#16213e';
const WELL_LINE = '#0f3460';
const CONVEYOR_BG = '#0d1b2a';
const PADDLE_ACTIVE = '#2a4a7a';
const PADDLE_BG = '#1e2d4a';
const TEXT_PRIMARY = '#e0e0e0';
const TEXT_DIM = 'rgba(180,180,200,0.7)';
const DROP_FULL = '#e63946';
const DROP_EMPTY = 'rgba(255,255,255,0.15)';

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private layout: Layout | null = null;
  private readonly effects = new Effects();
  private lastFrameMs = 0;
  debugMode = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  getLayout(): Layout | null {
    return this.layout;
  }

  draw(state: GameState, alpha: number): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;
    const { config } = state;

    this.layout = computeLayout(w, h, config.cols, config.rows);
    const layout = this.layout;
    const ctx = this.ctx;

    const now = performance.now();
    const dtMs = this.lastFrameMs === 0 ? 16 : Math.min(64, now - this.lastFrameMs);
    this.lastFrameMs = now;
    this.effects.tick(dtMs, state.fx, layout, state.phase);

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    // World layer (shaken)
    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    this.drawWell(state, layout);
    this.drawConveyor(state, layout, alpha);
    this.drawPaddle(state, layout);
    this.effects.drawWorld(ctx);
    ctx.restore();

    // HUD + popups (steady)
    this.drawHud(state, layout, w, h);
    this.effects.drawOverlay(ctx, w, h);

    if (state.phase !== 'playing') {
      this.drawOverlay(state, w, h, layout.cellSize);
    }

    if (this.debugMode) {
      this.drawDebug(state, w);
    }
  }

  private drawDebug(state: GameState, w: number): void {
    const { ctx } = this;
    const lines = [
      `phase: ${state.phase}`,
      `conveyor: ${state.conveyor.length} tiles`,
      `spawn in: ${(state.spawnTimer / 1000).toFixed(2)}s`,
      `paddle: [${state.paddle.map((t) => t.color).join(',')}] lane ${state.paddleLane}`,
      `drops: ${state.dropsRemaining}`,
      `wave: ${state.wave.index + 1}  goal: ${state.wave.goal} ${state.waveProgress}/${state.wave.target}`,
      `tiles fed: ${state.tilesFedThisWave}`,
    ];
    const lh = 16;
    const pad = 6;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(w - 260, 0, 260, lines.length * lh + pad * 2);
    ctx.fillStyle = '#00ff88';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, w - 254, pad + i * lh));
    ctx.restore();
  }

  drawOverlay(state: GameState, w: number, h: number, cellSize: number): void {
    const { ctx } = this;
    const cx = w / 2;
    const cy = h / 2;
    const titleSize = Math.max(18, Math.min(36, cellSize * 0.7));
    const subSize = Math.max(12, Math.min(18, cellSize * 0.36));

    ctx.fillStyle = 'rgba(10,12,24,0.82)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (state.phase === 'title') {
      ctx.fillStyle = '#e0e0e0';
      ctx.font = `bold ${titleSize * 1.6}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('KLUX', cx, cy - titleSize * 1.2);
      ctx.font = `${subSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(200,200,220,0.8)';
      ctx.fillText('Press Enter to play', cx, cy);
      ctx.fillStyle = 'rgba(140,140,160,0.6)';
      ctx.font = `${subSize * 0.85}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('Arrow keys / WASD  ·  Space = drop  ·  P = pause  ·  M = mute', cx, cy + subSize * 1.8);
    }

    if (state.phase === 'paused') {
      ctx.fillStyle = '#e0e0e0';
      ctx.font = `bold ${titleSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('PAUSED', cx, cy - subSize);
      ctx.fillStyle = 'rgba(200,200,220,0.7)';
      ctx.font = `${subSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('Press P or Enter to resume', cx, cy + subSize);
    }

    if (state.phase === 'waveClear') {
      ctx.fillStyle = '#06d6a0';
      ctx.font = `bold ${titleSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(`WAVE ${state.wave.index + 1} CLEAR!`, cx, cy - subSize * 2.2);

      ctx.fillStyle = '#e0e0e0';
      ctx.font = `${subSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(`Score: ${state.score}`, cx, cy - subSize * 0.6);

      const bonus = state.dropsRemaining * state.config.scoring.waveClearPerDrop;
      if (bonus > 0) {
        ctx.fillStyle = '#f4a261';
        ctx.font = `${subSize * 0.9}px 'Segoe UI', system-ui, sans-serif`;
        ctx.fillText(`+${bonus} drop bonus`, cx, cy + subSize * 0.7);
      }

      ctx.fillStyle = 'rgba(200,200,220,0.6)';
      ctx.font = `${subSize * 0.85}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('Enter to continue · auto-advancing…', cx, cy + subSize * 2.2);
    }

    if (state.phase === 'gameOver') {
      ctx.fillStyle = '#e63946';
      ctx.font = `bold ${titleSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('GAME OVER', cx, cy - subSize * 1.5);
      ctx.fillStyle = '#e0e0e0';
      ctx.font = `${subSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(`Final score: ${state.score}`, cx, cy + subSize * 0.2);
      ctx.fillStyle = 'rgba(200,200,220,0.7)';
      ctx.font = `${subSize * 0.9}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('Press Enter to play again', cx, cy + subSize * 1.8);
    }
  }

  private drawWell(state: GameState, layout: Layout): void {
    const { ctx } = this;
    const { cellSize, cols, rows, wellOrigin } = layout;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = wellOrigin.x + col * cellSize;
        const y = wellOrigin.y + (rows - 1 - row) * cellSize; // row 0 = bottom

        ctx.fillStyle = WELL_BG;
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, cellSize - 2, cellSize - 2, 3);
        ctx.fill();

        ctx.strokeStyle = WELL_LINE;
        ctx.lineWidth = 1;
        ctx.stroke();

        const tile = state.well[row][col];
        if (tile !== null) {
          drawTile(ctx, x, y, cellSize, tile.color);
        }
      }
    }

    // Well border
    ctx.strokeStyle = '#1e3a6e';
    ctx.lineWidth = 2;
    ctx.strokeRect(wellOrigin.x, wellOrigin.y, cellSize * cols, cellSize * rows);
  }

  private drawConveyor(state: GameState, layout: Layout, alpha: number): void {
    const { ctx } = this;
    const { cellSize, cols, conveyorRows, conveyorOrigin } = layout;

    // Lane tracks
    for (let col = 0; col < cols; col++) {
      const x = conveyorOrigin.x + col * cellSize;
      ctx.fillStyle = CONVEYOR_BG;
      ctx.fillRect(x + 1, conveyorOrigin.y, cellSize - 2, cellSize * conveyorRows);

      // Dashed lane divider
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(x + cellSize, conveyorOrigin.y + cellSize * 0.5);
      ctx.lineTo(x + cellSize, conveyorOrigin.y + cellSize * (conveyorRows - 0.5));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Lip line (where tiles are caught)
    ctx.strokeStyle = 'rgba(100,180,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(conveyorOrigin.x, conveyorOrigin.y + cellSize * conveyorRows);
    ctx.lineTo(conveyorOrigin.x + cellSize * cols, conveyorOrigin.y + cellSize * conveyorRows);
    ctx.stroke();

    // Falling tiles — use alpha for sub-step interpolation
    const travelPx = cellSize * conveyorRows;
    for (const ft of state.conveyor) {
      const interpolatedProgress = Math.min(1, ft.progress + (alpha * 0.016) / 3);
      const x = conveyorOrigin.x + ft.lane * cellSize;
      const y = conveyorOrigin.y + interpolatedProgress * travelPx - cellSize;
      drawTile(ctx, x, y, cellSize, ft.tile.color);
    }
  }

  private drawPaddle(state: GameState, layout: Layout): void {
    const { ctx } = this;
    const { cellSize, cols, paddleOrigin } = layout;

    // Platform bar
    ctx.fillStyle = PADDLE_BG;
    ctx.fillRect(paddleOrigin.x, paddleOrigin.y + 2, cellSize * cols, cellSize - 4);

    // Ghost slots for all lanes
    for (let col = 0; col < cols; col++) {
      drawGhostTile(ctx, paddleOrigin.x + col * cellSize, paddleOrigin.y, cellSize);
    }

    // Active lane highlight
    const activeX = paddleOrigin.x + state.paddleLane * cellSize;
    ctx.fillStyle = PADDLE_ACTIVE;
    ctx.fillRect(activeX + 1, paddleOrigin.y + 2, cellSize - 2, cellSize - 4);

    // Show the TOP tile of the stack on the paddle bar
    if (state.paddle.length > 0) {
      const top = state.paddle[state.paddle.length - 1];
      drawTile(ctx, activeX, paddleOrigin.y, cellSize, top.color);

      // Stack indicator: a row of color dots at the bottom of the active cell.
      // Left = bottom of stack, right = top (next to drop, marked with white ring).
      // This lets the player see the full stack without looking away.
      const dotR = Math.max(4, cellSize * 0.09);
      const dotGap = dotR * 0.7;
      const dotCount = state.paddle.length;
      const rowW = dotCount * dotR * 2 + (dotCount - 1) * dotGap;
      let dotX = activeX + cellSize / 2 - rowW / 2 + dotR;
      const dotY = paddleOrigin.y + cellSize - dotR - 4;

      for (let i = 0; i < dotCount; i++) {
        const isTop = i === dotCount - 1;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = FILL_COLORS[state.paddle[i].color % FILL_COLORS.length];
        ctx.fill();
        if (isTop) {
          // White ring marks the tile that drops next
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        dotX += dotR * 2 + dotGap;
      }
    } else {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = `${cellSize * 0.45}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▼', activeX + cellSize / 2, paddleOrigin.y + cellSize / 2);
      ctx.restore();
    }

    // Stack panel: full stack shown to the right of the playfield (portrait)
    // or in the HUD (landscape) — drawn here so it's always on top of the bg
    this.drawStackPanel(state, layout);
  }

  private drawStackPanel(state: GameState, layout: Layout): void {
    const { ctx } = this;
    const { stackX, stackY, stackCellSize, paddleOrigin, isPortrait } = layout;
    const stack = state.paddle;
    if (stack.length === 0 && isPortrait) return;

    const labelSize = Math.max(9, stackCellSize * 0.28);
    const gap = 3;

    if (isPortrait) {
      // Vertical strip to the right: top = next-to-drop, downward = deeper in stack
      ctx.save();
      ctx.fillStyle = 'rgba(14,18,36,0.7)';
      const panelH = stack.length * (stackCellSize + gap) + labelSize + 6;
      ctx.fillRect(stackX - 4, stackY - labelSize - 6, stackCellSize + 8, panelH + 8);

      ctx.fillStyle = 'rgba(150,150,180,0.6)';
      ctx.font = `${labelSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('HELD', stackX + stackCellSize / 2, stackY - labelSize - 2);

      // Draw from top of stack (index = last) downward
      for (let i = stack.length - 1; i >= 0; i--) {
        const slot = stack.length - 1 - i;
        const ty = stackY + slot * (stackCellSize + gap);
        drawTile(ctx, stackX, ty, stackCellSize, stack[i].color, 1, 0.9);
      }
      ctx.restore();
    } else {
      // In landscape the HUD drawHud() handles this; nothing extra needed here
      void paddleOrigin;
    }
  }

  private drawHud(state: GameState, layout: Layout, w: number, h: number): void {
    const { ctx } = this;
    const { isPortrait, hudX, hudY, hudW, hudH, cellSize } = layout;

    const pad = 12;
    const fontSize = Math.max(11, Math.min(16, cellSize * 0.35));

    if (isPortrait) {
      // Bottom bar in portrait
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, hudY, w, hudH);

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = `bold ${fontSize + 2}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${state.score}`, pad, hudY + hudH * 0.3);

      ctx.fillStyle = TEXT_DIM;
      ctx.font = `${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(goalText(state), pad, hudY + hudH * 0.72);

      drawDropIcons(ctx, state.dropsRemaining, state.config.maxDrops, w - pad, hudY + hudH * 0.5, fontSize * 1.2, 'right');
    } else {
      // Right panel in landscape
      ctx.fillStyle = '#111827';
      ctx.fillRect(hudX, 0, hudW, h);

      const cx = hudX + hudW / 2;
      let y = hudY + pad * 2;

      ctx.fillStyle = TEXT_DIM;
      ctx.font = `${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('SCORE', cx, y);
      y += fontSize + 2;

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = `bold ${fontSize + 4}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(`${state.score}`, cx, y);
      y += fontSize + 14;

      ctx.fillStyle = TEXT_DIM;
      ctx.font = `${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('WAVE', cx, y);
      y += fontSize + 2;

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = `bold ${fontSize + 2}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(`${state.wave.index + 1}`, cx, y);
      y += fontSize + 14;

      ctx.fillStyle = TEXT_DIM;
      ctx.font = `${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('GOAL', cx, y);
      y += fontSize + 4;

      ctx.fillStyle = TEXT_PRIMARY;
      ctx.font = `${fontSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const gt = goalText(state);
      // Wrap if long
      const words = gt.split(' ');
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > hudW - pad * 2 && line) {
          ctx.fillText(line, cx, y);
          y += fontSize + 2;
          line = word;
        } else {
          line = test;
        }
      }
      if (line) { ctx.fillText(line, cx, y); y += fontSize + 2; }
      y += 12;

      ctx.fillStyle = TEXT_DIM;
      ctx.font = `${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('DROPS', cx, y);
      y += fontSize + 6;

      drawDropIcons(ctx, state.dropsRemaining, state.config.maxDrops, cx, y, fontSize * 1.3, 'center');
      y += fontSize * 1.3 + 16;

      // Stack panel in landscape HUD
      if (state.paddle.length > 0) {
        ctx.fillStyle = TEXT_DIM;
        ctx.font = `${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('HELD', cx, y);
        y += fontSize + 4;

        const sc = layout.stackCellSize;
        const gap = 4;
        for (let i = state.paddle.length - 1; i >= 0; i--) {
          const slot = state.paddle.length - 1 - i;
          drawTile(ctx, cx - sc / 2, y + slot * (sc + gap), sc, state.paddle[i].color, 1, 0.9);
        }
      }
    }
  }
}

function goalText(state: GameState): string {
  const { wave, waveProgress } = state;
  const labels: Record<GoalType, string> = {
    SCORE: `Score ${waveProgress} / ${wave.target}`,
    KLUXES: `KLUXes ${waveProgress} / ${wave.target}`,
    HORIZONTALS: `Horiz. ${waveProgress} / ${wave.target}`,
    DIAGONALS: `Diag. ${waveProgress} / ${wave.target}`,
    SURVIVE: `Tiles ${waveProgress} / ${wave.target}`,
  };
  return labels[wave.goal];
}

function drawDropIcons(
  ctx: CanvasRenderingContext2D,
  remaining: number,
  max: number,
  x: number,
  y: number,
  size: number,
  align: 'left' | 'right' | 'center'
): void {
  const gap = size * 0.3;
  const totalW = max * size + (max - 1) * gap;
  let startX: number;
  if (align === 'right') startX = x - totalW;
  else if (align === 'center') startX = x - totalW / 2;
  else startX = x;

  for (let i = 0; i < max; i++) {
    const ix = startX + i * (size + gap);
    ctx.fillStyle = i < remaining ? DROP_FULL : DROP_EMPTY;
    ctx.beginPath();
    ctx.arc(ix + size / 2, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
