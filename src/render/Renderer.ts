import type { GameState, GoalType, Wave } from '../core/types';
import { computeLayout, type Layout } from './layout';
import { drawTile, drawGhostTile, FILL_COLORS } from './tiles';
import { Effects } from './effects';
import { getWave } from '../core/waves';
import type { HighScores } from '../persistence/store';
import type { LeaderboardEntry } from '../leaderboard';

const BG = '#1a1a2e';
const WELL_BG = '#16213e';
const WELL_HOVER = '#1a2d55';
const WELL_LINE = '#0f3460';
const CONVEYOR_BG = '#0d1b2a';
const CONVEYOR_HOVER = '#112038';
const PADDLE_ACTIVE = '#2a4a7a';
const PADDLE_BG = '#1e2d4a';
const TEXT_PRIMARY = '#e0e0e0';
const TEXT_DIM = 'rgba(180,180,200,0.7)';
const DROP_FULL = '#e63946';
const DROP_EMPTY = 'rgba(255,255,255,0.15)';

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  private layout: Layout | null = null;
  private readonly effects = new Effects();
  private lastFrameMs = 0;
  private highScores: HighScores = { classic: 0, endless: 0 };
  private newBest = false;
  private leaderboard: LeaderboardEntry[] | null = null;
  private leaderboardPlayerScore = 0;
  private titleLeaderboard: { classic: LeaderboardEntry[]; endless: LeaderboardEntry[] } | null = null;
  private opponentWell: number[][] = [];
  private opponentDrops = -1;
  private opponentPower = 0;
  private opponentEventCount = 0;
  private curseTimer = 0;
  private autoPlay = false;
  debugMode = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    // Re-resize whenever the canvas's CSS dimensions change (e.g. when the
    // on-screen controls bar appears/disappears around mode picks and pauses).
    // Without this the pixel buffer keeps its old size and renders compressed.
    // ResizeObserver kept as a lightweight backup; draw() syncs size inline
    // before each frame so the ResizeObserver race (fires after RAF, before paint)
    // is no longer a problem — canvas size is always correct when draw() runs.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(canvas);
    }
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  getLayout(): Layout | null {
    return this.layout;
  }

  draw(state: GameState, alpha: number, hoveredLane: number | null = null): void {
    const dpr = window.devicePixelRatio || 1;
    // Inline size sync: if CSS size changed (e.g. OSC bar toggled), update the
    // pixel buffer now — before drawing — so ResizeObserver can't clear it after.
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;  // minimized/hidden — nothing to draw
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
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
    this.effects.beginFrame();

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    // World layer (shaken)
    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    this.drawWell(state, layout, hoveredLane);
    this.drawConveyor(state, layout, alpha, hoveredLane);
    this.drawPaddle(state, layout);
    this.effects.drawWorld(ctx);
    ctx.restore();

    // HUD + popups (steady)
    this.drawHud(state, layout, w, h);

    // VS opponent panel — always on top of HUD, below pause/game-over overlays
    if (state.mode === 'versus' && (state.phase === 'playing' || state.phase === 'paused')) {
      drawOpponentPanel(ctx, layout, w, this.opponentWell, this.opponentDrops, this.opponentPower, state.config.maxDrops, this.opponentEventCount);
    }

    const wellCenterX = layout.wellOrigin.x + (layout.cellSize * layout.cols) / 2;
    const wellCenterY = layout.wellOrigin.y + (layout.cellSize * layout.rows) / 2;
    this.effects.drawOverlay(ctx, w, h, layout.cellSize * layout.cols, wellCenterX, wellCenterY);

    // Curse flash
    if (this.curseTimer > 0) {
      this.curseTimer -= dtMs;
      drawCurseNotification(ctx, w, this.curseTimer);
    }

    if (state.phase !== 'playing') {
      this.drawOverlay(state, w, h, layout.cellSize);
    }

    if (this.debugMode) {
      this.drawDebug(state, w);
    }

    this.effects.endFrame();
    this.drawBuildLabel(w, h);
    if (this.autoPlay) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(255,209,102,0.9)';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('🤖 AUTO  Ctrl+D to stop', 6, h - 18);
      ctx.restore();
    }
  }

  private drawBuildLabel(_w: number, h: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`build ${__BUILD_SHA__}`, 6, h - 4);
    ctx.restore();
  }

  /** Expose Effects so main.ts can fire the easter egg. */
  getEffects(): Effects { return this.effects; }

  setHighScores(h: HighScores): void { this.highScores = h; }
  setNewBest(b: boolean): void { this.newBest = b; }
  setLeaderboard(entries: LeaderboardEntry[] | null, playerScore = 0): void {
    this.leaderboard            = entries;
    this.leaderboardPlayerScore = playerScore;
  }

  setTitleLeaderboard(data: { classic: LeaderboardEntry[]; endless: LeaderboardEntry[] } | null): void {
    this.titleLeaderboard = data;
  }

  setOpponentState(well: number[][], drops: number, power = 0, eventCount = 0): void {
    this.opponentWell       = well;
    this.opponentDrops      = drops;
    this.opponentPower      = power;
    this.opponentEventCount = eventCount;
  }

  triggerCurse(): void { this.curseTimer = 2200; }
  setAutoPlay(on: boolean): void { this.autoPlay = on; }

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
      ctx.fillText('KLUX', cx, cy - titleSize * 1.6);

      ctx.fillStyle = 'rgba(200,200,220,0.8)';
      ctx.font = `${subSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('Pick a mode to play', cx, cy - subSize * 0.6);

      ctx.fillStyle = 'rgba(155,209,255,0.9)';
      ctx.font = `${subSize * 0.9}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(`CLASSIC — chase the wave goals${bestSuffix(this.highScores.classic)}`, cx, cy + subSize * 0.6);
      ctx.fillStyle = 'rgba(255,209,102,0.9)';
      ctx.fillText(`ENDLESS — survive as long as you can${bestSuffix(this.highScores.endless)}`, cx, cy + subSize * 1.7);

      ctx.fillStyle = 'rgba(140,140,160,0.55)';
      ctx.font = `${subSize * 0.78}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('Tap a button below · keys 1 / 2 also work', cx, cy + subSize * 3.1);
      ctx.fillText('Arrows / WASD · Space = drop · P = pause', cx, cy + subSize * 4.0);

      // Global leaderboards: two compact columns below the controls hint
      if (this.titleLeaderboard) {
        const lbY = cy + subSize * 5.4;
        const halfW = Math.min(160, w * 0.38);
        this.drawMiniLeaderboard(ctx, cx - halfW * 0.55, lbY, halfW, subSize, 'CLASSIC', this.titleLeaderboard.classic);
        this.drawMiniLeaderboard(ctx, cx + halfW * 0.55, lbY, halfW, subSize, 'ENDLESS', this.titleLeaderboard.endless);
      }
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

      const next = getWave(state.wave.index + 1);
      ctx.fillStyle = 'rgba(200,200,220,0.55)';
      ctx.font = `${subSize * 0.85}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(`NEXT — WAVE ${next.index + 1}`, cx, cy + subSize * 2.0);
      ctx.fillStyle = '#9bd1ff';
      ctx.font = `bold ${subSize * 1.05}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(nextGoalText(next), cx, cy + subSize * 3.1);

      ctx.fillStyle = 'rgba(200,200,220,0.5)';
      ctx.font = `${subSize * 0.75}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('Enter to continue · auto-advancing…', cx, cy + subSize * 4.3);
    }

    if (state.phase === 'gameOver') {
      if (state.mode === 'versus') {
        ctx.fillStyle = state.vsWon ? '#06d6a0' : '#e63946';
        ctx.font = `bold ${titleSize * 1.2}px 'Segoe UI', system-ui, sans-serif`;
        ctx.fillText(state.vsWon ? 'YOU WIN!' : 'YOU LOSE!', cx, cy - subSize * 3.0);
      } else {
        ctx.fillStyle = '#e63946';
        ctx.font = `bold ${titleSize}px 'Segoe UI', system-ui, sans-serif`;
        ctx.fillText('GAME OVER', cx, cy - subSize * 3.0);
      }

      ctx.fillStyle = '#e0e0e0';
      ctx.font = `${subSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(`Final score: ${state.score.toLocaleString()}`, cx, cy - subSize * 1.4);

      if (this.newBest) {
        ctx.fillStyle = '#ffd166';
        ctx.font = `bold ${subSize * 1.05}px 'Segoe UI', system-ui, sans-serif`;
        ctx.fillText('★ NEW BEST! ★', cx, cy - subSize * 0.1);
      } else if (state.mode !== 'versus') {
        const best = this.highScores[state.mode];
        ctx.fillStyle = 'rgba(200,200,220,0.65)';
        ctx.font = `${subSize * 0.85}px 'Segoe UI', system-ui, sans-serif`;
        ctx.fillText(`Best ${state.mode}: ${best.toLocaleString()}`, cx, cy - subSize * 0.1);
      }

      if (state.mode !== 'versus') {
        if (this.leaderboard !== null && this.leaderboard.length > 0) {
          this.drawLeaderboardPanel(ctx, cx, cy + subSize * 1.0, subSize, w, this.leaderboard, this.leaderboardPlayerScore);
        } else if (this.leaderboard !== null) {
          ctx.fillStyle = 'rgba(200,200,220,0.75)';
          ctx.font = `${subSize * 0.85}px 'Segoe UI', system-ui, sans-serif`;
          ctx.fillText('Tap CLASSIC or ENDLESS to play again', cx, cy + subSize * 1.4);
        } else {
          const tl = this.titleLeaderboard;
          const modeBoard = tl ? tl[state.mode] : null;
          if (modeBoard && modeBoard.length > 0) {
            this.drawLeaderboardPanel(ctx, cx, cy + subSize * 1.0, subSize, w, modeBoard, -1);
          } else {
            ctx.fillStyle = 'rgba(200,200,220,0.55)';
            ctx.font = `${subSize * 0.85}px 'Segoe UI', system-ui, sans-serif`;
            ctx.fillText('Enter your initials above to submit your score', cx, cy + subSize * 1.4);
          }
        }

        if (this.leaderboard !== null) {
          ctx.fillStyle = 'rgba(200,200,220,0.75)';
          ctx.font = `${subSize * 0.85}px 'Segoe UI', system-ui, sans-serif`;
          ctx.fillText('Tap CLASSIC or ENDLESS to play again', cx, h - subSize * 2.2);
          ctx.fillStyle = 'rgba(140,140,160,0.5)';
          ctx.font = `${subSize * 0.75}px 'Segoe UI', system-ui, sans-serif`;
          ctx.fillText('or press 1 / 2 · Enter restarts same mode', cx, h - subSize * 1.1);
        }
      } else {
        ctx.fillStyle = 'rgba(200,200,220,0.75)';
        ctx.font = `${subSize * 0.85}px 'Segoe UI', system-ui, sans-serif`;
        ctx.fillText('Tap a mode below to play again', cx, h - subSize * 1.5);
      }
    }
  }

  private drawMiniLeaderboard(
    ctx: CanvasRenderingContext2D,
    cx: number,
    topY: number,
    panelW: number,
    subSize: number,
    label: string,
    entries: LeaderboardEntry[],
  ): void {
    const rowH   = subSize * 1.35;
    const rows   = Math.min(5, entries.length);
    const panelH = rowH * (rows + 1) + 6;
    const px     = cx - panelW / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(10,14,28,0.72)';
    ctx.beginPath();
    ctx.roundRect(px, topY, panelW, panelH, 6);
    ctx.fill();

    ctx.fillStyle = 'rgba(155,209,255,0.7)';
    ctx.font = `bold ${subSize * 0.75}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, topY + rowH * 0.5);

    for (let i = 0; i < rows; i++) {
      const e  = entries[i];
      const ry = topY + rowH * (i + 1) + 4;
      const rankColor = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'rgba(200,200,220,0.7)';
      ctx.fillStyle = rankColor;
      ctx.font = `${subSize * 0.75}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}. ${e.name}`, px + 8, ry);
      ctx.textAlign = 'right';
      ctx.fillText(e.score.toLocaleString(), px + panelW - 8, ry);
    }

    if (entries.length === 0) {
      ctx.fillStyle = 'rgba(140,140,160,0.5)';
      ctx.font = `${subSize * 0.72}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('no scores yet', cx, topY + rowH * 1.5);
    }
    ctx.restore();
  }

  private drawLeaderboardPanel(
    ctx: CanvasRenderingContext2D,
    cx: number,
    topY: number,
    subSize: number,
    w: number,
    entries: LeaderboardEntry[],
    playerScore: number,
  ): void {
    const rowH    = subSize * 1.55;
    const panelW  = Math.min(340, w * 0.85);
    const panelH  = rowH * (entries.length + 1) + 8;
    const px      = cx - panelW / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(10,14,28,0.75)';
    ctx.beginPath();
    ctx.roundRect(px, topY, panelW, panelH, 8);
    ctx.fill();

    // Header
    ctx.fillStyle = 'rgba(155,209,255,0.7)';
    ctx.font = `bold ${subSize * 0.78}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('#', px + 10, topY + rowH * 0.5);
    ctx.fillText('NAME', px + 36, topY + rowH * 0.5);
    ctx.textAlign = 'right';
    ctx.fillText('SCORE', px + panelW - 10, topY + rowH * 0.5);

    for (let i = 0; i < entries.length; i++) {
      const e    = entries[i];
      const ry   = topY + rowH * (i + 1) + 4;
      const isMe = e.score === playerScore;

      if (isMe) {
        ctx.fillStyle = 'rgba(255,209,102,0.12)';
        ctx.fillRect(px + 2, ry - rowH * 0.5, panelW - 4, rowH);
      }

      const rankColor = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : isMe ? '#ffd166' : 'rgba(200,200,220,0.7)';
      ctx.fillStyle = rankColor;
      ctx.font = `${isMe ? 'bold ' : ''}${subSize * 0.85}px 'Segoe UI', system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, px + 10, ry);
      ctx.fillText(e.name, px + 36, ry);
      ctx.textAlign = 'right';
      ctx.fillText(e.score.toLocaleString(), px + panelW - 10, ry);
    }
    ctx.restore();
  }

  private drawWell(state: GameState, layout: Layout, hoveredLane: number | null = null): void {
    const { ctx } = this;
    const { cellSize, cols, rows, wellOrigin } = layout;

    // Cells (background grid only — tiles drawn in a separate pass so they
    // can animate without leaving gaps in the grid)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = wellOrigin.x + col * cellSize;
        const y = wellOrigin.y + (rows - 1 - row) * cellSize;
        ctx.fillStyle = col === hoveredLane ? WELL_HOVER : WELL_BG;
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, cellSize - 2, cellSize - 2, 3);
        ctx.fill();
        ctx.strokeStyle = col === hoveredLane ? '#4a90d9' : WELL_LINE;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Tiles — animated via the Effects tween (drop-down on chain/clear)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tile = state.well[row][col];
        if (tile === null) continue;
        const targetX = wellOrigin.x + col * cellSize;
        const targetY = wellOrigin.y + (rows - 1 - row) * cellSize;
        const { x, y } = this.effects.getTileDrawPosition(tile.id, targetX, targetY);
        drawTile(ctx, x, y, cellSize, tile.color, 1, 1, tile.type);
      }
    }

    // Well border
    ctx.strokeStyle = '#1e3a6e';
    ctx.lineWidth = 2;
    ctx.strokeRect(wellOrigin.x, wellOrigin.y, cellSize * cols, cellSize * rows);
  }

  protected drawConveyor(state: GameState, layout: Layout, alpha: number, hoveredLane: number | null = null): void {
    const { ctx } = this;
    const { cellSize, cols, conveyorRows, conveyorOrigin } = layout;

    // Lane tracks
    for (let col = 0; col < cols; col++) {
      const x = conveyorOrigin.x + col * cellSize;
      ctx.fillStyle = col === hoveredLane ? CONVEYOR_HOVER : CONVEYOR_BG;
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
      drawTile(ctx, x, y, cellSize, ft.tile.color, 1, 1, ft.tile.type);
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
      drawTile(ctx, activeX, paddleOrigin.y, cellSize, top.color, 1, 1, top.type);

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
        drawTile(ctx, stackX, ty, stackCellSize, stack[i].color, 1, 0.9, stack[i].type);
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
      ctx.fillText(hudGoalText(state), pad, hudY + hudH * 0.72);

      drawDropIcons(ctx, state.dropsRemaining, state.config.maxDrops, w - pad, hudY + hudH * 0.5, fontSize * 1.2, 'right');

      if (state.mode === 'versus') {
        // Power meter — centred in the bottom bar
        const barW = Math.min(220, w * 0.55);
        const barH = 8;
        const barX = (w - barW) / 2;
        const headerY = hudY + 4;
        ctx.fillStyle = TEXT_DIM;
        ctx.font = `${fontSize - 2}px 'Segoe UI', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('POWER', w / 2, headerY);
        const barY = headerY + (fontSize - 2) + 3;
        drawPowerMeter(ctx, barX, barY, barW, barH, state.vsPowerMeter, fontSize);
      } else {
        // Classic/endless: show progress bar toward wave goal
        if (state.mode === 'classic') {
          drawGoalProgress(ctx, state, w, hudY, hudH, pad, fontSize);
        }
      }
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
      y += fontSize + 6;

      const best = state.mode !== 'versus' ? this.highScores[state.mode] : 0;
      if (best > 0) {
        ctx.fillStyle = state.score > best ? '#ffd166' : TEXT_DIM;
        ctx.font = `${fontSize - 2}px 'Segoe UI', system-ui, sans-serif`;
        ctx.fillText(`best ${best.toLocaleString()}`, cx, y);
        y += fontSize + 4;
      }
      y += 8;

      if (state.mode !== 'versus') {
        // Wave counter — classic only
        if (state.mode === 'classic') {
          ctx.fillStyle = TEXT_DIM;
          ctx.font = `${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
          ctx.fillText('WAVE', cx, y);
          y += fontSize + 2;

          ctx.fillStyle = TEXT_PRIMARY;
          ctx.font = `bold ${fontSize + 2}px 'Segoe UI', system-ui, sans-serif`;
          ctx.fillText(`${state.wave.index + 1}`, cx, y);
          y += fontSize + 10;
        }

        // Goal with progress bar
        ctx.fillStyle = TEXT_DIM;
        ctx.font = `${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
        ctx.fillText(state.mode === 'endless' ? 'MODE' : 'GOAL', cx, y);
        y += fontSize + 4;

        ctx.fillStyle = '#9bd1ff';
        ctx.font = `bold ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        const gt = hudGoalText(state);
        const words = gt.split(' ');
        let line = '';
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > hudW - pad * 2 && line) {
            ctx.fillText(line, cx, y); y += fontSize + 2; line = word;
          } else { line = test; }
        }
        if (line) { ctx.fillText(line, cx, y); y += fontSize + 2; }

        if (state.mode === 'classic') {
          y += 4;
          const progress = Math.min(1, state.waveProgress / state.wave.target);
          const barW = hudW - pad * 2;
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath(); ctx.roundRect(hudX + pad, y, barW, 5, 2); ctx.fill();
          ctx.fillStyle = '#9bd1ff';
          ctx.beginPath(); ctx.roundRect(hudX + pad, y, barW * progress, 5, 2); ctx.fill();
          y += 5 + 10;
        } else {
          y += 12;
        }
      } else {
        // VS mode: power meter in landscape panel
        ctx.fillStyle = TEXT_DIM;
        ctx.font = `${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('POWER', cx, y);
        y += fontSize + 4;

        const barW = hudW - pad * 2;
        const barH = 10;
        drawPowerMeter(ctx, hudX + pad, y, barW, barH, state.vsPowerMeter, fontSize);
        y += barH + (fontSize - 1) * 2 + 4 + 18;
      }

      ctx.fillStyle = TEXT_DIM;
      ctx.font = `${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText('DROPS', cx, y);
      y += fontSize + 10;

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
          drawTile(ctx, cx - sc / 2, y + slot * (sc + gap), sc, state.paddle[i].color, 1, 0.9, state.paddle[i].type);
        }
      }
    }
  }
}

/** Floating opponent board panel — drawn over the canvas, top-right of playfield. */
function drawOpponentPanel(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  canvasW: number,
  opponentWell: number[][],
  opponentDrops: number,
  opponentPower: number,
  maxDrops: number,
  eventCount = 0,
): void {
  const rows = opponentWell.length;
  const cols = opponentWell[0]?.length ?? 5;

  const panelPad = 6;
  const hasData = opponentWell.length > 0;
  const cellW = 9;
  const cellH = 10;
  const boardW = (hasData ? cols : 5) * cellW;
  const boardH = (hasData ? rows : 10) * cellH;
  const powerBarH = 5;
  const labelH = 12;
  const dropH = 8;
  const panelW = boardW + panelPad * 2;
  const panelH = hasData
    ? labelH + 4 + boardH + 4 + powerBarH + 4 + dropH + panelPad
    : labelH + 4 + 24 + panelPad;

  // Position: to the LEFT of the playfield so it's never behind the HUD
  const px = layout.conveyorOrigin.x - panelW - 6;
  // If there's no room on the left (portrait or narrow canvas), fall back to top-right of conveyor
  const fitsLeft = px >= 4;
  const panelX = fitsLeft
    ? px
    : Math.min(layout.conveyorOrigin.x + layout.cellSize * layout.cols + 6, canvasW - panelW - 4);
  const panelY = layout.conveyorOrigin.y + 4;

  // Panel background
  ctx.fillStyle = 'rgba(10,12,28,0.88)';
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(155,209,255,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  let y = panelY + panelPad / 2;

  // Label
  ctx.fillStyle = 'rgba(155,209,255,0.9)';
  ctx.font = `bold 9px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('OPPONENT', panelX + panelW / 2, y);
  y += labelH + 2;

  if (!hasData) {
    ctx.fillStyle = 'rgba(180,180,200,0.4)';
    ctx.font = `8px 'Segoe UI', system-ui, sans-serif`;
    ctx.fillText(`waiting… (ev:${eventCount})`, panelX + panelW / 2, y + 4);
    return;
  }

  // Mini board
  drawMiniBoard(ctx, panelX + panelPad, y, cellW, cellH, opponentWell, opponentDrops, maxDrops, 9);
  y += boardH + 4;

  // Opponent power bar
  const MAX_POWER = 6000;
  const powerFill = Math.min(1, opponentPower / MAX_POWER);
  const oppLevel = opponentPower >= 6000 ? 4 : opponentPower >= 4500 ? 3 : opponentPower >= 3000 ? 2 : opponentPower >= 1500 ? 1 : 0;
  const barColor = oppLevel >= 4 ? '#ef476f' : oppLevel >= 3 ? '#ffd166' : oppLevel >= 2 ? '#f4a261' : oppLevel >= 1 ? '#06d6a0' : '#4a90d9';
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.roundRect(panelX + panelPad, y, boardW, powerBarH, 2); ctx.fill();
  if (powerFill > 0) {
    ctx.fillStyle = barColor;
    ctx.beginPath(); ctx.roundRect(panelX + panelPad, y, boardW * powerFill, powerBarH, 2); ctx.fill();
  }
  if (oppLevel > 0) {
    ctx.fillStyle = barColor;
    ctx.font = `bold 8px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`⚡${oppLevel}`, panelX + panelW - panelPad / 2, y + powerBarH / 2);
  }
}

function drawCurseNotification(
  ctx: CanvasRenderingContext2D,
  w: number,
  timerMs: number,
): void {
  const FULL_MS = 2200;
  const FADE_MS = 600;
  const alpha = timerMs < FADE_MS ? timerMs / FADE_MS : 1;
  const shake = timerMs > FULL_MS - 200 ? Math.sin(timerMs * 0.08) * 3 : 0;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const fontSize = Math.min(28, w * 0.07);
  ctx.font = `bold ${fontSize}px 'Segoe UI', system-ui, sans-serif`;

  // Glow
  ctx.shadowColor = '#ef476f';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ef476f';
  ctx.fillText('⚡ YOU\'VE BEEN CURSED! ⚡', w / 2 + shake, 18);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawGoalProgress(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  hudY: number,
  hudH: number,
  _pad: number,
  fontSize: number,
): void {
  const progress = Math.min(1, state.waveProgress / state.wave.target);
  const barW = Math.min(200, w * 0.45);
  const barH = 6;
  const barX = (w - barW) / 2;
  const barY = hudY + hudH - barH - 5;

  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3); ctx.fill();
  ctx.fillStyle = '#9bd1ff';
  ctx.beginPath(); ctx.roundRect(barX, barY, barW * progress, barH, 3); ctx.fill();

  // Goal label centered above bar
  ctx.fillStyle = '#9bd1ff';
  ctx.font = `bold ${fontSize - 1}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(hudGoalText(state), w / 2, hudY + (hudH - barH - 5) / 2);
}

function drawMiniBoard(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  cellW: number, cellH: number,
  well: number[][],
  drops: number,
  maxDrops: number,
  fontSize: number,
): void {
  const rows = well.length;
  const cols = well[0]?.length ?? 0;
  const totalW = cols * cellW;
  const totalH = rows * cellH;

  // Background
  ctx.fillStyle = 'rgba(5,8,20,0.7)';
  ctx.fillRect(x - 1, y - 1, totalW + 2, totalH + 2);

  for (let r = 0; r < rows; r++) {
    const drawRow = rows - 1 - r; // row 0 = bottom of well → drawn at bottom
    for (let c = 0; c < cols; c++) {
      const color = well[r]?.[c] ?? -1;
      const cx2 = x + c * cellW;
      const cy2 = y + drawRow * cellH;
      if (color >= 0 && color < FILL_COLORS.length) {
        ctx.fillStyle = FILL_COLORS[color]!;
        ctx.fillRect(cx2 + 0.5, cy2 + 0.5, cellW - 1, cellH - 1);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(cx2 + 0.5, cy2 + 0.5, cellW - 1, cellH - 1);
      }
    }
  }

  // Drops remaining indicator below the board
  if (drops >= 0) {
    const dropSize = Math.max(4, cellW * 0.55);
    const gap = 2;
    const iconY = y + totalH + 4;
    const totalIconW = maxDrops * (dropSize + gap) - gap;
    let ix = x + (totalW - totalIconW) / 2;
    for (let i = 0; i < maxDrops; i++) {
      ctx.fillStyle = i < drops ? '#e63946' : 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.arc(ix + dropSize / 2, iconY + dropSize / 2, dropSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ix += dropSize + gap;
    }
    void fontSize;
  }
}

function drawPowerMeter(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  power: number,
  fontSize: number,
): void {
  const MAX = 6000;
  const fill = Math.min(1, power / MAX);
  const level = power >= 6000 ? 4 : power >= 4500 ? 3 : power >= 3000 ? 2 : power >= 1500 ? 1 : 0;
  const barColor = level >= 4 ? '#ef476f' : level >= 3 ? '#ffd166' : level >= 2 ? '#f4a261' : level >= 1 ? '#06d6a0' : '#4a90d9';

  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();

  // Fill
  if (fill > 0) {
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(x, y, w * fill, h, h / 2);
    ctx.fill();
  }

  // Tick marks at 1500/3000/4500
  ctx.strokeStyle = 'rgba(10,12,24,0.6)';
  ctx.lineWidth = 1.5;
  for (const thresh of [1500, 3000, 4500]) {
    const tx = x + (thresh / MAX) * w;
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.lineTo(tx, y + h);
    ctx.stroke();
  }

  // Labels below bar
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const lineH = fontSize - 1;
  if (level > 0) {
    ctx.fillStyle = barColor;
    ctx.font = `bold ${lineH}px 'Segoe UI', system-ui, sans-serif`;
    ctx.fillText(`Level ${level}`, x + w / 2, y + h + 3);
    ctx.fillStyle = 'rgba(200,200,220,0.7)';
    ctx.font = `${lineH - 2}px 'Segoe UI', system-ui, sans-serif`;
    ctx.fillText('Press F!', x + w / 2, y + h + 3 + lineH + 1);
  } else {
    ctx.fillStyle = 'rgba(140,140,160,0.5)';
    ctx.font = `${lineH - 2}px 'Segoe UI', system-ui, sans-serif`;
    ctx.fillText('Score points', x + w / 2, y + h + 3);
    ctx.fillText('to charge!', x + w / 2, y + h + 3 + lineH);
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

function hudGoalText(state: GameState): string {
  return state.mode === 'endless' ? 'ENDLESS' : goalText(state);
}

function bestSuffix(score: number): string {
  return score > 0 ? `  ·  best ${score.toLocaleString()}` : '';
}

function nextGoalText(wave: Wave): string {
  const n = wave.target;
  const s = (count: number, singular: string, plural: string) =>
    count === 1 ? singular : plural;
  switch (wave.goal) {
    case 'SCORE': return `Score ${n.toLocaleString()}`;
    case 'KLUXES': return `Make ${n} ${s(n, 'KLUX', 'KLUXes')}`;
    case 'HORIZONTALS': return `Make ${n} horizontal ${s(n, 'KLUX', 'KLUXes')}`;
    case 'DIAGONALS': return `Make ${n} diagonal ${s(n, 'KLUX', 'KLUXes')}`;
    case 'SURVIVE': return `Survive ${n} tiles`;
  }
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
