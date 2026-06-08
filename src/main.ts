const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

const FIXED_MS = 1000 / 60;
let acc = 0;
let last = performance.now();

function drawPlaceholder(alpha: number): void {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, w, h);

  // Placeholder grid
  const cellSize = Math.min(w, h) / 8;
  const cols = 5;
  const rows = 5;
  const gridW = cols * cellSize;
  const gridH = rows * cellSize;
  const ox = (w - gridW) / 2;
  const oy = (h - gridH) / 2 + cellSize;

  // Draw well cells
  const colors = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#e9c46a'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + c * cellSize;
      const y = oy + (rows - 1 - r) * cellSize;
      ctx.fillStyle = (r + c) % 2 === 0 ? '#16213e' : '#0f3460';
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, cellSize - 4, cellSize - 4, 4);
      ctx.fill();
    }
  }

  // Draw paddle placeholder
  const paddleLane = 2;
  const px = ox + paddleLane * cellSize;
  const py = oy - cellSize;
  ctx.fillStyle = colors[0];
  ctx.beginPath();
  ctx.roundRect(px + 2, py + 2, cellSize - 4, cellSize - 4, 4);
  ctx.fill();

  // Pulse effect using alpha interpolation
  const pulse = Math.sin(Date.now() / 400) * 0.1 + 0.9;

  // Title text
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(224, 224, 224, ${pulse})`;
  ctx.font = `bold ${cellSize * 0.8}px 'Segoe UI', system-ui, sans-serif`;
  ctx.fillText('KLUX', w / 2, oy - cellSize * 2.5);
  ctx.font = `${cellSize * 0.3}px 'Segoe UI', system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(160, 160, 200, 0.8)';
  ctx.fillText('Loading…', w / 2, oy - cellSize * 1.5);
  ctx.restore();

  void alpha; // will be used for tile interpolation in later phases
}

function frame(now: number): void {
  acc += Math.min(now - last, 250);
  last = now;
  while (acc >= FIXED_MS) {
    // game.step will go here in Phase 2
    acc -= FIXED_MS;
  }
  drawPlaceholder(acc / FIXED_MS);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
