import { text } from './cells.mjs';

/** Teksten tab (Key · NL · EN) → { key: { nl, en } }. Keys are lower-cased; English falls back to Dutch. */
export function buildTexts(records) {
  const texts = {};
  for (const row of records) {
    const key = text(row.key).toLowerCase();
    const nl = text(row.nl);
    const en = text(row.en);
    if (!key || (!nl && !en)) continue;
    texts[key] = { nl, en: en || nl };
  }
  return texts;
}
