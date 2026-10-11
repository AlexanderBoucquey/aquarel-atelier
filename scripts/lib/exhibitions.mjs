import { createHash } from 'node:crypto';
import { text, bool, date, link } from './cells.mjs';
import { isImageFile } from './works.mjs';

const CONTENT_COLUMNS = ['titel nl', 'titel en', 'van', 'tot', 'plaats', 'adres', 'tekst nl', 'tekst en', 'afbeelding', 'link'];

/** Short stable hash: exhibition anchors, banner dismissal and exhibition image folders. */
export function hashKey(...parts) {
  return createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 10);
}

/** Today in Brussels as YYYY-MM-DD. */
export function todayInBrussels(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Tentoonstellingen rows → upcoming (end ≥ today, soonest first), past (most recent first) and other (no dates,
 * sheet order). end = Tot, else Van. banner = the soonest upcoming (or undated) event with Banner ticked.
 */
export function buildExhibitions(records, files, today) {
  const warnings = [];
  const imagesByName = new Map();
  for (const f of files.filter(isImageFile)) {
    const name = f.name.trim().toLowerCase();
    if (!imagesByName.has(name)) imagesByName.set(name, f);
  }

  const items = [];
  for (const row of records) {
    if (!CONTENT_COLUMNS.some((column) => text(row[column]))) continue;
    if (!bool(row.tonen, true)) continue;
    const where = `Tentoonstellingen, rij ${row.rowNumber}`;
    const from = date(row.van);
    const to = date(row.tot);
    if (from.error || to.error) {
      warnings.push(`${where}: datum "${text(from.error ? row.van : row.tot)}" niet herkend (gebruik bv. 12/11/2026); rij overgeslagen.`);
      continue;
    }
    const imageName = text(row.afbeelding);
    const image = imageName ? imagesByName.get(imageName.toLowerCase()) : undefined;
    if (imageName && !image) warnings.push(`${where}: afbeelding "${imageName}" niet gevonden in de map Tentoonstellingen.`);
    const typedLink = text(row.link);
    const url = link(typedLink);
    if (typedLink && !url) warnings.push(`${where}: link "${typedLink}" is geen geldig webadres.`);

    const titleNl = text(row['titel nl']);
    const textNl = text(row['tekst nl']);
    items.push({
      key: hashKey(titleNl, from.value ?? '', to.value ?? ''),
      title: { nl: titleNl, en: text(row['titel en']) || titleNl },
      text: { nl: textNl, en: text(row['tekst en']) || textNl },
      from: from.value,
      to: to.value,
      end: to.value ?? from.value,
      place: text(row.plaats),
      address: text(row.adres),
      link: url,
      image: image ? { driveId: image.id, fileName: image.name, version: image.modifiedTime ?? '', dir: `e/${hashKey(image.id)}` } : null,
      banner: bool(row.banner, false),
    });
  }

  const start = (e) => e.from ?? e.end;
  const upcoming = items.filter((e) => e.end && e.end >= today).sort((a, b) => start(a).localeCompare(start(b)));
  const past = items.filter((e) => e.end && e.end < today).sort((a, b) => b.end.localeCompare(a.end));
  const other = items.filter((e) => !e.end);
  const banner = [...upcoming, ...other].find((e) => e.banner) ?? null;
  return { upcoming, past, other, banner, warnings };
}
