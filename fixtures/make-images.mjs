// One-off generator for the abstract "watercolour" sample images in fixtures/originals/ (output is committed).
// Run from the repo root: node fixtures/make-images.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const IMAGES = {
  'fx-01': [1600, 1100, ['#3d6a8a', '#d9a45b', '#a7c4d6', '#2f4858']],
  'fx-02': [1100, 1500, ['#6b8f5e', '#c9d6a3', '#3f5a3a', '#e8e0c5']],
  'fx-03': [1000, 1300, ['#4a4a4a', '#8c8c8c', '#2b2b2b', '#bdbdbd']],
  'fx-04': [1800, 900, ['#d8b57a', '#a8774a', '#e9d8b4', '#7d9aa8']],
  'fx-05': [1200, 1200, ['#b5787f', '#7c6a9e', '#e3c2c4', '#4d4466']],
  'fx-06': [1000, 800, ['#999999', '#cccccc']],
  'fx-07': [1500, 1000, ['#4f7d9c', '#e0c79a', '#9cb9c9', '#c99a5b']],
  'fx-e1': [900, 1270, ['#2f5d7c', '#c4dbe6', '#e7b45d', '#1f3b4f']],
};

function svg(width, height, colors, seed) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const min = Math.min(width, height);
  const blobs = Array.from({ length: 16 }, (_, i) => {
    const r = (0.1 + random() * 0.28) * min;
    return `<ellipse cx="${Math.round(random() * width)}" cy="${Math.round(random() * height)}" rx="${Math.round(r * (0.8 + random() * 0.8))}" ry="${Math.round(r)}" fill="${colors[i % colors.length]}" fill-opacity="${(0.18 + random() * 0.3).toFixed(2)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f3eee4"/><filter id="b"><feGaussianBlur stdDeviation="${Math.round(min / 30)}"/></filter><g filter="url(#b)">${blobs}</g></svg>`;
}

await mkdir('fixtures/originals', { recursive: true });
let seed = 7;
for (const [id, [width, height, colors]] of Object.entries(IMAGES)) {
  await sharp(Buffer.from(svg(width, height, colors, seed++ * 7919))).jpeg({ quality: 78 }).toFile(`fixtures/originals/${id}.jpg`);
}
