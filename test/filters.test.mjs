import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageUrl, absoluteUrl, dateRange, paragraphs, srcset, imgSrc } from '../src/_lib/filters.js';

test('pageUrl builds language-specific URLs, including work detail pages', () => {
  assert.equal(pageUrl('home', 'nl'), '/');
  assert.equal(pageUrl('exhibitions', 'en'), '/en/exhibitions/');
  assert.equal(pageUrl('work', 'nl', '3f2a9c1e'), '/werk/3f2a9c1e/');
  assert.throws(() => pageUrl('nope', 'nl'), /Unknown page/);
});

test('absoluteUrl adds base URL and path prefix', () => {
  assert.equal(absoluteUrl('/en/', 'https://alexanderboucquey.github.io', '/aquarel-atelier/'), 'https://alexanderboucquey.github.io/aquarel-atelier/en/');
  assert.equal(absoluteUrl('/werk/', 'https://dirkvermoesen.be', '/'), 'https://dirkvermoesen.be/werk/');
});

test('dateRange formats single days and ranges per language', () => {
  assert.equal(dateRange('2026-11-12', null, 'nl'), '12 november 2026');
  assert.equal(dateRange('2026-11-12', null, 'en'), '12 November 2026');
  assert.equal(dateRange('2026-11-12', '2026-11-20', 'nl'), '12–20 november 2026');
  assert.match(dateRange('2026-11-12', '2026-12-03', 'nl'), /^12 november\s*–\s*3 december 2026$/);
  assert.match(dateRange('2026-11-12', '2026-11-20', 'nl', { short: true }), /^12\s*–\s*20 nov\.?$/);
  assert.equal(dateRange(null, '2026-11-20', 'nl'), '20 november 2026');
  assert.equal(dateRange(null, null, 'nl'), '');
});

test('paragraphs escapes HTML and keeps line breaks', () => {
  assert.equal(paragraphs('Zee & <duinen>\nregel 2\n\nTweede'), '<p>Zee &amp; &lt;duinen&gt;<br>regel 2</p>\n<p>Tweede</p>');
  assert.equal(paragraphs(''), '');
  assert.equal(paragraphs(undefined), '');
});

test('srcset and imgSrc use the processed widths', () => {
  const image = { dir: 'w/3f2a9c1e', widths: [480, 700] };
  assert.equal(srcset(image), '/img/w/3f2a9c1e/w480.webp 480w, /img/w/3f2a9c1e/w700.webp 700w');
  assert.equal(imgSrc(image, 960), '/img/w/3f2a9c1e/w700.webp');
  assert.equal(imgSrc(image, 400), '/img/w/3f2a9c1e/w480.webp');
});
