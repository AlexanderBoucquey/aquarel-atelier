import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchTabs, findFolder, structureProblems, downloadPhotos } from '../scripts/fetch.mjs';

test('matchTabs finds tabs regardless of case and spaces, null when missing', () => {
  assert.deepEqual(matchTabs(['werken ', 'TENTOONSTELLINGEN', 'Blad1']), { werken: 'werken ', tentoonstellingen: 'TENTOONSTELLINGEN', teksten: null });
});

test('findFolder only matches folders', () => {
  const children = [
    { id: 'p1', name: 'Werken', mimeType: 'image/jpeg' },
    { id: 'f1', name: ' werken', mimeType: 'application/vnd.google-apps.folder' },
  ];
  assert.equal(findFolder(children, 'Werken').id, 'f1');
  assert.equal(findFolder(children, 'Tentoonstellingen'), null);
});

const folder = (name) => ({ id: name, name, mimeType: 'application/vnd.google-apps.folder' });
const failing = (status) => async () => {
  const err = new Error(`HTTP ${status}`);
  err.status = status;
  throw err;
};

test('structureProblems: a missing Werken tab or folder stops the build', () => {
  assert.deepEqual(structureProblems(matchTabs(['Werken', 'Teksten']), [folder('Werken')]), []);
  const problems = structureProblems(matchTabs(['Tentoonstellingen']), [folder('Tentoonstellingen')]);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Tabblad "Werken"/);
  assert.match(problems[1], /Map "Werken"/);
});

test('downloadPhotos downloads new or changed photos and skips files Google refuses (4xx) with a warning', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dl-'));
  await writeFile(join(dir, 'same.jpg'), 'old');
  const calls = [];
  const download = async (photo, target) => {
    calls.push(photo.id);
    if (photo.id === 'short') return failing(403)();
    await writeFile(target, 'new');
  };
  const photos = [
    { id: 'same', name: 'a.jpg', modifiedTime: 't1' },
    { id: 'new', name: 'b.JPG', modifiedTime: 't2' },
    { id: 'short', name: 'c.jpg', modifiedTime: 't3' },
  ];
  const result = await downloadPhotos(photos, { dir, manifest: { same: 't1', gone: 't0' }, download });
  assert.deepEqual(calls, ['new', 'short']);
  assert.deepEqual(result.manifest, { same: 't1', new: 't2' });
  assert.equal(result.downloaded, 1);
  assert.equal(await readFile(join(dir, 'new.jpg'), 'utf8'), 'new');
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /"c\.jpg" kon niet gedownload worden \(403\)/);
});

test('downloadPhotos lets server and network errors fail the build', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dl-'));
  const photos = [{ id: 'x', name: 'x.jpg', modifiedTime: 't' }];
  await assert.rejects(downloadPhotos(photos, { dir, manifest: {}, download: failing(500) }), /HTTP 500/);
  await assert.rejects(downloadPhotos(photos, { dir, manifest: {}, download: async () => { throw new Error('ECONNRESET'); } }), /ECONNRESET/);
});
