import { sheetToRecords } from './lib/cells.mjs';
import { buildWorks, TECHNIQUE_ORDER, SUBJECT_ORDER } from './lib/works.mjs';
import { buildExhibitions } from './lib/exhibitions.mjs';
import { buildTexts } from './lib/texts.mjs';

/*
 * Raw snapshot, written by scripts/fetch.mjs (or committed as fixtures/raw.json):
 * {
 *   sheets:  { werken, tentoonstellingen, teksten }  // Cell[][], first row = headers
 *   folders: { werken, tentoonstellingen }           // [{ id, name, mimeType, createdTime, modifiedTime }]
 * }
 */

/** Pure: raw snapshot + ID registry → site content (images not processed yet). */
export function buildContent(raw, registry, today) {
  const uuidByDriveId = new Map(registry.map((e) => [e.driveId, e.uuid]));
  const works = buildWorks(sheetToRecords(raw.sheets?.werken), raw.folders?.werken ?? [], uuidByDriveId);
  const exhibitions = buildExhibitions(sheetToRecords(raw.sheets?.tentoonstellingen), raw.folders?.tentoonstellingen ?? [], today);
  return {
    works: works.works,
    exhibitions: { upcoming: exhibitions.upcoming, past: exhibitions.past, other: exhibitions.other },
    banner: exhibitions.banner,
    texts: buildTexts(sheetToRecords(raw.sheets?.teksten)),
    warnings: [...works.warnings, ...exhibitions.warnings],
  };
}

/** Every image that gets published: visible works + images of visible exhibitions, once each. */
export function imageList(content) {
  const { upcoming, past, other } = content.exhibitions;
  const all = [...content.works.map((w) => w.image), ...[...upcoming, ...past, ...other].map((e) => e.image).filter(Boolean)];
  return [...new Map(all.map((image) => [image.driveId, image])).values()];
}

/**
 * Attach processed image sizes. Works whose image failed are dropped (processAll already warned); exhibitions just
 * lose their image. Adds for the templates: heroes (the home page shows one of them per visit; hero is the first, for
 * visitors without JavaScript and for link previews), subjects with their home page picks, and techniques.
 */
export function finalizeContent(content, metas) {
  const fill = (image) => {
    const meta = image && metas.get(image.driveId);
    return meta ? { ...image, width: meta.width, height: meta.height, widths: meta.widths } : null;
  };
  const withImage = (e) => e && { ...e, image: fill(e.image) };
  // Awarded works first, so they lead the gallery and every filtered view they belong to (stable sort: everything
  // else keeps the sheet order).
  const works = content.works
    .map((w) => ({ ...w, image: fill(w.image) }))
    .filter((w) => w.image)
    .sort((a, b) => Number(Boolean(b.award?.nl)) - Number(Boolean(a.award?.nl)));
  const featured = works.filter((w) => w.featured);
  const heroes = featured.length ? featured : works.slice(0, 1);
  return {
    works,
    hero: heroes[0] ?? null,
    heroes,
    subjects: subjectsOf(works),
    techniques: techniquesOf(works),
    exhibitions: {
      upcoming: content.exhibitions.upcoming.map(withImage),
      past: content.exhibitions.past.map(withImage),
      other: content.exhibitions.other.map(withImage),
    },
    banner: withImage(content.banner),
    texts: content.texts,
  };
}

const MAX_PICKS = 12;

/** One entry per subject in use, known ones first; picks = its featured works, else its first works. */
function subjectsOf(works) {
  const byKey = new Map();
  for (const w of works) {
    if (!w.subject) continue;
    if (!byKey.has(w.subject.key)) byKey.set(w.subject.key, { ...w.subject, works: [] });
    byKey.get(w.subject.key).works.push(w);
  }
  const rank = (s) => (SUBJECT_ORDER.includes(s.key) ? SUBJECT_ORDER.indexOf(s.key) : SUBJECT_ORDER.length);
  return [...byKey.values()]
    .sort((a, b) => rank(a) - rank(b) || a.plural.nl.localeCompare(b.plural.nl))
    .map(({ works: all, ...s }) => {
      const featured = all.filter((w) => w.featured);
      return { ...s, count: all.length, picks: (featured.length ? featured : all).slice(0, MAX_PICKS) };
    });
}

function techniquesOf(works) {
  const byKey = new Map();
  for (const w of works) if (w.technique && !byKey.has(w.technique.key)) byKey.set(w.technique.key, w.technique);
  const rank = (t) => (TECHNIQUE_ORDER.includes(t.key) ? TECHNIQUE_ORDER.indexOf(t.key) : TECHNIQUE_ORDER.length);
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b) || a.label.nl.localeCompare(b.label.nl));
}
