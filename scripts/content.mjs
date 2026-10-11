import { sheetToRecords } from './lib/cells.mjs';
import { buildWorks, TECHNIQUE_ORDER } from './lib/works.mjs';
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
 * lose their image. Adds hero, homeWorks and techniques for the templates.
 */
export function finalizeContent(content, metas) {
  const fill = (image) => {
    const meta = image && metas.get(image.driveId);
    return meta ? { ...image, width: meta.width, height: meta.height, widths: meta.widths } : null;
  };
  const withImage = (e) => e && { ...e, image: fill(e.image) };
  const works = content.works.map((w) => ({ ...w, image: fill(w.image) })).filter((w) => w.image);
  const featured = works.filter((w) => w.featured);
  const hero = featured[0] ?? works[0] ?? null;
  const homeWorks = (featured.length > 1 ? featured : works).filter((w) => w !== hero).slice(0, 8);
  return {
    works,
    hero,
    homeWorks,
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

function techniquesOf(works) {
  const byKey = new Map();
  for (const w of works) if (w.technique && !byKey.has(w.technique.key)) byKey.set(w.technique.key, w.technique);
  const rank = (t) => (TECHNIQUE_ORDER.includes(t.key) ? TECHNIQUE_ORDER.indexOf(t.key) : TECHNIQUE_ORDER.length);
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b) || a.label.nl.localeCompare(b.label.nl));
}
