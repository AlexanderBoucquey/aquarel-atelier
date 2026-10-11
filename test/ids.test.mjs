import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assignIds, readRegistry, writeRegistry, shortId } from '../scripts/ids.mjs';

const sequence = (...uuids) => {
  let i = 0;
  return () => uuids[i++];
};

test('assigns a UUID to each new file and records the date, not the file name', () => {
  const { entries, added } = assignIds([], [{ id: 'd1', name: 'haven.jpg' }], {
    today: '2026-10-11',
    randomUUID: sequence('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  });
  assert.equal(added.length, 1);
  assert.deepEqual(entries, [{ uuid: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', driveId: 'd1', firstSeen: '2026-10-11' }]);
});

test('existing entries are never changed, even when the file was renamed', () => {
  const existing = [{ uuid: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', driveId: 'd1', firstSeen: '2026-01-01' }];
  const { entries, added } = assignIds(existing, [{ id: 'd1', name: 'nieuw.jpg' }, { id: 'd1', name: 'nieuw.jpg' }], {
    today: '2026-10-11',
    randomUUID: () => {
      throw new Error('must not generate an ID for a known file');
    },
  });
  assert.deepEqual(entries, existing);
  assert.deepEqual(added, []);
});

test('regenerates when the 8-character short id collides with an existing one', () => {
  const existing = [{ uuid: '3f2a9c1e-0000-4000-8000-000000000000', driveId: 'd1', firstSeen: '' }];
  const { added } = assignIds(existing, [{ id: 'd2', name: 'b.jpg' }], {
    today: '2026-10-11',
    randomUUID: sequence('3f2a9c1e-ffff-4fff-8fff-ffffffffffff', '7b07d4aa-0000-4000-8000-000000000000'),
  });
  assert.equal(shortId(added[0].uuid), '7b07d4aa');
});

test('also avoids collisions between files added in the same run', () => {
  const { added } = assignIds([], [{ id: 'd1', name: 'a.jpg' }, { id: 'd2', name: 'b.jpg' }], {
    today: '2026-10-11',
    randomUUID: sequence('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003'),
  });
  assert.deepEqual(added.map((e) => shortId(e.uuid)), ['aaaaaaaa', 'bbbbbbbb']);
});

test('registry survives a write/read round trip and stores no file names (the repo is public)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ids-'));
  const path = join(dir, 'content', 'ids.csv');
  const entries = [{ uuid: 'u1', driveId: 'd1', firstSeen: '2026-10-11' }];
  await writeRegistry(path, entries);
  assert.deepEqual(await readRegistry(path), entries);
  assert.equal(await readFile(path, 'utf8'), 'uuid,drive_id,first_seen\nu1,d1,2026-10-11\n');
});

test('a missing registry file reads as empty', async () => {
  assert.deepEqual(await readRegistry(join(tmpdir(), 'does-not-exist', 'ids.csv')), []);
});

test('reads an older registry that still has a file_name column', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ids-'));
  const path = join(dir, 'ids.csv');
  await writeFile(path, 'uuid,drive_id,file_name,first_seen\nu1,d1,a.jpg,2026-10-11\n');
  assert.deepEqual(await readRegistry(path), [{ uuid: 'u1', driveId: 'd1', firstSeen: '2026-10-11' }]);
});
