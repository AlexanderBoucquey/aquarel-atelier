import { text, bool } from './cells.mjs';
import { shortId } from '../ids.mjs';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|tiff?|avif|gif)$/i;

/** Can this Drive file be shown as a picture? */
export function isImageFile(file) {
  const mimeType = file.mimeType ?? '';
  if (mimeType.startsWith('image/')) return true;
  // Shortcuts, Google Docs, PDFs… are never photos, even when named "x.jpg"; the extension only decides when
  // Drive does not know the type.
  if (mimeType && mimeType !== 'application/octet-stream') return false;
  return IMAGE_EXTENSIONS.test(file.name ?? '');
}

const KNOWN_TECHNIQUES = [
  { key: 'aquarel', label: { nl: 'Aquarel', en: 'Watercolour' }, aliases: ['aquarel', 'watercolour', 'watercolor', 'waterverf'] },
  { key: 'tekening', label: { nl: 'Tekening', en: 'Drawing' }, aliases: ['tekening', 'drawing'] },
  { key: 'olieverf', label: { nl: 'Olieverf', en: 'Oil painting' }, aliases: ['olieverf', 'olie', 'oil', 'oil painting', 'oilpainting'] },
];

export const TECHNIQUE_ORDER = KNOWN_TECHNIQUES.map((t) => t.key);

/** Techniek cell → { key, label: { nl, en } } or null. Unknown techniques are kept as typed, in both languages. */
export function technique(value) {
  const typed = text(value);
  if (!typed) return null;
  const known = KNOWN_TECHNIQUES.find((t) => t.aliases.includes(typed.toLowerCase()));
  if (known) return { key: known.key, label: known.label };
  return { key: slugify(typed), label: { nl: typed, en: typed } };
}

function slugify(value) {
  const slug = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'overig';
}

const UNTITLED = { nl: 'Werk van Dirk Vermoesen', en: 'Work by Dirk Vermoesen' };
const TEXT_COLUMNS = ['titel nl', 'titel en', 'techniek', 'jaar', 'afmetingen', 'beschrijving nl', 'beschrijving en'];

/**
 * Join the photos in Werken/ with the rows of the Werken tab. Every column is optional: a photo without a row is
 * published as image only, and a row only hides its photo when Tonen is unticked. Rows with a known ID claim their
 * photo first; the other rows match on file name among the photos still unclaimed. Photos without a row come first
 * (newest first), then rows in sheet order.
 * Throws when the tab has rows but neither a Bestand nor an ID column: rows could not be matched, and publishing every
 * photo would also publish hidden works.
 */
export function buildWorks(records, files, uuidByDriveId) {
  if (records.length && !records.some((row) => 'id' in row || 'bestand' in row)) {
    throw new Error('Tabblad Werken: de kolommen "Bestand" en "ID" ontbreken (kopregel gewijzigd of verwijderd?). De website wordt niet bijgewerkt tot dit hersteld is.');
  }
  const warnings = [];
  if (records.length && !('tonen' in records[0])) warnings.push('Werken: kolom "Tonen" ontbreekt; alle foto\'s worden getoond.');
  const photos = [];
  for (const file of files) {
    if (isImageFile(file)) photos.push(file);
    else warnings.push(`Werken: "${file.name}" is geen foto en wordt overgeslagen.`);
  }
  const byId = new Map(photos.map((f) => [f.id, f]));
  const byName = new Map();
  for (const f of photos) {
    const name = f.name.trim().toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), f]);
  }

  const claimed = new Set();
  const fileOf = new Map();
  for (const row of records) {
    const file = byId.get(text(row.id));
    if (file && !claimed.has(file.id)) {
      claimed.add(file.id);
      fileOf.set(row, file);
    }
  }
  for (const row of records) {
    if (fileOf.has(row)) continue;
    const id = text(row.id);
    const name = text(row.bestand);
    if (!id && !name) {
      if (TEXT_COLUMNS.some((column) => text(row[column]))) {
        warnings.push(`Werken, rij ${row.rowNumber}: er is geen foto gekoppeld (Bestand en ID zijn leeg).`);
      }
      continue;
    }
    const sameName = byName.get(name.toLowerCase()) ?? [];
    const file = sameName.find((f) => !claimed.has(f.id));
    if (file) {
      claimed.add(file.id);
      fileOf.set(row, file);
      continue;
    }
    const taken = byId.get(id) ?? sameName[0];
    warnings.push(taken
      ? `Werken, rij ${row.rowNumber}: "${taken.name}" staat al in een andere rij; deze rij wordt genegeerd.`
      : `Werken, rij ${row.rowNumber}: foto "${name || id}" niet gevonden in de map Werken.`);
  }

  const listed = records
    .filter((row) => fileOf.has(row) && bool(row.tonen, true))
    .map((row) => toWork(fileOf.get(row), row, uuidByDriveId));
  const unlisted = photos
    .filter((f) => !claimed.has(f.id))
    .sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? ''))
    .map((f) => toWork(f, {}, uuidByDriveId));
  return { works: [...unlisted, ...listed], warnings };
}

function toWork(file, row, uuidByDriveId) {
  const uuid = uuidByDriveId.get(file.id);
  if (!uuid) throw new Error(`No ID registered for Drive file ${file.id} (${file.name})`);
  const id = shortId(uuid);
  const titleNl = text(row['titel nl']);
  const title = { nl: titleNl, en: text(row['titel en']) || titleNl };
  const tech = technique(row.techniek);
  const year = text(row.jaar);
  const size = text(row.afmetingen);
  const descriptionNl = text(row['beschrijving nl']);
  const meta = (lang) => [tech?.label[lang], year, size].filter(Boolean).join(' · ');
  const alt = (lang) => [title[lang] || UNTITLED[lang], tech?.label[lang], year].filter(Boolean).join(', ');
  return {
    id,
    uuid,
    title,
    technique: tech,
    year,
    size,
    description: { nl: descriptionNl, en: text(row['beschrijving en']) || descriptionNl },
    meta: { nl: meta('nl'), en: meta('en') },
    alt: { nl: alt('nl'), en: alt('en') },
    featured: bool(row.uitgelicht, false),
    image: { driveId: file.id, fileName: file.name, version: file.modifiedTime ?? '', dir: `w/${id}` },
  };
}
