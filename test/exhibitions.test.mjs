import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExhibitions, todayInBrussels, hashKey, isPdfFile } from '../scripts/lib/exhibitions.mjs';
import { buildTexts } from '../scripts/lib/texts.mjs';
import { sheetToRecords } from '../scripts/lib/cells.mjs';

const HEADER = ['Titel NL', 'Titel EN', 'Van', 'Tot', 'Plaats', 'Adres', 'Tekst NL', 'Tekst EN', 'Afbeelding', 'Link', 'Tonen', 'Banner'];
const row = (values) => HEADER.map((h) => values[h] ?? '');
const run = (rows, { today = '2026-10-11', files = [] } = {}) =>
  buildExhibitions(sheetToRecords([HEADER, ...rows.map(row)]), files, today);
const titles = (list) => list.map((e) => e.title.nl);

test('splits into upcoming (today included), past and undated, using Tot or else Van', () => {
  const { upcoming, past, other } = run([
    { 'Titel NL': 'Licht op water', Van: 46338, Tot: '20/11/2026' },
    { 'Titel NL': 'Zomersalon', Van: '01/07/2025', Tot: '31/08/2025' },
    { 'Titel NL': 'Nieuws vandaag', Van: '2026-10-11' },
    { 'Titel NL': 'Atelier op afspraak' },
    { 'Titel NL': 'Open atelier', Van: '20/10/2026' },
    { 'Titel NL': 'Voorjaarsexpo', Van: '01/03/2026', Tot: '15/03/2026' },
  ]);
  assert.deepEqual(titles(upcoming), ['Nieuws vandaag', 'Open atelier', 'Licht op water']);
  assert.deepEqual(titles(past), ['Voorjaarsexpo', 'Zomersalon']);
  assert.deepEqual(titles(other), ['Atelier op afspraak']);
  assert.equal(upcoming[2].from, '2026-11-12');
  assert.equal(upcoming[2].end, '2026-11-20');
});

test('Tonen unticked hides an event; rows with only checkboxes are ignored', () => {
  const { upcoming, past, other, warnings } = run([
    { 'Titel NL': 'Weg ermee', Van: '20/10/2026', Tonen: false },
    { Tonen: true, Banner: false },
  ]);
  assert.equal(upcoming.length + past.length + other.length, 0);
  assert.deepEqual(warnings, []);
});

test('banner: one event only, the soonest upcoming one with Banner ticked', () => {
  const { banner } = run([
    { 'Titel NL': 'Oud', Van: '01/07/2025', Banner: true },
    { 'Titel NL': 'Later', Van: '01/03/2027', Banner: true },
    { 'Titel NL': 'Eerst', Van: '12/11/2026', Tot: '20/11/2026', Banner: true },
    { 'Titel NL': 'Geen banner', Van: '15/10/2026' },
  ]);
  assert.equal(banner.title.nl, 'Eerst');
});

test('the banner switches itself off after the end date', () => {
  const rows = [{ 'Titel NL': 'Licht op water', Van: '12/11/2026', Tot: '20/11/2026', Banner: true }];
  assert.equal(run(rows, { today: '2026-11-20' }).banner.title.nl, 'Licht op water');
  assert.equal(run(rows, { today: '2026-11-21' }).banner, null);
});

test('no banner unless ticked', () => {
  assert.equal(run([{ 'Titel NL': 'Expo', Van: '12/11/2026' }]).banner, null);
});

test('English falls back to Dutch; image and link are resolved', () => {
  const files = [{ id: 'img1', name: 'Affiche.JPG', mimeType: 'image/jpeg', modifiedTime: 't1' }];
  const { upcoming } = run(
    [{ 'Titel NL': 'Expo', 'Tekst NL': 'Welkom.', Van: '12/11/2026', Afbeelding: 'affiche.jpg', Link: 'www.cc-brasschaat.be' }],
    { files },
  );
  const [e] = upcoming;
  assert.deepEqual(e.title, { nl: 'Expo', en: 'Expo' });
  assert.deepEqual(e.text, { nl: 'Welkom.', en: 'Welkom.' });
  assert.equal(e.link, 'https://www.cc-brasschaat.be/');
  assert.deepEqual(e.image, { driveId: 'img1', fileName: 'Affiche.JPG', version: 't1', dir: `e/${hashKey('img1')}` });
  assert.equal(e.key, hashKey('Expo', '2026-11-12', ''));
});

test('bad dates skip the row with a warning; bad links and missing images only warn', () => {
  const { upcoming, warnings } = run([
    { 'Titel NL': 'Ooit', Van: 'volgende week' },
    { 'Titel NL': 'Expo', Van: '12/11/2026', Link: 'javascript:alert(1)', Afbeelding: 'weg.jpg' },
  ]);
  assert.deepEqual(titles(upcoming), ['Expo']);
  assert.equal(upcoming[0].link, null);
  assert.equal(upcoming[0].image, null);
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /rij 2: datum "volgende week" niet herkend/);
  assert.match(warnings[1], /rij 3: afbeelding "weg\.jpg" niet gevonden/);
  assert.match(warnings[2], /rij 3: link "javascript:alert\(1\)" is geen geldig webadres/);
});

test('Link may name a PDF in the Tentoonstellingen folder; web links ending in .pdf stay web links', () => {
  const files = [{ id: 'pdf1', name: 'Uitnodiging.pdf', mimeType: 'application/pdf', modifiedTime: 't1' }];
  const { upcoming, warnings } = run(
    [
      { 'Titel NL': 'Salon', Van: '12/11/2026', Link: 'uitnodiging.pdf' },
      { 'Titel NL': 'Expo', Van: '13/11/2026', Link: 'https://aib.be/salon.pdf' },
      { 'Titel NL': 'Open atelier', Van: '14/11/2026', Link: 'weg.pdf' },
    ],
    { files },
  );
  assert.deepEqual(upcoming[0].pdf, { driveId: 'pdf1', fileName: 'Uitnodiging.pdf', file: `${hashKey('pdf1')}.pdf` });
  assert.equal(upcoming[0].link, null);
  assert.equal(upcoming[1].pdf, null);
  assert.equal(upcoming[1].link, 'https://aib.be/salon.pdf');
  assert.equal(upcoming[2].pdf, null);
  assert.equal(upcoming[2].link, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /PDF "weg\.pdf" niet gevonden in de map Tentoonstellingen/);
});

test('isPdfFile: PDF type, or a .pdf name when Drive does not know the type', () => {
  assert.equal(isPdfFile({ name: 'a.pdf', mimeType: 'application/pdf' }), true);
  assert.equal(isPdfFile({ name: 'a.pdf', mimeType: 'application/octet-stream' }), true);
  assert.equal(isPdfFile({ name: 'a.pdf', mimeType: 'application/vnd.google-apps.shortcut' }), false);
  assert.equal(isPdfFile({ name: 'a.jpg', mimeType: 'image/jpeg' }), false);
});

test('todayInBrussels follows Brussels time around midnight, winter and summer', () => {
  assert.equal(todayInBrussels(new Date('2026-11-20T22:59:00Z')), '2026-11-20');
  assert.equal(todayInBrussels(new Date('2026-11-20T23:00:00Z')), '2026-11-21');
  assert.equal(todayInBrussels(new Date('2026-07-01T21:59:00Z')), '2026-07-01');
  assert.equal(todayInBrussels(new Date('2026-07-01T22:00:00Z')), '2026-07-02');
});

test('buildTexts: case-insensitive keys, English falls back to Dutch, empty rows ignored', () => {
  const texts = buildTexts(sheetToRecords([
    ['Key', 'NL', 'EN'],
    ['Home_Intro', 'Welkom', ''],
    ['about', 'Over mij', 'About me'],
    ['', 'los', ''],
    ['leeg', '', ''],
  ]));
  assert.deepEqual(texts, { home_intro: { nl: 'Welkom', en: 'Welkom' }, about: { nl: 'Over mij', en: 'About me' } });
});
