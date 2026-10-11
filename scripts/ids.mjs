// Registry of our own work IDs: one UUID v4 per Drive photo, stored in content/ids.csv. Append-only: entries are
// never edited, deleted or reused, so a work's URL never changes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID as cryptoRandomUUID } from 'node:crypto';
import { parseCsv, stringifyCsv } from './lib/csv.mjs';

const HEADER = ['uuid', 'drive_id', 'file_name', 'first_seen'];

/** The part of the UUID used in URLs: /werk/<shortId>/ */
export function shortId(uuid) {
  return uuid.slice(0, 8);
}

/**
 * Give every file without an entry a fresh UUID whose short id is unique.
 * @returns {{ entries: object[], added: object[] }}  entries = existing (unchanged) + added
 */
export function assignIds(entries, files, { today, randomUUID = cryptoRandomUUID }) {
  const known = new Set(entries.map((e) => e.driveId));
  const shortIds = new Set(entries.map((e) => shortId(e.uuid)));
  const added = [];
  for (const file of files) {
    if (known.has(file.id)) continue;
    let uuid = randomUUID();
    while (shortIds.has(shortId(uuid))) uuid = randomUUID();
    known.add(file.id);
    shortIds.add(shortId(uuid));
    added.push({ uuid, driveId: file.id, fileName: file.name, firstSeen: today });
  }
  return { entries: [...entries, ...added], added };
}

export async function readRegistry(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const [header = [], ...rows] = parseCsv(text);
  const col = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  return rows
    .filter((r) => r[col.uuid] && r[col.drive_id])
    .map((r) => ({ uuid: r[col.uuid], driveId: r[col.drive_id], fileName: r[col.file_name] ?? '', firstSeen: r[col.first_seen] ?? '' }));
}

export async function writeRegistry(path, entries) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringifyCsv([HEADER, ...entries.map((e) => [e.uuid, e.driveId, e.fileName, e.firstSeen])]));
}
