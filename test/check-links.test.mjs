import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractUrls, resolveLink, checkSite } from '../scripts/check-links.mjs';

test('extractUrls finds href, src and every srcset candidate', () => {
  const html = '<a href="/p/werk/">x</a><img src="/p/img/a/w480.webp" srcset="/p/img/a/w480.webp 480w, /p/img/a/w960.webp 960w">';
  assert.deepEqual(extractUrls(html), ['/p/werk/', '/p/img/a/w480.webp', '/p/img/a/w480.webp', '/p/img/a/w960.webp']);
});

test('resolveLink maps site URLs to output files and skips external ones', () => {
  assert.deepEqual(resolveLink('/aquarel-atelier/werk/', '/aquarel-atelier/'), { file: 'werk/index.html' });
  assert.deepEqual(resolveLink('/aquarel-atelier/', '/aquarel-atelier/'), { file: 'index.html' });
  assert.deepEqual(resolveLink('/aquarel-atelier/tentoonstellingen/#e-1', '/aquarel-atelier/'), { file: 'tentoonstellingen/index.html' });
  assert.deepEqual(resolveLink('/werk/', '/aquarel-atelier/'), { error: 'outside path prefix /aquarel-atelier/' });
  for (const url of ['https://x.be', 'mailto:a@b.c', 'tel:+32', '#main', '//cdn.example.com/x.js']) {
    assert.deepEqual(resolveLink(url, '/'), { skip: true }, url);
  }
});

test('checkSite reports missing files and passes existing ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'links-'));
  await mkdir(join(dir, 'werk'));
  await writeFile(join(dir, 'werk', 'index.html'), '<a href="/">home</a>');
  await writeFile(join(dir, 'index.html'), '<a href="/werk/">werk</a><img src="/img/missing.webp">');
  assert.deepEqual(await checkSite(dir, '/'), ['index.html: /img/missing.webp (missing)']);
});
