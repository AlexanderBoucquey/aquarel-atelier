import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContent, imageList, finalizeContent } from '../scripts/content.mjs';
import { hashKey } from '../scripts/lib/exhibitions.mjs';

const photo = (id, name) => ({ id, name, mimeType: 'image/jpeg', createdTime: '2026-01-01T00:00:00Z', modifiedTime: 'm' });
const registry = ['d1', 'd2', 'd3', 'd4'].map((id) => ({ uuid: `${id}aaaaaa-0000-4000-8000-000000000000`, driveId: id, fileName: '', firstSeen: '' }));
const meta = { width: 960, height: 640, widths: [480, 960] };
const metasFor = (...ids) => new Map(ids.map((id) => [id, meta]));

function raw() {
  return {
    sheets: {
      werken: [
        ['Bestand', 'ID', 'Titel NL', 'Techniek', 'Tonen', 'Uitgelicht'],
        ['', 'd1', 'Haven', 'Aquarel', true, true],
        ['', 'd2', 'Verborgen', 'Olieverf', false, false],
        ['', 'd3', 'Duinen', 'Gemengde techniek', true, false],
        ['', 'd4', 'Bos', 'Tekening', true, false],
      ],
      tentoonstellingen: [['Titel NL', 'Van', 'Afbeelding', 'Banner'], ['Licht op water', '12/11/2026', 'affiche.jpg', true]],
      teksten: [['Key', 'NL', 'EN'], ['about', 'Over mij', '']],
    },
    folders: {
      werken: [photo('d1', 'a.jpg'), photo('d2', 'b.jpg'), photo('d3', 'c.jpg'), photo('d4', 'd.jpg')],
      tentoonstellingen: [photo('e1', 'affiche.jpg')],
    },
  };
}

test('empty or missing tabs and folders give empty content, not a crash', () => {
  const content = buildContent({}, [], '2026-10-11');
  assert.deepEqual(content.works, []);
  assert.deepEqual(content.exhibitions, { upcoming: [], past: [], other: [] });
  assert.equal(content.banner, null);
  assert.deepEqual(content.texts, {});
  const site = finalizeContent(content, new Map());
  assert.equal(site.hero, null);
  assert.deepEqual(site.homeWorks, []);
  assert.deepEqual(site.techniques, []);
});

test('imageList contains only what gets published: visible works and exhibition images', () => {
  const list = imageList(buildContent(raw(), registry, '2026-10-11'));
  assert.deepEqual(
    list.map((i) => [i.driveId, i.dir]),
    [['d1', 'w/d1aaaaaa'], ['d3', 'w/d3aaaaaa'], ['d4', 'w/d4aaaaaa'], ['e1', `e/${hashKey('e1')}`]],
  );
});

test('finalizeContent fills image sizes and drops works whose image failed', () => {
  const site = finalizeContent(buildContent(raw(), registry, '2026-10-11'), metasFor('d1', 'd4', 'e1'));
  assert.deepEqual(site.works.map((w) => w.title.nl), ['Haven', 'Bos']);
  assert.deepEqual(site.works[0].image, { driveId: 'd1', fileName: 'a.jpg', version: 'm', dir: 'w/d1aaaaaa', width: 960, height: 640, widths: [480, 960] });
  assert.equal(site.banner.image.width, 960);
  assert.equal(site.exhibitions.upcoming[0].image.dir, `e/${hashKey('e1')}`);
  assert.deepEqual(site.texts, { about: { nl: 'Over mij', en: 'Over mij' } });
});

test('hero is the first featured work; home shows the other featured works, or else the latest works', () => {
  const site = finalizeContent(buildContent(raw(), registry, '2026-10-11'), metasFor('d1', 'd3', 'd4'));
  assert.equal(site.hero.title.nl, 'Haven');
  assert.deepEqual(site.homeWorks.map((w) => w.title.nl), ['Duinen', 'Bos']);
});

test('techniques: only those of published works, known ones first in fixed order', () => {
  const site = finalizeContent(buildContent(raw(), registry, '2026-10-11'), metasFor('d1', 'd3', 'd4'));
  assert.deepEqual(site.techniques.map((t) => t.key), ['aquarel', 'tekening', 'gemengde-techniek']);
});
