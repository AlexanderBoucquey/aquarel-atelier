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
import { isPdfFile } from './lib/exhibitions.mjs';

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

/**
 * Problems that must stop the build: without the Werken tab every photo would be published (hidden ones too),
 * without the Werken folder the gallery would be empty. The previous version of the site then stays online.
 */
export function structureProblems(tabs, children) {
  const problems = [];
  if (!tabs.werken) problems.push('Tabblad "Werken" niet gevonden in de Sheet (hernoemd of verwijderd?).');
  if (!findFolder(children, FOLDERS.werken)) problems.push('Map "Werken" niet gevonden in de websitemap (hernoemd of verwijderd?).');
  return problems;
}

/** Drive files to download: photos from both folders, plus the PDFs that exhibitions can link to. */
export function downloadList(folders) {
  return [...folders.werken.filter(isImageFile), ...folders.tentoonstellingen.filter((f) => isImageFile(f) || isPdfFile(f))];
}

/**
 * Download new or changed photos. A file Google refuses to hand out (4xx, e.g. a shortcut) is skipped with a
 * warning; server and network errors fail the build.
 * @param {(photo, target: string) => Promise<void>} download
 * @returns {Promise<{ manifest: Record<string, string>, warnings: string[], downloaded: number }>}
 */
export async function downloadPhotos(photos, { dir, manifest, download }) {
  const next = {};
  const warnings = [];
  let downloaded = 0;
  for (const photo of photos) {
    const target = join(dir, originalName(photo.id, photo.name));
    if (manifest[photo.id] === photo.modifiedTime && existsSync(target)) {
      next[photo.id] = photo.modifiedTime;
      continue;
    }
    try {
      await download(photo, target);
    } catch (err) {
      if (err.status >= 400 && err.status < 500) {
        warnings.push(`Foto "${photo.name}" kon niet gedownload worden (${err.status}); ze wordt overgeslagen.`);
        continue;
      }
      throw err;
    }
    next[photo.id] = photo.modifiedTime;
    downloaded++;
  }
  return { manifest: next, warnings, downloaded };
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
    if (!response.ok) {
      const err = new Error(`Google API ${response.status} for ${url.split('?')[0]}: ${await response.text()}`);
      err.status = response.status;
      throw err;
    }
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

  const warnings = [];
  const children = await listChildren(folderId);
  const spreadsheet = await json(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`);
  const tabs = matchTabs(spreadsheet.sheets.map((s) => s.properties.title));
  const problems = structureProblems(tabs, children);
  if (problems.length) throw new Error(`${problems.join('\n')}\nDe website wordt niet bijgewerkt tot dit hersteld is; de vorige versie blijft online.`);

  // Folders
  const folders = {};
  for (const [key, name] of Object.entries(FOLDERS)) {
    const folder = findFolder(children, name);
    if (!folder) warnings.push(`Map "${name}" niet gevonden in de websitemap; die wordt als leeg beschouwd.`);
    folders[key] = folder ? (await listChildren(folder.id)).filter((f) => f.mimeType !== FOLDER_MIME) : [];
  }

  // Sheet tabs
  const sheets = { werken: [], tentoonstellingen: [], teksten: [] };
  for (const [key, title] of Object.entries(tabs)) if (!title) warnings.push(`Tabblad "${TABS[key]}" niet gevonden in de Sheet.`);
  const present = Object.entries(tabs).filter(([, title]) => title);
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
  for (const [, title] of present) params.append('ranges', `'${title.replaceAll("'", "''")}'`);
  const data = await json(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params}`);
  present.forEach(([key], i) => {
    sheets[key] = data.valueRanges[i].values ?? [];
  });

  // Photos and PDFs: download new or changed originals only
  await mkdir(ORIGINALS, { recursive: true });
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {}
  const photos = downloadList(folders);
  const download = async (photo, target) => {
    const response = await request(`https://www.googleapis.com/drive/v3/files/${photo.id}?alt=media&supportsAllDrives=true`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  };
  const result = await downloadPhotos(photos, { dir: ORIGINALS, manifest, download });
  warnings.push(...result.warnings);
  await prune(ORIGINALS, new Set(photos.map((p) => p.id)));
  await writeFile(MANIFEST, JSON.stringify(result.manifest));

  await writeFile('.cache/raw.json', JSON.stringify({ fetchedAt: new Date().toISOString(), warnings, sheets, folders }, null, 2));
  console.log(`Opgehaald: ${folders.werken.length} bestanden in Werken, ${folders.tentoonstellingen.length} in Tentoonstellingen; ${result.downloaded} foto's gedownload.`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
