// Downloads the content snapshot from Google: Sheet tabs → .cache/raw.json, photos → .cache/originals/.
// Needs GOOGLE_SERVICE_ACCOUNT_KEY (service-account JSON) and google.folderId + google.sheetId in site.config.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GoogleAuth } from 'google-auth-library';
import { originalName, prune } from './images.mjs';
import { isImageFile } from './lib/works.mjs';

const TABS = { werken: 'Werken', tentoonstellingen: 'Tentoonstellingen', teksten: 'Teksten' };
const FOLDERS = { werken: 'Werken', tentoonstellingen: 'Tentoonstellingen' };
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ORIGINALS = '.cache/originals';
const MANIFEST = '.cache/originals.json';

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Sheet tab titles → { werken, tentoonstellingen, teksten } with the actual title, or null when missing. */
export function matchTabs(titles) {
  return Object.fromEntries(Object.entries(TABS).map(([key, name]) => [key, titles.find((t) => sameName(t, name)) ?? null]));
}

/** The subfolder called `name` among Drive children, or null. */
export function findFolder(children, name) {
  return children.find((f) => f.mimeType === FOLDER_MIME && sameName(f.name, name)) ?? null;
}

async function main() {
  const config = JSON.parse(await readFile('site.config.json', 'utf8'));
  const { folderId, sheetId } = config.google ?? {};
  if (!folderId || !sheetId) throw new Error('Fill in google.folderId and google.sheetId in site.config.json');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');

  const auth = new GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const request = async (url) => {
    const { token } = await client.getAccessToken();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google API ${response.status} for ${url.split('?')[0]}: ${await response.text()}`);
    return response;
  };
  const json = async (url) => (await request(url)).json();

  const listChildren = async (parentId) => {
    const files = [];
    let pageToken;
    do {
      const params = new URLSearchParams({
        q: `'${parentId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime)',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await json(`https://www.googleapis.com/drive/v3/files?${params}`);
      files.push(...data.files);
      pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
  };

  // Folders
  const children = await listChildren(folderId);
  const folders = {};
  for (const [key, name] of Object.entries(FOLDERS)) {
    const folder = findFolder(children, name);
    if (!folder) console.warn(`Map "${name}" niet gevonden in de websitemap; die wordt als leeg beschouwd.`);
    folders[key] = folder ? (await listChildren(folder.id)).filter((f) => f.mimeType !== FOLDER_MIME) : [];
  }

  // Sheet tabs
  const spreadsheet = await json(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`);
  const tabs = matchTabs(spreadsheet.sheets.map((s) => s.properties.title));
  const sheets = { werken: [], tentoonstellingen: [], teksten: [] };
  const present = Object.entries(tabs).filter(([, title]) => title);
  for (const [key, title] of Object.entries(tabs)) if (!title) console.warn(`Tabblad "${TABS[key]}" niet gevonden in de Sheet.`);
  if (present.length) {
    const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
    for (const [, title] of present) params.append('ranges', `'${title.replaceAll("'", "''")}'`);
    const data = await json(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params}`);
    present.forEach(([key], i) => {
      sheets[key] = data.valueRanges[i].values ?? [];
    });
  }

  // Photos: download new or changed originals only
  await mkdir(ORIGINALS, { recursive: true });
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {}
  const photos = [...folders.werken, ...folders.tentoonstellingen].filter(isImageFile);
  let downloaded = 0;
  for (const photo of photos) {
    const target = join(ORIGINALS, originalName(photo.id, photo.name));
    if (manifest[photo.id] === photo.modifiedTime && existsSync(target)) continue;
    const response = await request(`https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media&supportsAllDrives=true`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
    manifest[photo.id] = photo.modifiedTime;
    downloaded++;
  }
  const keep = new Set(photos.map((p) => p.id));
  await prune(ORIGINALS, keep);
  manifest = Object.fromEntries(Object.entries(manifest).filter(([id]) => keep.has(id)));
  await writeFile(MANIFEST, JSON.stringify(manifest));

  await writeFile('.cache/raw.json', JSON.stringify({ fetchedAt: new Date().toISOString(), sheets, folders }, null, 2));
  console.log(`Opgehaald: ${folders.werken.length} bestanden in Werken, ${folders.tentoonstellingen.length} in Tentoonstellingen; ${downloaded} foto's gedownload.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
