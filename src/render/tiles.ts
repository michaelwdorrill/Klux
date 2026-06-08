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
  scale = 1
): void {
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

  // Border
  ctx.strokeStyle = DARK_COLORS[ci];
  ctx.lineWidth = Math.max(1, w * 0.05);
  ctx.stroke();

  // Secondary shape (colorblind cue)
  drawShape(ctx, cx, cy, w * 0.28, SHAPES[ci], DARK_COLORS[ci]);

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
