import type { TileType } from '../core/types';

// Hue + shape per color index — never rely on hue alone (colorblind-friendly)
export const FILL_COLORS = ['#e63946', '#4361ee', '#06d6a0', '#f4a261', '#9b5de5'];
const DARK_COLORS = ['#9b1d24', '#1e2f8f', '#048c69', '#c67932', '#6a3fa0'];

type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross';
const SHAPES: Shape[] = ['circle', 'square', 'triangle', 'diamond', 'cross'];

export function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colorIndex: number,
  alpha = 1,
  scale = 1,
  tileType: TileType = 'normal',
): void {
  if (tileType === 'wild') {
    drawWildTile(ctx, x, y, size, alpha, scale);
    return;
  }
  if (tileType === 'locked') {
    drawLockedTile(ctx, x, y, size, colorIndex, alpha, scale);
    return;
  }

  const pad = size * 0.07;
  const w = (size - pad * 2) * scale;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const tx = cx - w / 2;
  const ty = cy - w / 2;
  const r = w * 0.18;
  const ci = colorIndex % FILL_COLORS.length;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Body
  ctx.fillStyle = FILL_COLORS[ci];
  ctx.beginPath();
  ctx.roundRect(tx, ty, w, w, r);
  ctx.fill();

  // Border: gold for double, dark-red pulse for negative, dark otherwise
  ctx.strokeStyle =
    tileType === 'double'   ? '#ffd700' :
    tileType === 'negative' ? '#8b0000' :
    DARK_COLORS[ci];
  ctx.lineWidth = tileType === 'double' ? Math.max(2, w * 0.07) : Math.max(1, w * 0.05);
  ctx.stroke();

  // Negative: dark overlay to dim the color
  if (tileType === 'negative') {
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.roundRect(tx, ty, w, w, r);
    ctx.fill();
  }

  // Secondary shape (colorblind cue)
  drawShape(ctx, cx, cy, w * 0.28, SHAPES[ci],
    tileType === 'negative' ? 'rgba(80,0,0,0.9)' : DARK_COLORS[ci]);

  if (tileType === 'negative') {
    // Minus badge: red circle, white minus
    const br = Math.max(5, w * 0.2);
    const bx = tx + w - br * 0.6;
    const by = ty + br * 0.6;
    ctx.fillStyle = '#8b0000';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, br * 0.35);
    ctx.beginPath();
    ctx.moveTo(bx - br * 0.55, by);
    ctx.lineTo(bx + br * 0.55, by);
    ctx.stroke();
  }

  if (tileType === 'double') {
    // ×2 badge: small gold circle in the top-right corner
    const br = Math.max(5, w * 0.2);
    const bx = tx + w - br * 0.6;
    const by = ty + br * 0.6;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a2e';
    ctx.font = `bold ${Math.max(6, br * 1.0)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×2', bx, by + br * 0.05);
  }

  ctx.restore();
}

function drawLockedTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colorIndex: number,
  alpha: number,
  scale: number,
): void {
  const pad = size * 0.07;
  const w   = (size - pad * 2) * scale;
  const cx  = x + size / 2;
  const cy  = y + size / 2;
  const tx  = cx - w / 2;
  const ty  = cy - w / 2;
  const r   = w * 0.18;
  const ci  = colorIndex % FILL_COLORS.length;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Body — desaturated version of the tile color
  ctx.fillStyle = FILL_COLORS[ci];
  ctx.beginPath();
  ctx.roundRect(tx, ty, w, w, r);
  ctx.fill();

  // Heavy dark overlay to show it's locked
  ctx.fillStyle = 'rgba(0,0,0,0.52)';
  ctx.beginPath();
  ctx.roundRect(tx, ty, w, w, r);
  ctx.fill();

  // Dark border with slight color tint
  ctx.strokeStyle = DARK_COLORS[ci];
  ctx.lineWidth = Math.max(1, w * 0.05);
  ctx.stroke();

  // Padlock symbol
  const lw  = w * 0.36;
  const lh  = w * 0.28;
  const lx  = cx - lw / 2;
  const ly  = cy - lh * 0.1;
  const bh  = lh * 0.65;
  const arc = lw * 0.38;

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth   = Math.max(1.5, w * 0.06);
  ctx.lineJoin    = 'round';

  // Shackle (arc on top)
  ctx.beginPath();
  ctx.arc(cx, ly, arc, Math.PI, 0);
  ctx.stroke();

  // Body rectangle
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.roundRect(lx, ly, lw, bh, w * 0.06);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawWildTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
  scale: number,
): void {
  const pad = size * 0.07;
  const w = (size - pad * 2) * scale;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const tx = cx - w / 2;
  const ty = cy - w / 2;
  const r = w * 0.18;

  // Shimmer: hue cycles once every ~6 seconds
  const hueOffset = (performance.now() / 6000) * 360;
  const grad = ctx.createLinearGradient(tx, ty, tx + w, ty + w);
  for (let i = 0; i <= 6; i++) {
    grad.addColorStop(i / 6, `hsl(${(hueOffset + i * 60) % 360}, 100%, 62%)`);
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(tx, ty, w, w, r);
  ctx.fill();

  // Bright white border to make it pop
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1.5, w * 0.06);
  ctx.stroke();

  // Star symbol
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `bold ${Math.max(8, w * 0.48)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', cx, cy + w * 0.04);

  ctx.restore();
}

export function drawGhostTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  const pad = size * 0.1;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, size * 0.12);
  ctx.stroke();
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  shape: Shape,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.beginPath();

  switch (shape) {
    case 'circle':
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'square':
      ctx.rect(cx - r, cy - r, r * 2, r * 2);
      ctx.fill();
      break;

    case 'triangle':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r * 0.75);
      ctx.lineTo(cx - r, cy + r * 0.75);
      ctx.closePath();
      ctx.fill();
      break;

    case 'diamond':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
      break;

    case 'cross': {
      const t = r * 0.38;
      ctx.rect(cx - r, cy - t, r * 2, t * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(cx - t, cy - r, t * 2, r * 2);
      ctx.fill();
      break;
    }
  }
}
