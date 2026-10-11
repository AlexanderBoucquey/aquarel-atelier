// Builds the site from the sample content (fixtures/) and checks the rendered pages.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Eleventy from '@11ty/eleventy';

const config = JSON.parse(readFileSync('site.config.json', 'utf8'));
const prefix = config.pathPrefix.replace(/\/$/, '');
const rel = (path) => `${prefix}${path}`;
const abs = (path) => new URL(rel(path), config.baseUrl).href;

let out;
const page = (path) => readFile(join(out, path), 'utf8');

before(async () => {
  execFileSync(process.execPath, ['scripts/build-data.mjs', '--source=fixtures', '--today=2026-10-11'], { stdio: 'pipe' });
  out = await mkdtemp(join(tmpdir(), 'site-'));
  const eleventy = new Eleventy('src', out, { configPath: 'eleventy.config.js', quietMode: true });
  await eleventy.write();
});

test('home exists in both languages with hreflang alternates', async () => {
  const nl = await page('index.html');
  assert.match(nl, /<html lang="nl">/);
  assert.ok(nl.includes(`hreflang="en" href="${abs('/en/')}"`));
  assert.match(await page('en/index.html'), /<html lang="en">/);
});

test('internal links carry the path prefix', async () => {
  const nl = await page('index.html');
  assert.ok(nl.includes(`href="${rel('/werk/')}"`));
  if (prefix) assert.ok(!nl.includes('href="/werk/"'));
});

test('every published work has a page per language; the hidden work has none', () => {
  for (const id of ['1a2b3c4d', '2b3c4d5e', '5e6f7a8b', '7a8b9c0d']) {
    assert.ok(existsSync(join(out, 'werk', id, 'index.html')), `nl ${id}`);
    assert.ok(existsSync(join(out, 'en', 'work', id, 'index.html')), `en ${id}`);
  }
  assert.ok(!existsSync(join(out, 'werk', '6f7a8b9c')));
  assert.ok(!existsSync(join(out, 'img', 'w', '6f7a8b9c')));
});

test('sheet text is escaped exactly once', async () => {
  const html = await page('werk/7a8b9c0d/index.html');
  assert.ok(html.includes('Zee &amp; duinen'));
  assert.ok(!html.includes('&amp;amp;'));
});

test('English page falls back to the Dutch title', async () => {
  assert.ok((await page('en/work/2b3c4d5e/index.html')).includes('<h1>Berken in maart</h1>'));
});

test('a work without title gets a fallback heading and alt text', async () => {
  const html = await page('werk/5e6f7a8b/index.html');
  assert.ok(html.includes('alt="Werk van Dirk Vermoesen"'));
  assert.match(html, /<h1 class="visually-hidden">Werk van Dirk Vermoesen<\/h1>/);
});

test('language switch points to the same work in the other language', async () => {
  const html = await page('werk/1a2b3c4d/index.html');
  assert.ok(html.includes(`class="lang-switch" href="${rel('/en/work/1a2b3c4d/')}"`));
  assert.ok(html.includes(`content="${abs('/img/w/1a2b3c4d/og.jpg')}"`));
});

test('the announcement strip shows on normal pages but not on the exhibitions page', async () => {
  assert.ok((await page('index.html')).includes('data-event-strip'));
  assert.ok((await page('contact/index.html')).includes('data-event-strip'));
  const exhibitions = await page('tentoonstellingen/index.html');
  assert.ok(!exhibitions.includes('data-event-strip'));
  assert.ok(exhibitions.includes('Licht op water'));
  assert.ok(exhibitions.includes('Zomersalon'));
  assert.ok(!exhibitions.includes('Oude aankondiging'));
});

test('sitemap lists work pages with absolute URLs', async () => {
  assert.ok((await page('sitemap.xml')).includes(`<loc>${abs('/en/work/1a2b3c4d/')}</loc>`));
});

test('404 page exists', () => {
  assert.ok(existsSync(join(out, '404.html')));
});
