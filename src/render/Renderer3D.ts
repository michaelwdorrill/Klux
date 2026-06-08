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
 * Project a y-coordinate from the vanishing point (vpY) toward a near target.
 *
 * For tiles to travel in a straight line, both x and y must be driven by the
 * same s(p): x = vpX + Δx·s, y = vpY + Δy·s.
 * vpY = topY (top of conveyor = where all lanes converge).
 */
function projY(vpY: number, nearY: number, s: number): number {
  return vpY + (nearY - vpY) * s;
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
    // Grid lines mark tile-row boundaries. They use projY so they align with
    // the same perspective math as the tiles.
    for (let i = 1; i < conveyorRows; i++) {
      const p = i / conveyorRows;
      const s = perspScale(p);
      // Bottom edge of the tile-row at this progress = same formula as tile bottom
      const lineY = projY(topY, lipY, s);
      ctx.strokeStyle = DEPTH_LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(projX(vpX, pfX,       s), lineY);
      ctx.lineTo(projX(vpX, pfX + pfW, s), lineY);
      ctx.stroke();
    }

    // ── Vanishing-point fog (reinforces depth) ─────────────────────────────
    // The fog trapezoid must follow the lane boundaries at every depth level,
    // otherwise it bleeds outside the lanes in the middle of the conveyor.
    // At fraction fogFrac down the conveyor the scale is a linear interpolation
    // of FAR_SCALE→1 (same formula used for lane trapezoids), so we use that
    // scale for the fog-bottom edges.
    const FOG_FRAC = 0.5;
    const sFogBottom = FAR_SCALE + (1 - FAR_SCALE) * FOG_FRAC;
    const fogBottomY = topY + FOG_FRAC * (lipY - topY);
    const fog = ctx.createLinearGradient(0, topY, 0, fogBottomY);
    fog.addColorStop(0,   FOG_COLOR);
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fog;
    ctx.beginPath();
    ctx.moveTo(projX(vpX, pfX,       FAR_SCALE),  topY);
    ctx.lineTo(projX(vpX, pfX + pfW, FAR_SCALE),  topY);
    ctx.lineTo(projX(vpX, pfX + pfW, sFogBottom), fogBottomY);
    ctx.lineTo(projX(vpX, pfX,       sFogBottom), fogBottomY);
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

      const flatCX = pfX + (ft.lane + 0.5) * cellSize;
      const tx = projX(vpX, flatCX, s) - tileSize / 2;
      // y projects from the same VP as x → straight-line paths down each lane
      const ty = projY(topY, nearTileTopY, s);

      drawTile(ctx, tx, ty, tileSize, ft.tile.color);
    }
  }
}
