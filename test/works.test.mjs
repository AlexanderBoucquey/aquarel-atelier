import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorks, technique, isImageFile } from '../scripts/lib/works.mjs';
import { sheetToRecords } from '../scripts/lib/cells.mjs';

const HEADER = ['Bestand', 'ID', 'Titel NL', 'Titel EN', 'Techniek', 'Jaar', 'Afmetingen', 'Beschrijving NL', 'Beschrijving EN', 'Tonen', 'Uitgelicht'];
const row = (values) => HEADER.map((h) => values[h] ?? '');
const photo = (id, name, createdTime = '2026-01-01T00:00:00Z') => ({ id, name, mimeType: 'image/jpeg', createdTime, modifiedTime: '2026-01-02T00:00:00Z' });

function run(rows, files) {
  const uuids = new Map(files.map((f) => [f.id, `${f.id.padEnd(8, '0')}-0000-4000-8000-000000000000`]));
  return buildWorks(sheetToRecords([HEADER, ...rows.map(row)]), files, uuids);
}

test('a photo without any row is published as image only', () => {
  const { works, warnings } = run([], [photo('d1', 'IMG_0412.jpg')]);
  assert.equal(works.length, 1);
  assert.equal(works[0].id, 'd1000000');
  assert.deepEqual(works[0].title, { nl: '', en: '' });
  assert.deepEqual(works[0].alt, { nl: 'Werk van Dirk Vermoesen', en: 'Work by Dirk Vermoesen' });
  assert.deepEqual(works[0].image, { driveId: 'd1', fileName: 'IMG_0412.jpg', version: '2026-01-02T00:00:00Z', dir: 'w/d1000000' });
  assert.deepEqual(warnings, []);
});

test('rows match on ID first, else on file name (case-insensitive)', () => {
  const { works } = run(
    [{ Bestand: 'oude-naam.jpg', ID: 'd2', 'Titel NL': 'Berken' }, { Bestand: 'HAVEN.JPG', 'Titel NL': 'Haven' }],
    [photo('d1', 'haven.jpg'), photo('d2', 'nieuwe-naam.jpg')],
  );
  assert.deepEqual(works.map((w) => w.title.nl), ['Berken', 'Haven']);
});

test('a row whose ID is gone re-attaches to a re-uploaded photo with the same name', () => {
  const { works, warnings } = run([{ Bestand: 'haven.jpg', ID: 'oud-id', 'Titel NL': 'Haven' }], [photo('d9', 'haven.jpg')]);
  assert.equal(works[0].title.nl, 'Haven');
  assert.deepEqual(warnings, []);
});

test('Tonen unticked hides a work; an empty Tonen cell shows it', () => {
  const { works } = run(
    [{ ID: 'd1', 'Titel NL': 'Verborgen', Tonen: false }, { ID: 'd2', 'Titel NL': 'Zichtbaar', Tonen: '' }],
    [photo('d1', 'a.jpg'), photo('d2', 'b.jpg')],
  );
  assert.deepEqual(works.map((w) => w.title.nl), ['Zichtbaar']);
});

test('every field is optional and English falls back to Dutch', () => {
  const { works } = run([{ ID: 'd1', 'Titel NL': 'Haven', 'Beschrijving NL': 'Avondlicht.' }], [photo('d1', 'a.jpg')]);
  const [work] = works;
  assert.deepEqual(work.title, { nl: 'Haven', en: 'Haven' });
  assert.deepEqual(work.description, { nl: 'Avondlicht.', en: 'Avondlicht.' });
  assert.equal(work.technique, null);
  assert.equal(work.year, '');
  assert.deepEqual(work.meta, { nl: '', en: '' });
  assert.equal(work.featured, false);
});

test('meta line and alt text combine title, technique, year and size per language', () => {
  const { works } = run(
    [{ ID: 'd1', 'Titel NL': 'Haven', 'Titel EN': 'Harbour', Techniek: 'Aquarel', Jaar: 2024, Afmetingen: '36 x 48 cm', Uitgelicht: true }],
    [photo('d1', 'a.jpg')],
  );
  const [work] = works;
  assert.deepEqual(work.meta, { nl: 'Aquarel · 2024 · 36 x 48 cm', en: 'Watercolour · 2024 · 36 x 48 cm' });
  assert.deepEqual(work.alt, { nl: 'Haven, Aquarel, 2024', en: 'Harbour, Watercolour, 2024' });
  assert.equal(work.featured, true);
});

test('order: photos without a row first (newest first), then rows in sheet order', () => {
  const { works } = run(
    [{ ID: 'd3', 'Titel NL': 'Derde' }, { ID: 'd1', 'Titel NL': 'Eerste' }],
    [
      photo('d1', 'a.jpg', '2026-01-01T00:00:00Z'),
      photo('d2', 'b.jpg', '2026-03-01T00:00:00Z'),
      photo('d3', 'c.jpg'),
      photo('d4', 'd.jpg', '2026-05-01T00:00:00Z'),
    ],
  );
  assert.deepEqual(works.map((w) => w.image.driveId), ['d4', 'd2', 'd3', 'd1']);
});

test('problems become warnings, never crashes', () => {
  const { works, warnings } = run(
    [
      { Bestand: 'weg.jpg', 'Titel NL': 'Verdwenen' },
      { ID: 'd1', 'Titel NL': 'Eerste rij' },
      { Bestand: 'a.jpg', 'Titel NL': 'Dubbel' },
      { 'Titel NL': 'Zonder foto' },
    ],
    [photo('d1', 'a.jpg'), { id: 'p1', name: 'notities.pdf', mimeType: 'application/pdf' }],
  );
  assert.deepEqual(works.map((w) => w.title.nl), ['Eerste rij']);
  assert.equal(warnings.length, 4);
  assert.match(warnings[0], /"notities\.pdf" is geen foto/);
  assert.match(warnings[1], /rij 2: foto "weg\.jpg" niet gevonden/);
  assert.match(warnings[2], /rij 4: "a\.jpg" staat al in een rij hierboven/);
  assert.match(warnings[3], /rij 5: er is geen foto gekoppeld/);
});

test('fully empty rows (only checkboxes) are skipped silently', () => {
  const { works, warnings } = run([{ Tonen: false, Uitgelicht: false }, {}], [photo('d1', 'a.jpg')]);
  assert.equal(works.length, 1);
  assert.deepEqual(warnings, []);
});

test('technique: known names in either language, unknown kept as typed', () => {
  assert.deepEqual(technique('Aquarel'), { key: 'aquarel', label: { nl: 'Aquarel', en: 'Watercolour' } });
  assert.equal(technique(' watercolor ').key, 'aquarel');
  assert.equal(technique('OLIEVERF').label.en, 'Oil painting');
  assert.deepEqual(technique('Gemengde techniek'), { key: 'gemengde-techniek', label: { nl: 'Gemengde techniek', en: 'Gemengde techniek' } });
  assert.equal(technique(''), null);
});

test('isImageFile accepts image mime types and known extensions such as HEIC', () => {
  assert.equal(isImageFile({ name: 'a.jpg', mimeType: 'image/jpeg' }), true);
  assert.equal(isImageFile({ name: 'IMG_1.HEIC', mimeType: 'application/octet-stream' }), true);
  assert.equal(isImageFile({ name: 'film.mov', mimeType: 'video/quicktime' }), false);
});
