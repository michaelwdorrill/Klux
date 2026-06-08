// Regenerate PWA icons. Run with: npm run icons
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/icons');

const TILE_COLORS = ['#e63946', '#4361ee', '#06d6a0', '#f4a261', '#9b5de5'];

/** SVG icon. The `padding` controls maskable safe-zone (Android adaptive icons
 *  crop within an inscribed circle, so content must stay inside ~80% center). */
function buildSvg({ padding }) {
  const SIZE = 512;
  const p = padding;
  const innerW = SIZE - p * 2;
  const tileSize = Math.floor(innerW / 5) - 8;
  const tileGap = 8;
  const totalW = tileSize * 5 + tileGap * 4;
  const tileY = p + Math.round(innerW * 0.18);
  const tileXStart = (SIZE - totalW) / 2;

  const tiles = TILE_COLORS.map((color, i) => {
    const x = tileXStart + i * (tileSize + tileGap);
    return `<rect x="${x}" y="${tileY}" width="${tileSize}" height="${tileSize}" rx="${Math.round(tileSize * 0.18)}" fill="${color}"/>`;
  }).join('');

  const fontSize = Math.round(innerW * 0.32);
  const textY = p + Math.round(innerW * 0.85);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a1a2e"/>
        <stop offset="100%" stop-color="#0f1424"/>
      </linearGradient>
    </defs>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
    ${tiles}
    <text x="${SIZE / 2}" y="${textY}"
          font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
          font-weight="900" font-size="${fontSize}" fill="#e0e0e0"
          text-anchor="middle" letter-spacing="${Math.round(fontSize * 0.04)}">KLUX</text>
  </svg>`;
}

async function emit(name, size, svg) {
  const path = resolve(OUT, name);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path);
  console.log(`  ${name} (${size}×${size})`);
}

await mkdir(OUT, { recursive: true });

console.log('Writing icons to public/icons/');
const regular = buildSvg({ padding: 24 });
const maskable = buildSvg({ padding: 80 }); // safe zone for adaptive icons
await emit('icon-192.png', 192, regular);
await emit('icon-512.png', 512, regular);
await emit('icon-maskable.png', 512, maskable);

// Also keep an apple-touch-icon at 180 — iOS prefers a 180×180 sourced from <link>
await emit('apple-touch-icon.png', 180, regular);

// And write the source SVG so future tweaks have a starting point
await writeFile(resolve(OUT, 'icon.svg'), regular);
console.log('  icon.svg (source)');
