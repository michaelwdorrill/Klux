/**
 * Perspective conveyor renderer.
 *
 * Drops in as a replacement for Renderer — same draw(state, alpha, hoveredLane)
 * interface. Only drawConveyor is replaced; well, paddle, HUD, and all overlays
 * are inherited unchanged from Renderer.
 *
 * Perspective model
 * -----------------
 * - Vanishing point (VP) sits at the horizontal center of the playfield,
 *   at the top edge of the conveyor (conveyorOrigin.y).
 * - At progress p=0 (far end, just spawned) tiles are scaled to FAR_SCALE.
 * - At progress p=1 (lip, about to be caught) tiles are full size (scale=1).
 * - Scale:  s(p) = FAR_SCALE + (1 - FAR_SCALE) * p   (linear in p)
 * - Y pos:  perspective-correct via inverse-scale mapping so depth lines
 *           bunch toward the far end just like a real receding plane.
 * - X pos:  each lane's center is projected toward the VP proportionally to s.
 */

import { Renderer } from './Renderer';
import type { GameState } from '../core/types';
import type { Layout } from './layout';
import { drawTile } from './tiles';

// ── Tunable constants ──────────────────────────────────────────────────────────

/** Fractional size of tiles at the far (top) end of the conveyor. */
const FAR_SCALE = 0.28;

/** Slight vertical fog at the vanishing point to sell depth. */
const FOG_COLOR = 'rgba(26,26,46,0.72)';

const CONVEYOR_BG = '#0d1b2a';
const CONVEYOR_HOVER = '#112038';
const VP_LINE = 'rgba(255,255,255,0.07)';
const DEPTH_LINE = 'rgba(255,255,255,0.04)';
const LIP_LINE = 'rgba(100,180,255,0.3)';

// ── Math helpers ───────────────────────────────────────────────────────────────

function perspScale(p: number): number {
  return FAR_SCALE + (1 - FAR_SCALE) * p;
}

/**
 * Project an x-coordinate from flat (2D) space toward the vanishing point.
 * vpX  — horizontal VP (centre of playfield)
 * flatX — x in the 2D layout
 * s    — scale at this depth
 */
function projX(vpX: number, flatX: number, s: number): number {
  return vpX + (flatX - vpX) * s;
}

/**
 * Perspective-correct y for a tile's top-left at conveyor progress p.
 *
 * Uses the inverse-scale (1/s) relationship so that equal depth increments
 * produce perspective-foreshortened y increments — tiles bunch near the top.
 *
 * topY   — y of the conveyor's top edge (far)
 * nearY  — y of the tile's top when fully near (= lipY - cellSize)
 */
function perspTileTopY(topY: number, nearY: number, p: number): number {
  const s = perspScale(p);
  // normDepth: 0 at lip (near), 1 at top (far)
  const normDepth = (1 / s - 1) / (1 / FAR_SCALE - 1);
  return nearY + (topY - nearY) * normDepth;
}

// ── Renderer3D ─────────────────────────────────────────────────────────────────

export class Renderer3D extends Renderer {
  protected override drawConveyor(
    state: GameState,
    layout: Layout,
    alpha: number,
    hoveredLane: number | null = null,
  ): void {
    const ctx = this.ctx;
    const { cellSize, cols, conveyorRows, conveyorOrigin } = layout;

    const pfX  = conveyorOrigin.x;
    const pfW  = cellSize * cols;
    const topY = conveyorOrigin.y;
    const lipY = topY + conveyorRows * cellSize;
    const vpX  = pfX + pfW / 2;
    const nearTileTopY = lipY - cellSize; // tile top when p=1

    // ── Lane trapezoid backgrounds (far → near, so near overdraw far) ─────
    for (let col = 0; col < cols; col++) {
      const nearL = pfX + col * cellSize;
      const nearR = nearL + cellSize;
      const farL  = projX(vpX, nearL, FAR_SCALE);
      const farR  = projX(vpX, nearR, FAR_SCALE);

      ctx.fillStyle = col === hoveredLane ? CONVEYOR_HOVER : CONVEYOR_BG;
      ctx.beginPath();
      ctx.moveTo(farL, topY);
      ctx.lineTo(farR, topY);
      ctx.lineTo(nearR - 1, lipY);
      ctx.lineTo(nearL + 1, lipY);
      ctx.closePath();
      ctx.fill();
    }

    // ── Converging lane edge lines ─────────────────────────────────────────
    for (let col = 0; col <= cols; col++) {
      const nearX = pfX + col * cellSize;
      const farX  = projX(vpX, nearX, FAR_SCALE);
      ctx.strokeStyle = VP_LINE;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(farX, topY);
      ctx.lineTo(nearX, lipY);
      ctx.stroke();
    }

    // ── Perspective horizontal depth grid lines ────────────────────────────
    // Placed at evenly-spaced progress values → they bunch toward the far end
    for (let i = 1; i < conveyorRows; i++) {
      const p = i / conveyorRows;
      const s = perspScale(p);
      const lineY = perspTileTopY(topY, nearTileTopY, p);
      ctx.strokeStyle = DEPTH_LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(projX(vpX, pfX, s),      lineY);
      ctx.lineTo(projX(vpX, pfX + pfW, s), lineY);
      ctx.stroke();
    }

    // ── Vanishing-point fog (reinforces depth) ─────────────────────────────
    const fogH = (lipY - topY) * 0.45;
    const fog = ctx.createLinearGradient(0, topY, 0, topY + fogH);
    fog.addColorStop(0,   FOG_COLOR);
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fog;
    const fogL = projX(vpX, pfX, FAR_SCALE * 0.5);
    const fogR = projX(vpX, pfX + pfW, FAR_SCALE * 0.5);
    ctx.beginPath();
    ctx.moveTo(fogL, topY);
    ctx.lineTo(fogR, topY);
    ctx.lineTo(pfX + pfW, topY + fogH);
    ctx.lineTo(pfX,       topY + fogH);
    ctx.closePath();
    ctx.fill();

    // ── Lip line ───────────────────────────────────────────────────────────
    ctx.strokeStyle = LIP_LINE;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pfX,      lipY);
    ctx.lineTo(pfX + pfW, lipY);
    ctx.stroke();

    // ── Falling tiles — painter's order: far first, near on top ───────────
    const sorted = [...state.conveyor].sort((a, b) => a.progress - b.progress);

    for (const ft of sorted) {
      const p = Math.min(1, ft.progress + (alpha * 0.016) / 3);
      const s = perspScale(p);
      const tileSize = cellSize * s;

      const flatCX  = pfX + (ft.lane + 0.5) * cellSize;
      const projCX  = projX(vpX, flatCX, s);
      const tx = projCX - tileSize / 2;
      const ty = perspTileTopY(topY, nearTileTopY, p);

      drawTile(ctx, tx, ty, tileSize, ft.tile.color);
    }
  }
}
