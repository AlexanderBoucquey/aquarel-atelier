// Site content prepared by scripts/build-data.mjs, plus one entry per work page per language.
import { readFile } from 'node:fs/promises';
import { LANGS } from '../_lib/routes.js';

export default async function () {
  let content;
  try {
    content = JSON.parse(await readFile('.cache/content.json', 'utf8'));
  } catch {
    throw new Error('No .cache/content.json. Run `npm run data:fixtures` (sample content) or `npm run fetch && npm run data:google` first.');
  }
  content.workPages = LANGS.flatMap((lang) =>
    content.works.map((work, i, works) => ({ lang, work, prev: works[i - 1] ?? null, next: works[i + 1] ?? null })),
  );
  return content;
}
