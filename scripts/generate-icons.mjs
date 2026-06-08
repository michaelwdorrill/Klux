// Regenerate PWA icons from public/icons/icon-source.png. Run with: npm run icons
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/icons');
const SOURCE = resolve(ROOT, 'public/icons/icon-source.png');

async function emit(name, size) {
  const path = resolve(OUT, name);
  await sharp(SOURCE).resize(size, size, { fit: 'cover', position: 'centre' }).png().toFile(path);
  console.log(`  ${name} (${size}×${size})`);
}

async function emitMaskable(name, canvasSize, artSize) {
  const path = resolve(OUT, name);
  const art = await sharp(SOURCE)
    .resize(artSize, artSize, { fit: 'cover', position: 'centre' })
    .toBuffer();
  const offset = Math.round((canvasSize - artSize) / 2);
  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 26, g: 26, b: 46, alpha: 1 }, // #1a1a2e
    },
  })
    .composite([{ input: art, left: offset, top: offset }])
    .png()
    .toFile(path);
  console.log(`  ${name} (${canvasSize}×${canvasSize}, art ${artSize}×${artSize})`);
}

await mkdir(OUT, { recursive: true });

console.log('Writing icons to public/icons/');
await emit('icon-192.png', 192);
await emit('icon-512.png', 512);
// Maskable: art fills ~76% so Android's circular crop doesn't clip it
await emitMaskable('icon-maskable.png', 512, 390);
await emit('apple-touch-icon.png', 180);
