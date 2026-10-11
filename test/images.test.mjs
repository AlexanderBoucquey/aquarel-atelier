import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { processImage, processAll, assembleSiteImages, prune, variantWidths, originalName } from '../scripts/images.mjs';

const tmp = () => mkdtemp(join(tmpdir(), 'img-'));
const makeJpeg = (path, width, height, edit = (s) => s) =>
  edit(sharp({ create: { width, height, channels: 3, background: '#7a9bb5' } }).jpeg()).toFile(path);

test('variantWidths never upscales', () => {
  assert.deepEqual(variantWidths(4000), [480, 960, 1600]);
  assert.deepEqual(variantWidths(1600), [480, 960, 1600]);
  assert.deepEqual(variantWidths(700), [480, 700]);
  assert.deepEqual(variantWidths(300), [300]);
});

test('originalName keeps the extension, lower-cased', () => {
  assert.equal(originalName('abc', 'IMG_1.HEIC'), 'abc.heic');
});

test('processImage writes WebP variants and a 1200×630 Open Graph JPEG', async () => {
  const dir = await tmp();
  await makeJpeg(join(dir, 'in.jpg'), 2000, 1000);
  const meta = await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v1');
  assert.deepEqual(meta, { version: 'v1', width: 1600, height: 800, widths: [480, 960, 1600] });
  assert.deepEqual((await readdir(join(dir, 'out'))).sort(), ['meta.json', 'og.jpg', 'w1600.webp', 'w480.webp', 'w960.webp']);
  const og = await sharp(join(dir, 'out', 'og.jpg')).metadata();
  assert.deepEqual([og.width, og.height, og.format], [1200, 630, 'jpeg']);
  assert.equal((await sharp(join(dir, 'out', 'w960.webp')).metadata()).format, 'webp');
});

test('processImage applies EXIF orientation', async () => {
  const dir = await tmp();
  await makeJpeg(join(dir, 'in.jpg'), 300, 200, (s) => s.withMetadata({ orientation: 6 }));
  const meta = await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v1');
  assert.deepEqual([meta.width, meta.height], [200, 300]);
});

test('processImage strips EXIF metadata (camera, GPS)', async () => {
  const dir = await tmp();
  await makeJpeg(join(dir, 'in.jpg'), 600, 400, (s) => s.withExif({ IFD0: { Copyright: 'Dirk Vermoesen' } }));
  assert.ok((await sharp(join(dir, 'in.jpg')).metadata()).exif, 'test input should carry EXIF');
  await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v1');
  for (const file of ['w480.webp', 'w600.webp', 'og.jpg']) {
    assert.equal((await sharp(join(dir, 'out', file)).metadata()).exif, undefined, file);
  }
});

test('processImage reuses the cache for the same version and redoes a new version', async () => {
  const dir = await tmp();
  await makeJpeg(join(dir, 'in.jpg'), 800, 600);
  await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v1');
  const before = (await stat(join(dir, 'out', 'w480.webp'))).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));
  await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v1');
  assert.equal((await stat(join(dir, 'out', 'w480.webp'))).mtimeMs, before);
  await makeJpeg(join(dir, 'in.jpg'), 400, 300);
  const meta = await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v2');
  assert.deepEqual(meta.widths, [400]);
  assert.ok(!existsSync(join(dir, 'out', 'w480.webp')), 'old variants are removed');
});

test('processAll skips broken or missing files with a warning and processes the rest', async () => {
  const dir = await tmp();
  const originalsDir = join(dir, 'originals');
  await mkdir(originalsDir);
  await makeJpeg(join(originalsDir, 'good.jpg'), 500, 500);
  await writeFile(join(originalsDir, 'bad.jpg'), 'dit is geen foto');
  const { metas, warnings } = await processAll(
    [
      { driveId: 'good', fileName: 'Goed.JPG', version: 'v' },
      { driveId: 'bad', fileName: 'kapot.jpg', version: 'v' },
      { driveId: 'gone', fileName: 'weg.png', version: 'v' },
    ],
    { originalsDir, cacheDir: join(dir, 'cache') },
  );
  assert.deepEqual([...metas.keys()], ['good']);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /"kapot\.jpg" kon niet verwerkt worden/);
  assert.match(warnings[1], /"weg\.png" kon niet verwerkt worden/);
});

test('assembleSiteImages publishes only the listed images and removes stale ones', async () => {
  const dir = await tmp();
  const cacheDir = join(dir, 'cache');
  const outDir = join(dir, 'site-img');
  await makeJpeg(join(dir, 'a.jpg'), 500, 400);
  await processImage(join(dir, 'a.jpg'), join(cacheDir, 'driveA'), 'v');
  await processImage(join(dir, 'a.jpg'), join(cacheDir, 'driveHidden'), 'v');
  await mkdir(join(outDir, 'w', 'deleted1'), { recursive: true });
  await writeFile(join(outDir, 'w', 'deleted1', 'w480.webp'), 'old');
  await assembleSiteImages([{ driveId: 'driveA', dir: 'w/aaaa1111' }], { cacheDir, outDir });
  assert.deepEqual(await readdir(join(outDir, 'w')), ['aaaa1111']);
  assert.deepEqual((await readdir(join(outDir, 'w', 'aaaa1111'))).sort(), ['og.jpg', 'w480.webp', 'w500.webp']);
});

test('assembleSiteImages with nothing to publish still leaves an empty folder', async () => {
  const dir = await tmp();
  await assembleSiteImages([], { cacheDir: join(dir, 'cache'), outDir: join(dir, 'site-img') });
  assert.deepEqual(await readdir(join(dir, 'site-img')), []);
});

test('prune removes cache entries for files that are no longer in Drive', async () => {
  const dir = await tmp();
  await mkdir(join(dir, 'keep'));
  await mkdir(join(dir, 'gone'));
  await writeFile(join(dir, 'keep2.jpg'), '');
  await writeFile(join(dir, 'gone2.heic'), '');
  await prune(dir, new Set(['keep', 'keep2']));
  assert.deepEqual((await readdir(dir)).sort(), ['keep', 'keep2.jpg']);
  await prune(join(dir, 'does-not-exist'), new Set());
});
