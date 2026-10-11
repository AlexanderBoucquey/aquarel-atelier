// Originals → WebP variants + Open Graph JPEG, cached per Drive file, and the exact set of images to publish.
import { mkdir, readFile, writeFile, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

export const WIDTHS = [480, 960, 1600];
const OG = { width: 1200, height: 630, background: '#f7f4ee' };

/** File name of a downloaded original: Drive ID + its extension. */
export function originalName(driveId, fileName) {
  return driveId + extname(fileName).toLowerCase();
}

/** Standard widths below the original width, plus the original width capped at the largest standard one. */
export function variantWidths(width) {
  const largest = WIDTHS.at(-1);
  return [...new Set([...WIDTHS.filter((w) => w < width), Math.min(width, largest)])];
}

/**
 * Writes w<width>.webp variants and og.jpg into outDir. EXIF orientation is applied, all metadata is stripped
 * (sharp's default). Nothing is redone when outDir already holds this version.
 * @returns {Promise<{version: string, width: number, height: number, widths: number[]}>}  largest variant size
 */
export async function processImage(input, outDir, version) {
  const metaPath = join(outDir, 'meta.json');
  const cached = await readJson(metaPath);
  const cachedFiles = cached ? [...cached.widths.map((w) => `w${w}.webp`), 'og.jpg'] : [];
  if (cached?.version === version && cachedFiles.every((f) => existsSync(join(outDir, f)))) return cached;

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const source = /\.(heic|heif)$/i.test(input) ? await heicToJpeg(input, join(outDir, 'source.jpg')) : input;
  try {
    const { width, height, orientation = 1 } = await sharp(source).metadata();
    const widths = variantWidths(orientation >= 5 ? height : width);
    let largest;
    for (const w of widths) {
      largest = await sharp(source).rotate().resize({ width: w }).webp({ quality: 80 }).toFile(join(outDir, `w${w}.webp`));
    }
    await sharp(source)
      .rotate()
      .resize({ width: OG.width, height: OG.height, fit: 'contain', background: OG.background })
      .flatten({ background: OG.background })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(join(outDir, 'og.jpg'));
    const meta = { version, width: largest.width, height: largest.height, widths };
    await writeFile(metaPath, JSON.stringify(meta));
    return meta;
  } finally {
    if (source !== input) await rm(source, { force: true });
  }
}

async function heicToJpeg(input, output) {
  try {
    await execFileAsync('heif-convert', [input, output]);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('HEIC needs heif-convert (apt install libheif-examples)');
    throw err;
  }
  return output;
}

/** Process every image; failures become Dutch warnings for the run summary. */
export async function processAll(images, { originalsDir, cacheDir }) {
  const metas = new Map();
  const warnings = [];
  for (const image of images) {
    if (metas.has(image.driveId)) continue;
    try {
      const input = join(originalsDir, originalName(image.driveId, image.fileName));
      metas.set(image.driveId, await processImage(input, join(cacheDir, image.driveId), image.version));
    } catch (err) {
      warnings.push(`Foto "${image.fileName}" kon niet verwerkt worden en wordt overgeslagen (${err.message}).`);
    }
  }
  return { metas, warnings };
}

/** outDir/<dir>/ gets exactly the listed images; anything else (hidden or deleted photos) is removed. */
export async function assembleSiteImages(images, { cacheDir, outDir }) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const { driveId, dir } of images) {
    const target = join(outDir, dir);
    await mkdir(target, { recursive: true });
    for (const name of await readdir(join(cacheDir, driveId))) {
      if (name.endsWith('.webp') || name === 'og.jpg') await cp(join(cacheDir, driveId, name), join(target, name));
    }
  }
}

/** Remove files/folders whose Drive ID (name without extension) is not in keepIds. */
export async function prune(dir, keepIds) {
  if (!existsSync(dir)) return;
  for (const name of await readdir(dir)) {
    if (!keepIds.has(name.replace(/\.[^.]+$/, ''))) await rm(join(dir, name), { recursive: true, force: true });
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}
