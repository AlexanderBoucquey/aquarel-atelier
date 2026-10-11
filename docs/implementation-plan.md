# Aquarel-atelier Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bilingual (NL/EN) static portfolio site for Dirk Vermoesen whose works, exhibitions and texts come from a
Google Drive folder + Google Sheet that Dirk maintains himself.

**Architecture:** A GitHub Action fetches the Sheet and photos from Google (`scripts/fetch.mjs`), turns them into
site content and WebP images (`scripts/build-data.mjs`, pure logic in `scripts/lib/*` + `scripts/content.mjs`),
builds plain HTML with Eleventy and deploys to GitHub Pages. Work IDs come from an append-only registry
(`content/ids.csv`) committed by CI. Local development and CI sanity builds use committed sample content in
`fixtures/`.

**Tech Stack:** Node ≥ 22 (CI: 24), ESM · Eleventy 3 + Nunjucks · sharp (images) · google-auth-library (Google
auth; REST via `fetch`) · `node:test` · plain CSS/JS · self-hosted fonts via @fontsource · GitHub Actions + Pages ·
Google Apps Script (Sheet menu).

**Spec:** `docs/design.md`

**Code blocks marked `file=<path>` are the complete content of that file.**

## Global Constraints

- Node ≥ 22, `"type": "module"`; no TypeScript, no bundler, no front-end framework.
- Dutch at the root, English under `/en/`; empty English text falls back to Dutch.
- Every Sheet column is optional, including the title. A photo in `Werken/` is published unless its row has *Tonen* unticked; a photo without any row is published too (image only).
- Work URL id = first 8 characters of a UUID v4 from `content/ids.csv`; the registry is append-only and only CI (or fixtures mode) writes it.
- Images: WebP at 480/960/1600 px wide (never upscaled) + 1200×630 `og.jpg`; all metadata stripped; only images of published works/exhibitions are deployed.
- No cookies, no tracking, no embedded Google Maps, no Google Fonts CDN; fonts are self-hosted.
- Calm, never pushy: no pop-ups, modals, newsletter prompts, "NEW!" labels or auto-playing slideshows; at most one announced event.
- Content problems never fail the build (warning in Dutch in the run summary); technical problems do (nothing deployed, previous version stays live).
- All internal URLs are written root-relative (`/werk/`) and rewritten for the path prefix by Eleventy's `HtmlBasePlugin`; the site must work under `/aquarel-atelier/` (github.io) and `/` (custom domain).
- Light theme only.

## Review Focus

1. **A photo Dirk deletes or hides must disappear from the live site** — no stale files under `/img/`. Pinned in Task 6 (`assembleSiteImages` removes unlisted images) and Task 7 (`imageList` excludes hidden works).
2. **A hand-edited Sheet** (columns renamed in other case/spacing, reordered, extra columns, missing tabs) must not crash or misread. Pinned in Task 3 (`sheetToRecords`) and Task 7 (empty/missing tabs).
3. **Dates typed as text in Belgian notation** (12/11/2026, 12-11-2026, 12.11.2026) or nonsense must parse or warn, never crash. Pinned in Task 3 (`date`) and Task 5 (row skipped with warning).
4. **Non-image or broken files in `Werken/`** (PDF, video, corrupt JPEG) must be skipped with a warning while the site still builds. Pinned in Task 4 (PDF) and Task 6 (corrupt file). HEIC conversion only runs in CI → covered by the manual acceptance in Task 12.
5. **Sheet text with HTML characters or script links** (`&`, `<`, `javascript:`) must show as plain text, escaped exactly once, and never become a link. Pinned in Task 3 (`link`), Task 8 (`paragraphs`, site test "Zee &amp; duinen").

## Deviations from the spec (decided while planning)

- Pure logic is split into small files under `scripts/lib/` instead of one `scripts/content.mjs`.
- Local runs with real Google data read `content/ids.csv` but never write it; only CI persists new IDs. This prevents a local run from inventing IDs that differ from CI's.
- Favicon is a "DV" monogram: the drawn portrait is unreadable at 16–32 px. The portrait is used on the About page.
- Undated exhibition rows are shown under the heading *Doorlopend / Ongoing*, after the past ones.
- The gallery uses justified rows (equal height per row, width by aspect ratio) instead of a fixed 1→4 column
  grid: it keeps every work uncropped *and* keeps Dirk's row order left-to-right; one per row below 480 px.

## File Structure

```
package.json, .gitignore, site.config.json
content/ids.csv                    uuid ↔ Drive ID registry (CI appends)
scripts/lib/csv.mjs                CSV parse/stringify
scripts/lib/cells.mjs              Sheet cells → records, booleans, dates, links
scripts/lib/works.mjs              photos + Werken rows → works
scripts/lib/exhibitions.mjs        Tentoonstellingen rows → upcoming/past/other + banner
scripts/lib/texts.mjs              Teksten rows → texts
scripts/ids.mjs                    ID registry
scripts/content.mjs                compose content, image list, finalize
scripts/images.mjs                 sharp: WebP variants, og.jpg, cache, publish set
scripts/build-data.mjs             CLI: raw snapshot → .cache/content.json + .cache/site-img/
scripts/fetch.mjs                  CLI: Google → .cache/raw.json + .cache/originals/
scripts/check-links.mjs            CLI: internal link check of _site
fixtures/                          sample raw.json, ids.csv, originals/*.jpg, make-images.mjs
eleventy.config.js
src/_lib/routes.js, filters.js     URLs per language, template filters
src/_data/                         site.js, langs.js, atelier.js, i18n/nl.json, i18n/en.json
src/_includes/                     base.njk, header.njk, footer.njk, banner.njk, macros.njk
src/pages/                         home, work, work-detail, exhibitions, about, contact, 404, sitemap, robots
src/assets/                        css/style.css, js/site.js, favicon.svg, img/portrait.webp
apps-script/Code.gs                Sheet menu
.github/workflows/build.yml
docs/setup.md, docs/handleiding-dirk.md, README.md
test/*.test.mjs
```

---

### Task 1: Project scaffold + CSV helpers

**Files:**
- Create: `package.json`, `.gitignore`, `site.config.json`, `content/ids.csv`, `scripts/lib/csv.mjs`
- Test: `test/csv.test.mjs`

**Interfaces:**
- Produces: `parseCsv(text: string): string[][]`, `stringifyCsv(rows: unknown[][]): string` (ends with `\n`, quotes fields containing `"`, `,`, CR or LF).

- [ ] **Step 1: Create the scaffold files**

```json file=package.json
{
  "name": "aquarel-atelier",
  "version": "1.0.0",
  "private": true,
  "description": "Website Dirk Vermoesen — Aquarel · Tekening · Olieverf",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "node --test \"test/**/*.test.mjs\"",
    "fetch": "node scripts/fetch.mjs",
    "data:fixtures": "node scripts/build-data.mjs --source=fixtures",
    "data:google": "node scripts/build-data.mjs --source=.cache",
    "build": "eleventy",
    "dev": "npm run data:fixtures && eleventy --serve",
    "check-links": "node scripts/check-links.mjs"
  },
  "dependencies": {
    "@11ty/eleventy": "^3.1.6",
    "@fontsource/cormorant-garamond": "^5.3.0",
    "@fontsource/source-sans-3": "^5.3.1",
    "google-auth-library": "^11.2.0",
    "sharp": "^0.35.5"
  }
}
```

```text file=.gitignore
node_modules/
_site/
.cache/
.idea/
*.iml
.env
*-key.json
```

```json file=site.config.json
{
  "baseUrl": "https://alexanderboucquey.github.io",
  "pathPrefix": "/aquarel-atelier/",
  "google": {
    "folderId": "",
    "sheetId": ""
  }
}
```

```csv file=content/ids.csv
uuid,drive_id,file_name,first_seen
```

Run: `npm install`
Expected: `node_modules/` and `package-lock.json` created, no errors.

- [ ] **Step 2: Write the failing test**

```js file=test/csv.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, stringifyCsv } from '../scripts/lib/csv.mjs';

test('parses rows', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('handles quotes, commas, embedded newlines and CRLF', () => {
  const text = 'name,note\r\n"Haven, Antwerpen","zei ""hallo""\nen ging"\r\n';
  assert.deepEqual(parseCsv(text), [['name', 'note'], ['Haven, Antwerpen', 'zei "hallo"\nen ging']]);
});

test('empty input gives no rows', () => {
  assert.deepEqual(parseCsv(''), []);
});

test('stringify round-trips tricky values', () => {
  const rows = [['uuid', 'file_name'], ['abc', 'IMG 1, "best".jpg'], ['def', '']];
  assert.deepEqual(parseCsv(stringifyCsv(rows)), rows);
  assert.ok(stringifyCsv(rows).endsWith('\n'));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/lib/csv.mjs'`

- [ ] **Step 4: Implement**

```js file=scripts/lib/csv.mjs
// Minimal RFC 4180 CSV: quoted fields with commas, quotes ("") and newlines; LF or CRLF line endings.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function stringifyCsv(rows) {
  return `${rows.map((row) => row.map(quote).join(',')).join('\n')}\n`;
}

function quote(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore site.config.json content/ids.csv scripts/lib/csv.mjs test/csv.test.mjs
git commit -m "chore: scaffold project with CSV helpers"
```

---

### Task 2: ID registry

**Files:**
- Create: `scripts/ids.mjs`
- Test: `test/ids.test.mjs`

**Interfaces:**
- Consumes: `parseCsv`, `stringifyCsv` (Task 1).
- Produces:
  - `type RegistryEntry = { uuid: string, driveId: string, fileName: string, firstSeen: string }`
  - `shortId(uuid: string): string` — first 8 chars
  - `assignIds(entries: RegistryEntry[], files: {id, name}[], { today: string, randomUUID?: () => string }): { entries: RegistryEntry[], added: RegistryEntry[] }`
  - `readRegistry(path): Promise<RegistryEntry[]>` (missing file → `[]`), `writeRegistry(path, entries): Promise<void>`

- [ ] **Step 1: Write the failing test**

```js file=test/ids.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assignIds, readRegistry, writeRegistry, shortId } from '../scripts/ids.mjs';

const sequence = (...uuids) => {
  let i = 0;
  return () => uuids[i++];
};

test('assigns a UUID to each new file and records name and date', () => {
  const { entries, added } = assignIds([], [{ id: 'd1', name: 'haven.jpg' }], {
    today: '2026-10-11',
    randomUUID: sequence('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  });
  assert.equal(added.length, 1);
  assert.deepEqual(entries, [{ uuid: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', driveId: 'd1', fileName: 'haven.jpg', firstSeen: '2026-10-11' }]);
});

test('existing entries are never changed, even when the file was renamed', () => {
  const existing = [{ uuid: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', driveId: 'd1', fileName: 'oud.jpg', firstSeen: '2026-01-01' }];
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
  const existing = [{ uuid: '3f2a9c1e-0000-4000-8000-000000000000', driveId: 'd1', fileName: 'a.jpg', firstSeen: '' }];
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

test('registry survives a write/read round trip, including commas in file names', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ids-'));
  const path = join(dir, 'content', 'ids.csv');
  const entries = [{ uuid: 'u1', driveId: 'd1', fileName: 'Haven, avond.jpg', firstSeen: '2026-10-11' }];
  await writeRegistry(path, entries);
  assert.deepEqual(await readRegistry(path), entries);
  assert.match(await readFile(path, 'utf8'), /^uuid,drive_id,file_name,first_seen\n/);
});

test('a missing registry file reads as empty', async () => {
  assert.deepEqual(await readRegistry(join(tmpdir(), 'does-not-exist', 'ids.csv')), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/ids.mjs'`

- [ ] **Step 3: Implement**

```js file=scripts/ids.mjs
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/ids.mjs test/ids.test.mjs
git commit -m "feat: add append-only work ID registry"
```

---

### Task 3: Sheet cell helpers

**Files:**
- Create: `scripts/lib/cells.mjs`
- Test: `test/cells.test.mjs`

**Interfaces:**
- Produces:
  - `sheetToRecords(rows?: unknown[][]): object[]` — keys = header lower-cased, trimmed, inner spaces collapsed; each record has `rowNumber` (sheet row, header = 1)
  - `text(value): string` (trimmed, `''` for null)
  - `bool(value, fallback: boolean): boolean`
  - `date(value): { value: string|null, error: boolean }` — `YYYY-MM-DD`
  - `link(value): string|null` — absolute http(s) URL

- [ ] **Step 1: Write the failing test**

```js file=test/cells.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetToRecords, text, bool, date, link } from '../scripts/lib/cells.mjs';

test('sheetToRecords maps by header name: case, spaces and column order do not matter', () => {
  const rows = [[' Titel  NL ', 'BESTAND', 'Tonen', 'Eigen kolom'], ['Haven', 'haven.jpg', true, 'x'], ['Bos']];
  assert.deepEqual(sheetToRecords(rows), [
    { rowNumber: 2, 'titel nl': 'Haven', bestand: 'haven.jpg', tonen: true, 'eigen kolom': 'x' },
    { rowNumber: 3, 'titel nl': 'Bos', bestand: undefined, tonen: undefined, 'eigen kolom': undefined },
  ]);
});

test('sheetToRecords on an empty or missing tab', () => {
  assert.deepEqual(sheetToRecords([]), []);
  assert.deepEqual(sheetToRecords(undefined), []);
});

test('text trims and turns numbers into strings', () => {
  assert.equal(text('  Haven '), 'Haven');
  assert.equal(text(2024), '2024');
  assert.equal(text(null), '');
});

test('bool reads checkboxes and typed words, falls back when empty or unknown', () => {
  assert.equal(bool(true, false), true);
  assert.equal(bool(false, true), false);
  assert.equal(bool('TRUE', false), true);
  assert.equal(bool('nee', true), false);
  assert.equal(bool('x', false), true);
  assert.equal(bool('', true), true);
  assert.equal(bool(undefined, false), false);
  assert.equal(bool('misschien', true), true);
});

test('date converts Google Sheets serial numbers', () => {
  assert.deepEqual(date(46338), { value: '2026-11-12', error: false });
});

test('date parses Belgian day/month/year text and ISO dates', () => {
  for (const typed of ['12/11/2026', '12-11-2026', '12.11.2026', '2026-11-12', ' 12/11/2026 ']) {
    assert.deepEqual(date(typed), { value: '2026-11-12', error: false }, typed);
  }
  assert.deepEqual(date('1/2/2027'), { value: '2027-02-01', error: false });
});

test('date flags text that is not a date and impossible dates; empty is fine', () => {
  assert.deepEqual(date('volgende week'), { value: null, error: true });
  assert.deepEqual(date('31/02/2026'), { value: null, error: true });
  assert.deepEqual(date(''), { value: null, error: false });
  assert.deepEqual(date(undefined), { value: null, error: false });
});

test('link accepts http(s) and www., rejects anything else', () => {
  assert.equal(link('www.cc-brasschaat.be/expo'), 'https://www.cc-brasschaat.be/expo');
  assert.equal(link('https://example.be'), 'https://example.be/');
  assert.equal(link('javascript:alert(1)'), null);
  assert.equal(link('gewoon tekst'), null);
  assert.equal(link(''), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/lib/cells.mjs'`

- [ ] **Step 3: Implement**

```js file=scripts/lib/cells.mjs
// Raw Google Sheets values (valueRenderOption UNFORMATTED_VALUE, dates as serial numbers) → clean JS values.

/** Sheet rows (first row = headers) → records keyed by normalized header, plus rowNumber as shown in Sheets. */
export function sheetToRecords(rows = []) {
  const [header = [], ...body] = rows;
  const keys = header.map((h) => text(h).toLowerCase().replace(/\s+/g, ' '));
  return body.map((cells, index) => {
    const record = { rowNumber: index + 2 };
    keys.forEach((key, i) => {
      if (key) record[key] = cells[i];
    });
    return record;
  });
}

export function text(value) {
  return value == null ? '' : String(value).trim();
}

const TRUE_WORDS = new Set(['true', 'waar', 'ja', 'yes', 'x', 'v', '1']);
const FALSE_WORDS = new Set(['false', 'onwaar', 'nee', 'no', '0']);

/** Checkbox (or typed yes/no) → boolean; empty or unrecognised → fallback. */
export function bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  const word = text(value).toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return fallback;
}

const SHEETS_EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86_400_000;

/**
 * Date cell → { value: 'YYYY-MM-DD' | null, error }. Accepts Sheets serial numbers, d/m/yyyy (also with - or .)
 * and yyyy-mm-dd. error = the cell has content that is not a valid date.
 */
export function date(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value: new Date(SHEETS_EPOCH + Math.floor(value) * DAY).toISOString().slice(0, 10), error: false };
  }
  const typed = text(value);
  if (!typed) return { value: null, error: false };
  let m = typed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = typed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  return { value: null, error: true };
}

function ymd(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const valid = d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  return valid ? { value: d.toISOString().slice(0, 10), error: false } : { value: null, error: true };
}

/** Typed link → absolute http(s) URL or null. "www.x.be" becomes "https://www.x.be/". */
export function link(value) {
  let typed = text(value);
  if (!typed) return null;
  if (/^www\./i.test(typed)) typed = `https://${typed}`;
  try {
    const url = new URL(typed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/cells.mjs test/cells.test.mjs
git commit -m "feat: parse Google Sheets cells into records, booleans, dates and links"
```

---

### Task 4: Works (photos + Werken tab)

**Files:**
- Create: `scripts/lib/works.mjs`
- Test: `test/works.test.mjs`

**Interfaces:**
- Consumes: `text`, `bool`, `sheetToRecords` (Task 3), `shortId` (Task 2).
- Produces:
  - `isImageFile(file: {name, mimeType?}): boolean`
  - `technique(value): { key: string, label: { nl, en } } | null`; `TECHNIQUE_ORDER: string[]`
  - `buildWorks(records, files, uuidByDriveId: Map<string,string>): { works: Work[], warnings: string[] }`
  - `type Work = { id, uuid, title: {nl,en}, technique, year, size, description: {nl,en}, meta: {nl,en}, alt: {nl,en}, featured: boolean, image: { driveId, fileName, version, dir: 'w/<id>' } }`

- [ ] **Step 1: Write the failing test**

```js file=test/works.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorks, technique, isImageFile } from '../scripts/lib/works.mjs';
import { sheetToRecords } from '../scripts/lib/cells.mjs';

const HEADER = ['Bestand', 'ID', 'Titel NL', 'Titel EN', 'Techniek', 'Jaar', 'Afmetingen', 'Beschrijving NL', 'Beschrijving EN', 'Tonen', 'Uitgelicht'];
const row = (values) => HEADER.map((h) => values[h] ?? '');
const photo = (id, name, createdTime = '2026-01-01T00:00:00Z') => ({ id, name, mimeType: 'image/jpeg', createdTime, modifiedTime: '2026-01-02T00:00:00Z' });

function run(rows, files) {
  const uuids = new Map(files.map((f) => [f.id, `${f.id.padEnd(8, '0')}-0000-4000-8000-000000000000`]));
  return buildWorks(sheetToRecords([HEADER, ...rows.map(row)]), files, uuids);
}

test('a photo without any row is published as image only', () => {
  const { works, warnings } = run([], [photo('d1', 'IMG_0412.jpg')]);
  assert.equal(works.length, 1);
  assert.equal(works[0].id, 'd1000000');
  assert.deepEqual(works[0].title, { nl: '', en: '' });
  assert.deepEqual(works[0].alt, { nl: 'Werk van Dirk Vermoesen', en: 'Work by Dirk Vermoesen' });
  assert.deepEqual(works[0].image, { driveId: 'd1', fileName: 'IMG_0412.jpg', version: '2026-01-02T00:00:00Z', dir: 'w/d1000000' });
  assert.deepEqual(warnings, []);
});

test('rows match on ID first, else on file name (case-insensitive)', () => {
  const { works } = run(
    [{ Bestand: 'oude-naam.jpg', ID: 'd2', 'Titel NL': 'Berken' }, { Bestand: 'HAVEN.JPG', 'Titel NL': 'Haven' }],
    [photo('d1', 'haven.jpg'), photo('d2', 'nieuwe-naam.jpg')],
  );
  assert.deepEqual(works.map((w) => w.title.nl), ['Berken', 'Haven']);
});

test('a row whose ID is gone re-attaches to a re-uploaded photo with the same name', () => {
  const { works, warnings } = run([{ Bestand: 'haven.jpg', ID: 'oud-id', 'Titel NL': 'Haven' }], [photo('d9', 'haven.jpg')]);
  assert.equal(works[0].title.nl, 'Haven');
  assert.deepEqual(warnings, []);
});

test('Tonen unticked hides a work; an empty Tonen cell shows it', () => {
  const { works } = run(
    [{ ID: 'd1', 'Titel NL': 'Verborgen', Tonen: false }, { ID: 'd2', 'Titel NL': 'Zichtbaar', Tonen: '' }],
    [photo('d1', 'a.jpg'), photo('d2', 'b.jpg')],
  );
  assert.deepEqual(works.map((w) => w.title.nl), ['Zichtbaar']);
});

test('every field is optional and English falls back to Dutch', () => {
  const { works } = run([{ ID: 'd1', 'Titel NL': 'Haven', 'Beschrijving NL': 'Avondlicht.' }], [photo('d1', 'a.jpg')]);
  const [work] = works;
  assert.deepEqual(work.title, { nl: 'Haven', en: 'Haven' });
  assert.deepEqual(work.description, { nl: 'Avondlicht.', en: 'Avondlicht.' });
  assert.equal(work.technique, null);
  assert.equal(work.year, '');
  assert.deepEqual(work.meta, { nl: '', en: '' });
  assert.equal(work.featured, false);
});

test('meta line and alt text combine title, technique, year and size per language', () => {
  const { works } = run(
    [{ ID: 'd1', 'Titel NL': 'Haven', 'Titel EN': 'Harbour', Techniek: 'Aquarel', Jaar: 2024, Afmetingen: '36 x 48 cm', Uitgelicht: true }],
    [photo('d1', 'a.jpg')],
  );
  const [work] = works;
  assert.deepEqual(work.meta, { nl: 'Aquarel · 2024 · 36 x 48 cm', en: 'Watercolour · 2024 · 36 x 48 cm' });
  assert.deepEqual(work.alt, { nl: 'Haven, Aquarel, 2024', en: 'Harbour, Watercolour, 2024' });
  assert.equal(work.featured, true);
});

test('order: photos without a row first (newest first), then rows in sheet order', () => {
  const { works } = run(
    [{ ID: 'd3', 'Titel NL': 'Derde' }, { ID: 'd1', 'Titel NL': 'Eerste' }],
    [
      photo('d1', 'a.jpg', '2026-01-01T00:00:00Z'),
      photo('d2', 'b.jpg', '2026-03-01T00:00:00Z'),
      photo('d3', 'c.jpg'),
      photo('d4', 'd.jpg', '2026-05-01T00:00:00Z'),
    ],
  );
  assert.deepEqual(works.map((w) => w.image.driveId), ['d4', 'd2', 'd3', 'd1']);
});

test('problems become warnings, never crashes', () => {
  const { works, warnings } = run(
    [
      { Bestand: 'weg.jpg', 'Titel NL': 'Verdwenen' },
      { ID: 'd1', 'Titel NL': 'Eerste rij' },
      { Bestand: 'a.jpg', 'Titel NL': 'Dubbel' },
      { 'Titel NL': 'Zonder foto' },
    ],
    [photo('d1', 'a.jpg'), { id: 'p1', name: 'notities.pdf', mimeType: 'application/pdf' }],
  );
  assert.deepEqual(works.map((w) => w.title.nl), ['Eerste rij']);
  assert.equal(warnings.length, 4);
  assert.match(warnings[0], /"notities\.pdf" is geen foto/);
  assert.match(warnings[1], /rij 2: foto "weg\.jpg" niet gevonden/);
  assert.match(warnings[2], /rij 4: "a\.jpg" staat al in een rij hierboven/);
  assert.match(warnings[3], /rij 5: er is geen foto gekoppeld/);
});

test('fully empty rows (only checkboxes) are skipped silently', () => {
  const { works, warnings } = run([{ Tonen: false, Uitgelicht: false }, {}], [photo('d1', 'a.jpg')]);
  assert.equal(works.length, 1);
  assert.deepEqual(warnings, []);
});

test('technique: known names in either language, unknown kept as typed', () => {
  assert.deepEqual(technique('Aquarel'), { key: 'aquarel', label: { nl: 'Aquarel', en: 'Watercolour' } });
  assert.equal(technique(' watercolor ').key, 'aquarel');
  assert.equal(technique('OLIEVERF').label.en, 'Oil painting');
  assert.deepEqual(technique('Gemengde techniek'), { key: 'gemengde-techniek', label: { nl: 'Gemengde techniek', en: 'Gemengde techniek' } });
  assert.equal(technique(''), null);
});

test('isImageFile accepts image mime types and known extensions such as HEIC', () => {
  assert.equal(isImageFile({ name: 'a.jpg', mimeType: 'image/jpeg' }), true);
  assert.equal(isImageFile({ name: 'IMG_1.HEIC', mimeType: 'application/octet-stream' }), true);
  assert.equal(isImageFile({ name: 'film.mov', mimeType: 'video/quicktime' }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/lib/works.mjs'`

- [ ] **Step 3: Implement**

```js file=scripts/lib/works.mjs
import { text, bool } from './cells.mjs';
import { shortId } from '../ids.mjs';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|tiff?|avif|gif)$/i;

/** Can this Drive file be shown as a picture? */
export function isImageFile(file) {
  return (file.mimeType ?? '').startsWith('image/') || IMAGE_EXTENSIONS.test(file.name ?? '');
}

const KNOWN_TECHNIQUES = [
  { key: 'aquarel', label: { nl: 'Aquarel', en: 'Watercolour' }, aliases: ['aquarel', 'watercolour', 'watercolor', 'waterverf'] },
  { key: 'tekening', label: { nl: 'Tekening', en: 'Drawing' }, aliases: ['tekening', 'drawing'] },
  { key: 'olieverf', label: { nl: 'Olieverf', en: 'Oil painting' }, aliases: ['olieverf', 'olie', 'oil', 'oil painting', 'oilpainting'] },
];

export const TECHNIQUE_ORDER = KNOWN_TECHNIQUES.map((t) => t.key);

/** Techniek cell → { key, label: { nl, en } } or null. Unknown techniques are kept as typed, in both languages. */
export function technique(value) {
  const typed = text(value);
  if (!typed) return null;
  const known = KNOWN_TECHNIQUES.find((t) => t.aliases.includes(typed.toLowerCase()));
  if (known) return { key: known.key, label: known.label };
  return { key: slugify(typed), label: { nl: typed, en: typed } };
}

function slugify(value) {
  const slug = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'overig';
}

const UNTITLED = { nl: 'Werk van Dirk Vermoesen', en: 'Work by Dirk Vermoesen' };
const TEXT_COLUMNS = ['titel nl', 'titel en', 'techniek', 'jaar', 'afmetingen', 'beschrijving nl', 'beschrijving en'];

/**
 * Join the photos in Werken/ with the rows of the Werken tab. Every column is optional: a photo without a row is
 * published as image only, and a row only hides its photo when Tonen is unticked. Rows match on the hidden ID
 * column, else on file name. Photos without a row come first (newest first), then rows in sheet order.
 */
export function buildWorks(records, files, uuidByDriveId) {
  const warnings = [];
  const photos = [];
  for (const file of files) {
    if (isImageFile(file)) photos.push(file);
    else warnings.push(`Werken: "${file.name}" is geen foto en wordt overgeslagen.`);
  }
  const byId = new Map(photos.map((f) => [f.id, f]));
  const byName = new Map();
  for (const f of photos) {
    const name = f.name.trim().toLowerCase();
    if (!byName.has(name)) byName.set(name, f);
  }

  const claimed = new Set();
  const listed = [];
  for (const row of records) {
    const id = text(row.id);
    const name = text(row.bestand);
    if (!id && !name) {
      if (TEXT_COLUMNS.some((column) => text(row[column]))) {
        warnings.push(`Werken, rij ${row.rowNumber}: er is geen foto gekoppeld (Bestand en ID zijn leeg).`);
      }
      continue;
    }
    const file = byId.get(id) ?? byName.get(name.toLowerCase());
    if (!file) {
      warnings.push(`Werken, rij ${row.rowNumber}: foto "${name || id}" niet gevonden in de map Werken.`);
      continue;
    }
    if (claimed.has(file.id)) {
      warnings.push(`Werken, rij ${row.rowNumber}: "${file.name}" staat al in een rij hierboven; deze rij wordt genegeerd.`);
      continue;
    }
    claimed.add(file.id);
    if (bool(row.tonen, true)) listed.push(toWork(file, row, uuidByDriveId));
  }

  const unlisted = photos
    .filter((f) => !claimed.has(f.id))
    .sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? ''))
    .map((f) => toWork(f, {}, uuidByDriveId));
  return { works: [...unlisted, ...listed], warnings };
}

function toWork(file, row, uuidByDriveId) {
  const uuid = uuidByDriveId.get(file.id);
  if (!uuid) throw new Error(`No ID registered for Drive file ${file.id} (${file.name})`);
  const id = shortId(uuid);
  const titleNl = text(row['titel nl']);
  const title = { nl: titleNl, en: text(row['titel en']) || titleNl };
  const tech = technique(row.techniek);
  const year = text(row.jaar);
  const size = text(row.afmetingen);
  const descriptionNl = text(row['beschrijving nl']);
  const meta = (lang) => [tech?.label[lang], year, size].filter(Boolean).join(' · ');
  const alt = (lang) => [title[lang] || UNTITLED[lang], tech?.label[lang], year].filter(Boolean).join(', ');
  return {
    id,
    uuid,
    title,
    technique: tech,
    year,
    size,
    description: { nl: descriptionNl, en: text(row['beschrijving en']) || descriptionNl },
    meta: { nl: meta('nl'), en: meta('en') },
    alt: { nl: alt('nl'), en: alt('en') },
    featured: bool(row.uitgelicht, false),
    image: { driveId: file.id, fileName: file.name, version: file.modifiedTime ?? '', dir: `w/${id}` },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/works.mjs test/works.test.mjs
git commit -m "feat: join Drive photos with Werken rows into works"
```

---

### Task 5: Exhibitions, banner and texts

**Files:**
- Create: `scripts/lib/exhibitions.mjs`, `scripts/lib/texts.mjs`
- Test: `test/exhibitions.test.mjs`

**Interfaces:**
- Consumes: `text`, `bool`, `date`, `link`, `sheetToRecords` (Task 3); `isImageFile` (Task 4).
- Produces:
  - `hashKey(...parts: string[]): string` (10 hex chars), `todayInBrussels(now?: Date): string`
  - `buildExhibitions(records, files, today): { upcoming, past, other, banner, warnings }`
  - `type Exhibition = { key, title: {nl,en}, text: {nl,en}, from, to, end, place, address, link, image: { driveId, fileName, version, dir: 'e/<hash>' } | null, banner: boolean }`
  - `buildTexts(records): Record<string, {nl, en}>`

- [ ] **Step 1: Write the failing test**

```js file=test/exhibitions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExhibitions, todayInBrussels, hashKey } from '../scripts/lib/exhibitions.mjs';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/lib/exhibitions.mjs'`

- [ ] **Step 3: Implement**

```js file=scripts/lib/exhibitions.mjs
import { createHash } from 'node:crypto';
import { text, bool, date, link } from './cells.mjs';
import { isImageFile } from './works.mjs';

const CONTENT_COLUMNS = ['titel nl', 'titel en', 'van', 'tot', 'plaats', 'adres', 'tekst nl', 'tekst en', 'afbeelding', 'link'];

/** Short stable hash: exhibition anchors, banner dismissal and exhibition image folders. */
export function hashKey(...parts) {
  return createHash('sha1').update(parts.join('\u0000')).digest('hex').slice(0, 10);
}

/** Today in Brussels as YYYY-MM-DD. */
export function todayInBrussels(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Tentoonstellingen rows → upcoming (end ≥ today, soonest first), past (most recent first) and other (no dates,
 * sheet order). end = Tot, else Van. banner = the soonest upcoming (or undated) event with Banner ticked.
 */
export function buildExhibitions(records, files, today) {
  const warnings = [];
  const imagesByName = new Map();
  for (const f of files.filter(isImageFile)) {
    const name = f.name.trim().toLowerCase();
    if (!imagesByName.has(name)) imagesByName.set(name, f);
  }

  const items = [];
  for (const row of records) {
    if (!CONTENT_COLUMNS.some((column) => text(row[column]))) continue;
    if (!bool(row.tonen, true)) continue;
    const where = `Tentoonstellingen, rij ${row.rowNumber}`;
    const from = date(row.van);
    const to = date(row.tot);
    if (from.error || to.error) {
      warnings.push(`${where}: datum "${text(from.error ? row.van : row.tot)}" niet herkend (gebruik bv. 12/11/2026); rij overgeslagen.`);
      continue;
    }
    const imageName = text(row.afbeelding);
    const image = imageName ? imagesByName.get(imageName.toLowerCase()) : undefined;
    if (imageName && !image) warnings.push(`${where}: afbeelding "${imageName}" niet gevonden in de map Tentoonstellingen.`);
    const typedLink = text(row.link);
    const url = link(typedLink);
    if (typedLink && !url) warnings.push(`${where}: link "${typedLink}" is geen geldig webadres.`);

    const titleNl = text(row['titel nl']);
    const textNl = text(row['tekst nl']);
    items.push({
      key: hashKey(titleNl, from.value ?? '', to.value ?? ''),
      title: { nl: titleNl, en: text(row['titel en']) || titleNl },
      text: { nl: textNl, en: text(row['tekst en']) || textNl },
      from: from.value,
      to: to.value,
      end: to.value ?? from.value,
      place: text(row.plaats),
      address: text(row.adres),
      link: url,
      image: image ? { driveId: image.id, fileName: image.name, version: image.modifiedTime ?? '', dir: `e/${hashKey(image.id)}` } : null,
      banner: bool(row.banner, false),
    });
  }

  const start = (e) => e.from ?? e.end;
  const upcoming = items.filter((e) => e.end && e.end >= today).sort((a, b) => start(a).localeCompare(start(b)));
  const past = items.filter((e) => e.end && e.end < today).sort((a, b) => b.end.localeCompare(a.end));
  const other = items.filter((e) => !e.end);
  const banner = [...upcoming, ...other].find((e) => e.banner) ?? null;
  return { upcoming, past, other, banner, warnings };
}
```

```js file=scripts/lib/texts.mjs
import { text } from './cells.mjs';

/** Teksten tab (Key · NL · EN) → { key: { nl, en } }. Keys are lower-cased; English falls back to Dutch. */
export function buildTexts(records) {
  const texts = {};
  for (const row of records) {
    const key = text(row.key).toLowerCase();
    const nl = text(row.nl);
    const en = text(row.en);
    if (!key || (!nl && !en)) continue;
    texts[key] = { nl, en: en || nl };
  }
  return texts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/exhibitions.mjs scripts/lib/texts.mjs test/exhibitions.test.mjs
git commit -m "feat: exhibitions with upcoming/past split, calm banner pick and texts"
```

---

### Task 6: Image processing

**Files:**
- Create: `scripts/images.mjs`
- Test: `test/images.test.mjs`

**Interfaces:**
- Produces:
  - `WIDTHS = [480, 960, 1600]`, `variantWidths(width: number): number[]`, `originalName(driveId, fileName): string`
  - `processImage(input: string, outDir: string, version: string): Promise<{ version, width, height, widths }>` — writes `w<width>.webp`, `og.jpg`, `meta.json`
  - `processAll(images: {driveId, fileName, version}[], { originalsDir, cacheDir }): Promise<{ metas: Map<driveId, meta>, warnings: string[] }>`
  - `assembleSiteImages(images: {driveId, dir}[], { cacheDir, outDir }): Promise<void>` — outDir contains exactly these images
  - `prune(dir: string, keepIds: Set<string>): Promise<void>`

- [ ] **Step 1: Write the failing test**

```js file=test/images.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { processImage, processAll, assembleSiteImages, prune, variantWidths, originalName } from '../scripts/images.mjs';

const tmp = () => mkdtemp(join(tmpdir(), 'img-'));
const makeJpeg = (path, width, height, edit = (s) => s) =>
  edit(sharp({ create: { width, height, channels: 3, background: '#7a9bb5' } }).jpeg()).toFile(path);

test('variantWidths never upscales', () => {
  assert.deepEqual(variantWidths(4000), [480, 960, 1600]);
  assert.deepEqual(variantWidths(1600), [480, 960, 1600]);
  assert.deepEqual(variantWidths(700), [480, 700]);
  assert.deepEqual(variantWidths(300), [300]);
});

test('originalName keeps the extension, lower-cased', () => {
  assert.equal(originalName('abc', 'IMG_1.HEIC'), 'abc.heic');
});

test('processImage writes WebP variants and a 1200×630 Open Graph JPEG', async () => {
  const dir = await tmp();
  await makeJpeg(join(dir, 'in.jpg'), 2000, 1000);
  const meta = await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v1');
  assert.deepEqual(meta, { version: 'v1', width: 1600, height: 800, widths: [480, 960, 1600] });
  assert.deepEqual((await readdir(join(dir, 'out'))).sort(), ['meta.json', 'og.jpg', 'w1600.webp', 'w480.webp', 'w960.webp']);
  const og = await sharp(join(dir, 'out', 'og.jpg')).metadata();
  assert.deepEqual([og.width, og.height, og.format], [1200, 630, 'jpeg']);
  assert.equal((await sharp(join(dir, 'out', 'w960.webp')).metadata()).format, 'webp');
});

test('processImage applies EXIF orientation', async () => {
  const dir = await tmp();
  await makeJpeg(join(dir, 'in.jpg'), 300, 200, (s) => s.withMetadata({ orientation: 6 }));
  const meta = await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v1');
  assert.deepEqual([meta.width, meta.height], [200, 300]);
});

test('processImage strips EXIF metadata (camera, GPS)', async () => {
  const dir = await tmp();
  await makeJpeg(join(dir, 'in.jpg'), 600, 400, (s) => s.withExif({ IFD0: { Copyright: 'Dirk Vermoesen' } }));
  assert.ok((await sharp(join(dir, 'in.jpg')).metadata()).exif, 'test input should carry EXIF');
  await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v1');
  for (const file of ['w480.webp', 'w600.webp', 'og.jpg']) {
    assert.equal((await sharp(join(dir, 'out', file)).metadata()).exif, undefined, file);
  }
});

test('processImage reuses the cache for the same version and redoes a new version', async () => {
  const dir = await tmp();
  await makeJpeg(join(dir, 'in.jpg'), 800, 600);
  await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v1');
  const before = (await stat(join(dir, 'out', 'w480.webp'))).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));
  await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v1');
  assert.equal((await stat(join(dir, 'out', 'w480.webp'))).mtimeMs, before);
  await makeJpeg(join(dir, 'in.jpg'), 400, 300);
  const meta = await processImage(join(dir, 'in.jpg'), join(dir, 'out'), 'v2');
  assert.deepEqual(meta.widths, [400]);
  assert.ok(!existsSync(join(dir, 'out', 'w480.webp')), 'old variants are removed');
});

test('processAll skips broken or missing files with a warning and processes the rest', async () => {
  const dir = await tmp();
  const originalsDir = join(dir, 'originals');
  await mkdir(originalsDir);
  await makeJpeg(join(originalsDir, 'good.jpg'), 500, 500);
  await writeFile(join(originalsDir, 'bad.jpg'), 'dit is geen foto');
  const { metas, warnings } = await processAll(
    [
      { driveId: 'good', fileName: 'Goed.JPG', version: 'v' },
      { driveId: 'bad', fileName: 'kapot.jpg', version: 'v' },
      { driveId: 'gone', fileName: 'weg.png', version: 'v' },
    ],
    { originalsDir, cacheDir: join(dir, 'cache') },
  );
  assert.deepEqual([...metas.keys()], ['good']);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /"kapot\.jpg" kon niet verwerkt worden/);
  assert.match(warnings[1], /"weg\.png" kon niet verwerkt worden/);
});

test('assembleSiteImages publishes only the listed images and removes stale ones', async () => {
  const dir = await tmp();
  const cacheDir = join(dir, 'cache');
  const outDir = join(dir, 'site-img');
  await makeJpeg(join(dir, 'a.jpg'), 500, 400);
  await processImage(join(dir, 'a.jpg'), join(cacheDir, 'driveA'), 'v');
  await processImage(join(dir, 'a.jpg'), join(cacheDir, 'driveHidden'), 'v');
  await mkdir(join(outDir, 'w', 'deleted1'), { recursive: true });
  await writeFile(join(outDir, 'w', 'deleted1', 'w480.webp'), 'old');
  await assembleSiteImages([{ driveId: 'driveA', dir: 'w/aaaa1111' }], { cacheDir, outDir });
  assert.deepEqual(await readdir(join(outDir, 'w')), ['aaaa1111']);
  assert.deepEqual((await readdir(join(outDir, 'w', 'aaaa1111'))).sort(), ['og.jpg', 'w480.webp', 'w500.webp']);
});

test('assembleSiteImages with nothing to publish still leaves an empty folder', async () => {
  const dir = await tmp();
  await assembleSiteImages([], { cacheDir: join(dir, 'cache'), outDir: join(dir, 'site-img') });
  assert.deepEqual(await readdir(join(dir, 'site-img')), []);
});

test('prune removes cache entries for files that are no longer in Drive', async () => {
  const dir = await tmp();
  await mkdir(join(dir, 'keep'));
  await mkdir(join(dir, 'gone'));
  await writeFile(join(dir, 'keep2.jpg'), '');
  await writeFile(join(dir, 'gone2.heic'), '');
  await prune(dir, new Set(['keep', 'keep2']));
  assert.deepEqual((await readdir(dir)).sort(), ['keep', 'keep2.jpg']);
  await prune(join(dir, 'does-not-exist'), new Set());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/images.mjs'`

- [ ] **Step 3: Implement**

```js file=scripts/images.mjs
// Originals → WebP variants + Open Graph JPEG, cached per Drive file, and the exact set of images to publish.
import { mkdir, readFile, writeFile, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

export const WIDTHS = [480, 960, 1600];
const OG = { width: 1200, height: 630, background: '#f7f4ee' };

/** File name of a downloaded original: Drive ID + its extension. */
export function originalName(driveId, fileName) {
  return driveId + extname(fileName).toLowerCase();
}

/** Standard widths below the original width, plus the original width capped at the largest standard one. */
export function variantWidths(width) {
  const largest = WIDTHS.at(-1);
  return [...new Set([...WIDTHS.filter((w) => w < width), Math.min(width, largest)])];
}

/**
 * Writes w<width>.webp variants and og.jpg into outDir. EXIF orientation is applied, all metadata is stripped
 * (sharp's default). Nothing is redone when outDir already holds this version.
 * @returns {Promise<{version: string, width: number, height: number, widths: number[]}>}  largest variant size
 */
export async function processImage(input, outDir, version) {
  const metaPath = join(outDir, 'meta.json');
  const cached = await readJson(metaPath);
  const cachedFiles = cached ? [...cached.widths.map((w) => `w${w}.webp`), 'og.jpg'] : [];
  if (cached?.version === version && cachedFiles.every((f) => existsSync(join(outDir, f)))) return cached;

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const source = /\.(heic|heif)$/i.test(input) ? await heicToJpeg(input, join(outDir, 'source.jpg')) : input;
  try {
    const { width, height, orientation = 1 } = await sharp(source).metadata();
    const widths = variantWidths(orientation >= 5 ? height : width);
    let largest;
    for (const w of widths) {
      largest = await sharp(source).rotate().resize({ width: w }).webp({ quality: 80 }).toFile(join(outDir, `w${w}.webp`));
    }
    await sharp(source)
      .rotate()
      .resize({ width: OG.width, height: OG.height, fit: 'contain', background: OG.background })
      .flatten({ background: OG.background })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(join(outDir, 'og.jpg'));
    const meta = { version, width: largest.width, height: largest.height, widths };
    await writeFile(metaPath, JSON.stringify(meta));
    return meta;
  } finally {
    if (source !== input) await rm(source, { force: true });
  }
}

async function heicToJpeg(input, output) {
  try {
    await execFileAsync('heif-convert', [input, output]);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('HEIC needs heif-convert (apt install libheif-examples)');
    throw err;
  }
  return output;
}

/** Process every image; failures become Dutch warnings for the run summary. */
export async function processAll(images, { originalsDir, cacheDir }) {
  const metas = new Map();
  const warnings = [];
  for (const image of images) {
    if (metas.has(image.driveId)) continue;
    try {
      const input = join(originalsDir, originalName(image.driveId, image.fileName));
      metas.set(image.driveId, await processImage(input, join(cacheDir, image.driveId), image.version));
    } catch (err) {
      warnings.push(`Foto "${image.fileName}" kon niet verwerkt worden en wordt overgeslagen (${err.message}).`);
    }
  }
  return { metas, warnings };
}

/** outDir/<dir>/ gets exactly the listed images; anything else (hidden or deleted photos) is removed. */
export async function assembleSiteImages(images, { cacheDir, outDir }) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const { driveId, dir } of images) {
    const target = join(outDir, dir);
    await mkdir(target, { recursive: true });
    for (const name of await readdir(join(cacheDir, driveId))) {
      if (name.endsWith('.webp') || name === 'og.jpg') await cp(join(cacheDir, driveId, name), join(target, name));
    }
  }
}

/** Remove files/folders whose Drive ID (name without extension) is not in keepIds. */
export async function prune(dir, keepIds) {
  if (!existsSync(dir)) return;
  for (const name of await readdir(dir)) {
    if (!keepIds.has(name.replace(/\.[^.]+$/, ''))) await rm(join(dir, name), { recursive: true, force: true });
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/images.mjs test/images.test.mjs
git commit -m "feat: WebP image pipeline with cache and exact publish set"
```

---

### Task 7: Content composition, data build and sample content

**Files:**
- Create: `scripts/content.mjs`, `scripts/build-data.mjs`, `fixtures/make-images.mjs`, `fixtures/raw.json`, `fixtures/ids.csv`, `fixtures/originals/*.jpg` (generated)
- Test: `test/content.test.mjs`

**Interfaces:**
- Consumes: `sheetToRecords` (3), `buildWorks`, `TECHNIQUE_ORDER`, `isImageFile` (4), `buildExhibitions`, `todayInBrussels`, `buildTexts` (5), registry (2), images (6).
- Produces:
  - `buildContent(raw, registry, today): { works, exhibitions: {upcoming, past, other}, banner, texts, warnings }`
  - `imageList(content): {driveId, fileName, version, dir}[]` — deduplicated, published images only
  - `finalizeContent(content, metas): { works, hero, homeWorks, techniques, exhibitions, banner, texts }` — images gain `width`, `height`, `widths`
  - CLI `node scripts/build-data.mjs --source=fixtures|.cache [--today=YYYY-MM-DD]` → `.cache/content.json`, `.cache/site-img/`
  - Raw snapshot shape: `{ sheets: { werken, tentoonstellingen, teksten }: Cell[][], folders: { werken, tentoonstellingen }: {id, name, mimeType, createdTime, modifiedTime}[] }`; originals at `<source>/originals/<driveId><ext>`

- [ ] **Step 1: Write the failing test**

```js file=test/content.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/content.mjs'`

- [ ] **Step 3: Implement the composition**

```js file=scripts/content.mjs
import { sheetToRecords } from './lib/cells.mjs';
import { buildWorks, TECHNIQUE_ORDER } from './lib/works.mjs';
import { buildExhibitions } from './lib/exhibitions.mjs';
import { buildTexts } from './lib/texts.mjs';

/*
 * Raw snapshot, written by scripts/fetch.mjs (or committed as fixtures/raw.json):
 * {
 *   sheets:  { werken, tentoonstellingen, teksten }  // Cell[][], first row = headers
 *   folders: { werken, tentoonstellingen }           // [{ id, name, mimeType, createdTime, modifiedTime }]
 * }
 */

/** Pure: raw snapshot + ID registry → site content (images not processed yet). */
export function buildContent(raw, registry, today) {
  const uuidByDriveId = new Map(registry.map((e) => [e.driveId, e.uuid]));
  const works = buildWorks(sheetToRecords(raw.sheets?.werken), raw.folders?.werken ?? [], uuidByDriveId);
  const exhibitions = buildExhibitions(sheetToRecords(raw.sheets?.tentoonstellingen), raw.folders?.tentoonstellingen ?? [], today);
  return {
    works: works.works,
    exhibitions: { upcoming: exhibitions.upcoming, past: exhibitions.past, other: exhibitions.other },
    banner: exhibitions.banner,
    texts: buildTexts(sheetToRecords(raw.sheets?.teksten)),
    warnings: [...works.warnings, ...exhibitions.warnings],
  };
}

/** Every image that gets published: visible works + images of visible exhibitions, once each. */
export function imageList(content) {
  const { upcoming, past, other } = content.exhibitions;
  const all = [...content.works.map((w) => w.image), ...[...upcoming, ...past, ...other].map((e) => e.image).filter(Boolean)];
  return [...new Map(all.map((image) => [image.driveId, image])).values()];
}

/**
 * Attach processed image sizes. Works whose image failed are dropped (processAll already warned); exhibitions just
 * lose their image. Adds hero, homeWorks and techniques for the templates.
 */
export function finalizeContent(content, metas) {
  const fill = (image) => {
    const meta = image && metas.get(image.driveId);
    return meta ? { ...image, width: meta.width, height: meta.height, widths: meta.widths } : null;
  };
  const withImage = (e) => e && { ...e, image: fill(e.image) };
  const works = content.works.map((w) => ({ ...w, image: fill(w.image) })).filter((w) => w.image);
  const featured = works.filter((w) => w.featured);
  const hero = featured[0] ?? works[0] ?? null;
  const homeWorks = (featured.length > 1 ? featured : works).filter((w) => w !== hero).slice(0, 8);
  return {
    works,
    hero,
    homeWorks,
    techniques: techniquesOf(works),
    exhibitions: {
      upcoming: content.exhibitions.upcoming.map(withImage),
      past: content.exhibitions.past.map(withImage),
      other: content.exhibitions.other.map(withImage),
    },
    banner: withImage(content.banner),
    texts: content.texts,
  };
}

function techniquesOf(works) {
  const byKey = new Map();
  for (const w of works) if (w.technique && !byKey.has(w.technique.key)) byKey.set(w.technique.key, w.technique);
  const rank = (t) => (TECHNIQUE_ORDER.includes(t.key) ? TECHNIQUE_ORDER.indexOf(t.key) : TECHNIQUE_ORDER.length);
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b) || a.label.nl.localeCompare(b.label.nl));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Add the data build CLI**

```js file=scripts/build-data.mjs
// Raw snapshot (from Google or fixtures/) → .cache/content.json + .cache/site-img/ for Eleventy.
// Usage: node scripts/build-data.mjs --source=.cache|fixtures [--today=YYYY-MM-DD]
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readRegistry, writeRegistry, assignIds } from './ids.mjs';
import { buildContent, imageList, finalizeContent } from './content.mjs';
import { isImageFile } from './lib/works.mjs';
import { todayInBrussels } from './lib/exhibitions.mjs';
import { processAll, assembleSiteImages, prune } from './images.mjs';

const { values: args } = parseArgs({ options: { source: { type: 'string', default: '.cache' }, today: { type: 'string' } } });
const fixtures = args.source === 'fixtures';
const today = args.today ?? todayInBrussels();

// Sample content keeps its own registry. Real IDs are only persisted by CI, so a local run never invents IDs that
// differ from the ones CI commits.
const registryPath = fixtures ? 'fixtures/ids.csv' : 'content/ids.csv';
const persistIds = fixtures || process.env.GITHUB_ACTIONS === 'true';
const cacheDir = fixtures ? '.cache/fixture-images' : '.cache/images';

const raw = JSON.parse(await readFile(join(args.source, 'raw.json'), 'utf8'));
const workPhotos = (raw.folders?.werken ?? []).filter(isImageFile);
const { entries, added } = assignIds(await readRegistry(registryPath), workPhotos, { today });
if (added.length && persistIds) await writeRegistry(registryPath, entries);

const content = buildContent(raw, entries, today);
const images = imageList(content);
const { metas, warnings: imageWarnings } = await processAll(images, { originalsDir: join(args.source, 'originals'), cacheDir });
await assembleSiteImages(images.filter((image) => metas.has(image.driveId)), { cacheDir, outDir: '.cache/site-img' });
const driveIds = [...(raw.folders?.werken ?? []), ...(raw.folders?.tentoonstellingen ?? [])].map((f) => f.id);
await prune(cacheDir, new Set(driveIds));

const site = finalizeContent(content, metas);
await mkdir('.cache', { recursive: true });
await writeFile('.cache/content.json', JSON.stringify(site, null, 2));

const warnings = [...content.warnings, ...imageWarnings];
const banner = site.banner ? `, banner: "${site.banner.title.nl}"` : '';
const summary = [
  `Gepubliceerd: ${site.works.length} werken, ${site.exhibitions.upcoming.length} komende en ${site.exhibitions.past.length} voorbije tentoonstellingen${banner}.`,
  ...(added.length ? [`Nieuwe werken geregistreerd: ${added.length}.`] : []),
  ...(warnings.length ? ['', 'Aandachtspunten:', ...warnings.map((w) => `- ${w}`)] : ['Geen aandachtspunten.']),
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Website-inhoud\n\n${summary}\n`);
```

- [ ] **Step 6: Generate the sample images**

```js file=fixtures/make-images.mjs
// One-off generator for the abstract "watercolour" sample images in fixtures/originals/ (output is committed).
// Run from the repo root: node fixtures/make-images.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const IMAGES = {
  'fx-01': [1600, 1100, ['#3d6a8a', '#d9a45b', '#a7c4d6', '#2f4858']],
  'fx-02': [1100, 1500, ['#6b8f5e', '#c9d6a3', '#3f5a3a', '#e8e0c5']],
  'fx-03': [1000, 1300, ['#4a4a4a', '#8c8c8c', '#2b2b2b', '#bdbdbd']],
  'fx-04': [1800, 900, ['#d8b57a', '#a8774a', '#e9d8b4', '#7d9aa8']],
  'fx-05': [1200, 1200, ['#b5787f', '#7c6a9e', '#e3c2c4', '#4d4466']],
  'fx-06': [1000, 800, ['#999999', '#cccccc']],
  'fx-07': [1500, 1000, ['#4f7d9c', '#e0c79a', '#9cb9c9', '#c99a5b']],
  'fx-e1': [900, 1270, ['#2f5d7c', '#c4dbe6', '#e7b45d', '#1f3b4f']],
};

function svg(width, height, colors, seed) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const min = Math.min(width, height);
  const blobs = Array.from({ length: 16 }, (_, i) => {
    const r = (0.1 + random() * 0.28) * min;
    return `<ellipse cx="${Math.round(random() * width)}" cy="${Math.round(random() * height)}" rx="${Math.round(r * (0.8 + random() * 0.8))}" ry="${Math.round(r)}" fill="${colors[i % colors.length]}" fill-opacity="${(0.18 + random() * 0.3).toFixed(2)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f3eee4"/><filter id="b"><feGaussianBlur stdDeviation="${Math.round(min / 30)}"/></filter><g filter="url(#b)">${blobs}</g></svg>`;
}

await mkdir('fixtures/originals', { recursive: true });
let seed = 7;
for (const [id, [width, height, colors]] of Object.entries(IMAGES)) {
  await sharp(Buffer.from(svg(width, height, colors, seed++ * 7919))).jpeg({ quality: 78 }).toFile(`fixtures/originals/${id}.jpg`);
}
```

Run: `node fixtures/make-images.mjs && ls fixtures/originals`
Expected: `fx-01.jpg … fx-07.jpg fx-e1.jpg`

- [ ] **Step 7: Add the sample snapshot and its ID registry**

```json file=fixtures/raw.json
{
  "fetchedAt": "sample",
  "sheets": {
    "werken": [
      ["Bestand", "ID", "Titel NL", "Titel EN", "Techniek", "Jaar", "Afmetingen", "Beschrijving NL", "Beschrijving EN", "Tonen", "Uitgelicht"],
      ["haven-avond.jpg", "fx-01", "Haven bij avond", "Harbour at dusk", "Aquarel", 2024, "36 x 48 cm", "Voorbeeldtekst: de haven in het laatste licht.", "Sample text: the harbour in the last light.", true, true],
      ["berken.jpg", "fx-02", "Berken in maart", "", "Aquarel", 2025, "30 x 40 cm", "", "", true, true],
      ["studie.jpg", "fx-03", "Studie", "Study", "Tekening", 2023, "", "", "", true, false],
      ["duinen.jpg", "fx-04", "Duinen", "Dunes", "Olieverf", 2022, "50 x 100 cm", "", "", true, true],
      ["zee-en-duinen.jpg", "fx-07", "Zee & duinen", "Sea & dunes", "Gemengde techniek", 2025, "", "", "", true, false],
      ["verborgen.jpg", "fx-06", "Verborgen werk", "", "Aquarel", "", "", "", "", false, false],
      ["weg.jpg", "", "Verdwenen werk", "", "", "", "", "", "", "", ""]
    ],
    "tentoonstellingen": [
      ["Titel NL", "Titel EN", "Van", "Tot", "Plaats", "Adres", "Tekst NL", "Tekst EN", "Afbeelding", "Link", "Tonen", "Banner"],
      ["Licht op water", "Light on water", 46458, 46467, "Galerie (voorbeeld)", "Voorbeeldstraat 1, 2930 Brasschaat", "Voorbeeldtekst: nieuwe aquarellen rond water en licht.", "Sample text: new watercolours about water and light.", "affiche-licht-op-water.jpg", "www.example.com", true, true],
      ["Open atelier", "Open studio", "15/11/2026", "", "Atelier Dirk Vermoesen", "Veldstraat 258, 2930 Brasschaat", "Voorbeeldtekst: het atelier is open voor bezoekers.", "", "", "", true, false],
      ["Zomersalon", "Summer salon", 45839, 45900, "Cultuurcentrum (voorbeeld)", "", "", "", "", "", true, true],
      ["Atelier op afspraak", "Studio by appointment", "", "", "", "", "Voorbeeldtekst: het atelier is te bezoeken op afspraak.", "Sample text: the studio can be visited by appointment.", "", "", true, false],
      ["Oude aankondiging", "", "01/01/2024", "", "", "", "", "", "", "", false, false],
      ["", "", "", "", "", "", "", "", "", "", true, false]
    ],
    "teksten": [
      ["Key", "NL", "EN"],
      ["home_intro", "Voorbeeldtekst — Dirk past deze intro zelf aan in het tabblad Teksten.\n\nAquarellen, tekeningen en olieverfschilderijen uit het atelier in Brasschaat.", "Sample text — Dirk edits this introduction in the Teksten tab.\n\nWatercolours, drawings and oil paintings from the studio in Brasschaat."],
      ["about", "Voorbeeldtekst — hier komt Dirks eigen verhaal, in te vullen in het tabblad Teksten.", "Sample text — Dirk's own story goes here, filled in via the Teksten tab."]
    ]
  },
  "folders": {
    "werken": [
      { "id": "fx-01", "name": "haven-avond.jpg", "mimeType": "image/jpeg", "createdTime": "2026-02-01T10:00:00Z", "modifiedTime": "2026-02-01T10:00:00Z" },
      { "id": "fx-02", "name": "berken.jpg", "mimeType": "image/jpeg", "createdTime": "2026-03-01T10:00:00Z", "modifiedTime": "2026-03-01T10:00:00Z" },
      { "id": "fx-03", "name": "studie.jpg", "mimeType": "image/jpeg", "createdTime": "2026-01-15T10:00:00Z", "modifiedTime": "2026-01-15T10:00:00Z" },
      { "id": "fx-04", "name": "duinen.jpg", "mimeType": "image/jpeg", "createdTime": "2025-11-01T10:00:00Z", "modifiedTime": "2025-11-01T10:00:00Z" },
      { "id": "fx-05", "name": "IMG_0412.jpg", "mimeType": "image/jpeg", "createdTime": "2026-09-30T10:00:00Z", "modifiedTime": "2026-09-30T10:00:00Z" },
      { "id": "fx-06", "name": "verborgen.jpg", "mimeType": "image/jpeg", "createdTime": "2026-04-01T10:00:00Z", "modifiedTime": "2026-04-01T10:00:00Z" },
      { "id": "fx-07", "name": "zee-en-duinen.jpg", "mimeType": "image/jpeg", "createdTime": "2026-05-01T10:00:00Z", "modifiedTime": "2026-05-01T10:00:00Z" },
      { "id": "fx-08", "name": "notities.pdf", "mimeType": "application/pdf", "createdTime": "2026-05-02T10:00:00Z", "modifiedTime": "2026-05-02T10:00:00Z" }
    ],
    "tentoonstellingen": [
      { "id": "fx-e1", "name": "affiche-licht-op-water.jpg", "mimeType": "image/jpeg", "createdTime": "2026-09-01T10:00:00Z", "modifiedTime": "2026-09-01T10:00:00Z" }
    ]
  }
}
```

```csv file=fixtures/ids.csv
uuid,drive_id,file_name,first_seen
1a2b3c4d-0000-4000-8000-000000000001,fx-01,haven-avond.jpg,2026-10-11
2b3c4d5e-0000-4000-8000-000000000002,fx-02,berken.jpg,2026-10-11
3c4d5e6f-0000-4000-8000-000000000003,fx-03,studie.jpg,2026-10-11
4d5e6f7a-0000-4000-8000-000000000004,fx-04,duinen.jpg,2026-10-11
5e6f7a8b-0000-4000-8000-000000000005,fx-05,IMG_0412.jpg,2026-10-11
6f7a8b9c-0000-4000-8000-000000000006,fx-06,verborgen.jpg,2026-10-11
7a8b9c0d-0000-4000-8000-000000000007,fx-07,zee-en-duinen.jpg,2026-10-11
```

- [ ] **Step 8: Run the data build on the sample content**

Run: `npm run data:fixtures -- --today=2026-10-11`
Expected output:
```
Gepubliceerd: 6 werken, 2 komende en 1 voorbije tentoonstellingen, banner: "Licht op water".

Aandachtspunten:
- Werken: "notities.pdf" is geen foto en wordt overgeslagen.
- Werken, rij 8: foto "weg.jpg" niet gevonden in de map Werken.
```
and `ls .cache/site-img/w` lists `1a2b3c4d 2b3c4d5e 3c4d5e6f 4d5e6f7a 5e6f7a8b 7a8b9c0d` (no `6f7a8b9c`, the hidden one); `git status` shows `fixtures/ids.csv` unchanged.

- [ ] **Step 9: Commit**

```bash
git add scripts/content.mjs scripts/build-data.mjs test/content.test.mjs fixtures/
git commit -m "feat: compose site content and build data from a snapshot, with sample content"
```

---

### Task 8: Eleventy site (pages, layout, NL/EN)

**Files:**
- Create: `eleventy.config.js`, `src/_lib/routes.js`, `src/_lib/filters.js`, `src/_data/site.js`, `src/_data/langs.js`, `src/_data/atelier.js`, `src/_data/i18n/nl.json`, `src/_data/i18n/en.json`, `src/_includes/base.njk`, `src/_includes/header.njk`, `src/_includes/footer.njk`, `src/_includes/banner.njk`, `src/_includes/macros.njk`, `src/pages/home.njk`, `src/pages/work.njk`, `src/pages/work-detail.njk`, `src/pages/exhibitions.njk`, `src/pages/about.njk`, `src/pages/contact.njk`, `src/pages/404.njk`, `src/pages/sitemap.njk`, `src/pages/robots.njk`
- Test: `test/filters.test.mjs`, `test/site.test.mjs`

**Interfaces:**
- Consumes: `.cache/content.json` (Task 7) via `src/_data/atelier.js`; images under `.cache/site-img/`.
- Produces:
  - `routes: Record<pageKey, {nl, en}>`, `LANGS = ['nl', 'en']`
  - filters `pageUrl(key, lang, workId?)`, `absUrl(path)`, `dateRange(from, to, lang, short?)`, `paragraphs(text)`, `srcset(image)`, `imgSrc(image, preferred?)`
  - template data: `atelier` (content + `workPages: {lang, work, prev, next}[]`), `site`, `langs`, `i18n`
  - page front matter contract: `pageKey` (route key, or `notFound`), `lang`; work pages have `wp`

- [ ] **Step 1: Write the failing filter test**

```js file=test/filters.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/_lib/filters.js'`

- [ ] **Step 3: Implement routes and filters**

```js file=src/_lib/routes.js
// URL of every page per language. Work pages live below the work route: /werk/<id>/ and /en/work/<id>/.
export const LANGS = ['nl', 'en'];

export const routes = {
  home: { nl: '/', en: '/en/' },
  work: { nl: '/werk/', en: '/en/work/' },
  exhibitions: { nl: '/tentoonstellingen/', en: '/en/exhibitions/' },
  about: { nl: '/over/', en: '/en/about/' },
  contact: { nl: '/contact/', en: '/en/contact/' },
};
```

```js file=src/_lib/filters.js
import { routes } from './routes.js';

const LOCALES = { nl: 'nl-BE', en: 'en-GB' };

/** Site-relative URL: pageUrl('work', 'en', '3f2a9c1e') → '/en/work/3f2a9c1e/'. */
export function pageUrl(key, lang, workId) {
  const base = routes[key]?.[lang];
  if (!base) throw new Error(`Unknown page "${key}" for language "${lang}"`);
  return workId ? `${base}${workId}/` : base;
}

/** Full URL for canonical, hreflang, sitemap and Open Graph tags, including the path prefix. */
export function absoluteUrl(path, baseUrl, pathPrefix = '/') {
  return new URL(`${pathPrefix.replace(/\/$/, '')}${path}`, baseUrl).href;
}

/** ('2026-11-12', '2026-11-20', 'nl') → '12–20 november 2026'; short: '12 – 20 nov' (no year). */
export function dateRange(from, to, lang, { short = false } = {}) {
  const start = from ?? to;
  const end = to ?? from;
  if (!start) return '';
  const format = new Intl.DateTimeFormat(LOCALES[lang], {
    day: 'numeric',
    month: short ? 'short' : 'long',
    ...(short ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
  const day = (iso) => new Date(`${iso}T00:00:00Z`);
  return start === end ? format.format(day(start)) : format.formatRange(day(start), day(end));
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Plain text from the Sheet → escaped HTML paragraphs (blank line = new paragraph, newline = <br>). */
export function paragraphs(value) {
  if (!value) return '';
  return String(value)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** srcset for a processed image { dir, widths }. */
export function srcset(image) {
  return image.widths.map((w) => `/img/${image.dir}/w${w}.webp ${w}w`).join(', ');
}

/** Fallback src: the smallest variant at least `preferred` px wide, else the largest one. */
export function imgSrc(image, preferred = 960) {
  const width = image.widths.find((w) => w >= preferred) ?? image.widths.at(-1);
  return `/img/${image.dir}/w${width}.webp`;
}
```

Run: `npm test`
Expected: PASS for `filters.test.mjs`

- [ ] **Step 4: Write the failing site test**

```js file=test/site.test.mjs
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
```

Run: `npm test`
Expected: FAIL — `Cannot find module '.../eleventy.config.js'` (or Eleventy input errors)

- [ ] **Step 5: Add Eleventy config and data files**

```js file=eleventy.config.js
import { readFileSync } from 'node:fs';
import { HtmlBasePlugin } from '@11ty/eleventy';
import { pageUrl, absoluteUrl, dateRange, paragraphs, srcset, imgSrc } from './src/_lib/filters.js';

const config = JSON.parse(readFileSync('site.config.json', 'utf8'));

const fonts = (pkg, name, weights) =>
  Object.fromEntries(weights.map((w) => [`node_modules/@fontsource/${pkg}/files/${pkg}-latin-${w}-normal.woff2`, `assets/fonts/${name}-${w}.woff2`]));

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true });

  eleventyConfig.addPassthroughCopy({
    'src/assets': 'assets',
    '.cache/site-img': 'img',
    ...fonts('cormorant-garamond', 'cormorant-garamond', [500, 600]),
    ...fonts('source-sans-3', 'source-sans-3', [400, 600]),
  });

  eleventyConfig.addFilter('pageUrl', pageUrl);
  eleventyConfig.addFilter('absUrl', (path) => absoluteUrl(path, config.baseUrl, config.pathPrefix));
  eleventyConfig.addFilter('dateRange', (from, to, lang, short = false) => dateRange(from, to, lang, { short }));
  eleventyConfig.addFilter('paragraphs', paragraphs);
  eleventyConfig.addFilter('srcset', srcset);
  eleventyConfig.addFilter('imgSrc', imgSrc);

  return {
    dir: { input: 'src', includes: '_includes', data: '_data', output: '_site' },
    templateFormats: ['njk'],
    pathPrefix: config.pathPrefix,
  };
}
```

```js file=src/_data/site.js
import { readFileSync } from 'node:fs';
import { routes } from '../_lib/routes.js';

const config = JSON.parse(readFileSync('site.config.json', 'utf8'));

export default {
  baseUrl: config.baseUrl,
  pathPrefix: config.pathPrefix,
  routes,
  year: new Date().getFullYear(),
  portrait: { width: 750, height: 1000 },
  contact: {
    street: 'Veldstraat 258',
    postal: '2930',
    city: 'Brasschaat',
    country: { nl: 'België', en: 'Belgium' },
    phone: '+32 489 91 90 14',
    phoneHref: 'tel:+32489919014',
    email: 'dirkvermoesen@hotmail.com',
    routeUrl: 'https://www.google.com/maps/dir/?api=1&destination=Veldstraat+258%2C+2930+Brasschaat',
    facebook: { handle: 'dirk.vermoesen', url: 'https://www.facebook.com/dirk.vermoesen' },
    instagram: { handle: 'vermoesen.dirk', url: 'https://www.instagram.com/vermoesen.dirk/' },
  },
};
```

```js file=src/_data/langs.js
import { LANGS } from '../_lib/routes.js';

export default LANGS;
```

```js file=src/_data/atelier.js
// Site content prepared by scripts/build-data.mjs, plus one entry per work page per language.
import { readFile } from 'node:fs/promises';
import { LANGS } from '../_lib/routes.js';

export default async function () {
  let content;
  try {
    content = JSON.parse(await readFile('.cache/content.json', 'utf8'));
  } catch {
    throw new Error('No .cache/content.json. Run `npm run data:fixtures` (sample content) or `npm run fetch && npm run data:google` first.');
  }
  content.workPages = LANGS.flatMap((lang) =>
    content.works.map((work, i, works) => ({ lang, work, prev: works[i - 1] ?? null, next: works[i + 1] ?? null })),
  );
  return content;
}
```

```json file=src/_data/i18n/nl.json
{
  "langShort": "NL",
  "langName": "Nederlands",
  "ogLocale": "nl_BE",
  "skip": "Naar de inhoud",
  "tagline": "Aquarel · Tekening · Olieverf",
  "nav": { "label": "Hoofdmenu", "work": "Werk", "exhibitions": "Tentoonstellingen", "about": "Over Dirk", "contact": "Contact" },
  "pages": {
    "home": { "title": "Dirk Vermoesen — Aquarel · Tekening · Olieverf", "description": "Aquarellen, tekeningen en olieverfschilderijen van Dirk Vermoesen uit Brasschaat." },
    "work": { "title": "Werk — Dirk Vermoesen", "description": "Aquarellen, tekeningen en olieverfschilderijen van Dirk Vermoesen." },
    "exhibitions": { "title": "Tentoonstellingen — Dirk Vermoesen", "description": "Komende en voorbije tentoonstellingen van Dirk Vermoesen." },
    "about": { "title": "Over Dirk Vermoesen", "description": "Over Dirk Vermoesen, kunstenaar in Brasschaat." },
    "contact": { "title": "Contact — Dirk Vermoesen", "description": "Contactgegevens van Dirk Vermoesen, Veldstraat 258, 2930 Brasschaat." },
    "notFound": { "title": "Pagina niet gevonden — Dirk Vermoesen", "description": "Deze pagina bestaat niet (meer)." }
  },
  "home": { "more": "Meer werk", "allWork": "Bekijk al het werk" },
  "work": {
    "heading": "Werk",
    "filterLabel": "Filter op techniek",
    "filterAll": "Alles",
    "prev": "Vorige",
    "next": "Volgende",
    "backToAll": "Al het werk",
    "pagerLabel": "Andere werken",
    "question": "Vragen over dit werk? Neem gerust contact op.",
    "empty": "Binnenkort is hier werk te zien."
  },
  "exhibitions": {
    "heading": "Tentoonstellingen",
    "upcoming": "Binnenkort",
    "past": "Eerder",
    "other": "Doorlopend",
    "noneUpcoming": "Er staan op dit moment geen tentoonstellingen gepland.",
    "moreInfo": "Meer info"
  },
  "banner": { "label": "Tentoonstelling", "more": "Meer info", "close": "Melding sluiten" },
  "about": { "heading": "Over Dirk", "portraitAlt": "Getekend zelfportret van Dirk Vermoesen" },
  "contact": {
    "heading": "Contact",
    "intro": "Wil je een werk van dichtbij zien of heb je een vraag? Mail of bel gerust.",
    "email": "E-mail",
    "phone": "Telefoon",
    "address": "Adres",
    "route": "Route plannen",
    "follow": "Volgen"
  },
  "notFound": { "heading": "Pagina niet gevonden", "text": "Deze pagina bestaat niet (meer).", "back": "Naar al het werk" }
}
```

```json file=src/_data/i18n/en.json
{
  "langShort": "EN",
  "langName": "English",
  "ogLocale": "en_GB",
  "skip": "Skip to content",
  "tagline": "Watercolour · Drawing · Oil painting",
  "nav": { "label": "Main menu", "work": "Work", "exhibitions": "Exhibitions", "about": "About Dirk", "contact": "Contact" },
  "pages": {
    "home": { "title": "Dirk Vermoesen — Watercolour · Drawing · Oil painting", "description": "Watercolours, drawings and oil paintings by Dirk Vermoesen from Brasschaat, Belgium." },
    "work": { "title": "Work — Dirk Vermoesen", "description": "Watercolours, drawings and oil paintings by Dirk Vermoesen." },
    "exhibitions": { "title": "Exhibitions — Dirk Vermoesen", "description": "Upcoming and past exhibitions of Dirk Vermoesen." },
    "about": { "title": "About Dirk Vermoesen", "description": "About Dirk Vermoesen, artist in Brasschaat, Belgium." },
    "contact": { "title": "Contact — Dirk Vermoesen", "description": "Contact details of Dirk Vermoesen, Veldstraat 258, 2930 Brasschaat, Belgium." },
    "notFound": { "title": "Page not found — Dirk Vermoesen", "description": "This page does not exist (anymore)." }
  },
  "home": { "more": "More work", "allWork": "See all work" },
  "work": {
    "heading": "Work",
    "filterLabel": "Filter by technique",
    "filterAll": "All",
    "prev": "Previous",
    "next": "Next",
    "backToAll": "All work",
    "pagerLabel": "Other works",
    "question": "Questions about this work? Feel free to get in touch.",
    "empty": "Work will be shown here soon."
  },
  "exhibitions": {
    "heading": "Exhibitions",
    "upcoming": "Coming up",
    "past": "Earlier",
    "other": "Ongoing",
    "noneUpcoming": "No exhibitions are planned at the moment.",
    "moreInfo": "More info"
  },
  "banner": { "label": "Exhibition", "more": "More info", "close": "Close announcement" },
  "about": { "heading": "About Dirk", "portraitAlt": "Drawn self-portrait of Dirk Vermoesen" },
  "contact": {
    "heading": "Contact",
    "intro": "Would you like to see a work in person, or do you have a question? Feel free to email or call.",
    "email": "Email",
    "phone": "Phone",
    "address": "Address",
    "route": "Get directions",
    "follow": "Follow"
  },
  "notFound": { "heading": "Page not found", "text": "This page does not exist (anymore).", "back": "Go to all work" }
}
```

- [ ] **Step 6: Add layout and partials**

```njk file=src/_includes/base.njk
{%- set t = i18n[lang] -%}
{%- set otherLang = 'en' if lang == 'nl' else 'nl' -%}
{%- set workId = wp.work.id if wp else null -%}
{%- set hasRoute = site.routes[pageKey] -%}
{%- if wp -%}
  {%- set pageTitle = wp.work.alt[lang] + ' — Dirk Vermoesen' -%}
  {%- set pageDescription = (wp.work.description[lang] or wp.work.alt[lang]) | truncate(155) -%}
  {%- set ogImage = wp.work.image -%}
{%- else -%}
  {%- set pageTitle = t.pages[pageKey].title -%}
  {%- set pageDescription = t.pages[pageKey].description -%}
  {%- set ogImage = atelier.hero.image if atelier.hero else null -%}
{%- endif -%}
<!doctype html>
<html lang="{{ lang }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ pageTitle }}</title>
<meta name="description" content="{{ pageDescription }}">
{%- if hasRoute %}
<link rel="canonical" href="{{ pageKey | pageUrl(lang, workId) | absUrl }}">
<link rel="alternate" hreflang="nl" href="{{ pageKey | pageUrl('nl', workId) | absUrl }}">
<link rel="alternate" hreflang="en" href="{{ pageKey | pageUrl('en', workId) | absUrl }}">
<link rel="alternate" hreflang="x-default" href="{{ pageKey | pageUrl('nl', workId) | absUrl }}">
<meta property="og:url" content="{{ pageKey | pageUrl(lang, workId) | absUrl }}">
{%- endif %}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Dirk Vermoesen">
<meta property="og:title" content="{{ pageTitle }}">
<meta property="og:description" content="{{ pageDescription }}">
<meta property="og:locale" content="{{ t.ogLocale }}">
{%- if ogImage %}
<meta property="og:image" content="{{ ('/img/' + ogImage.dir + '/og.jpg') | absUrl }}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
{%- endif %}
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/cormorant-garamond-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/style.css">
<script src="/assets/js/site.js" defer></script>
</head>
<body>
<a class="skip-link" href="#main">{{ t.skip }}</a>
{%- if atelier.banner and pageKey != 'exhibitions' %}
{% include "banner.njk" %}
{%- endif %}
{% include "header.njk" %}
<main id="main">
{{ content | safe }}
</main>
{% include "footer.njk" %}
</body>
</html>
```

```njk file=src/_includes/header.njk
<header class="site-header">
  <div class="wrap site-header__inner">
    <a class="wordmark" href="{{ 'home' | pageUrl(lang) }}">
      <span class="wordmark__name">Dirk Vermoesen</span>
      <span class="wordmark__tagline">{{ t.tagline }}</span>
    </a>
    <nav class="site-nav" aria-label="{{ t.nav.label }}">
      <ul>
        {%- for key in ['work', 'exhibitions', 'about', 'contact'] %}
        <li><a href="{{ key | pageUrl(lang) }}"{% if pageKey == key %} aria-current="{{ 'true' if wp else 'page' }}"{% endif %}>{{ t.nav[key] }}</a></li>
        {%- endfor %}
      </ul>
      {%- if hasRoute %}
      <a class="lang-switch" href="{{ pageKey | pageUrl(otherLang, workId) }}" hreflang="{{ otherLang }}" lang="{{ otherLang }}" title="{{ i18n[otherLang].langName }}">{{ i18n[otherLang].langShort }}</a>
      {%- endif %}
    </nav>
  </div>
</header>
```

```njk file=src/_includes/footer.njk
{%- set c = site.contact -%}
<footer class="site-footer">
  <div class="wrap">
    <p class="site-footer__name">Dirk Vermoesen</p>
    <p>{{ c.street }}, {{ c.postal }} {{ c.city }}<br>
      <a href="{{ c.phoneHref }}">{{ c.phone }}</a> · <a href="mailto:{{ c.email }}">{{ c.email }}</a></p>
    <p><a href="{{ c.instagram.url }}" rel="me">Instagram</a> · <a href="{{ c.facebook.url }}" rel="me">Facebook</a></p>
    <p class="site-footer__copy">© {{ site.year }} Dirk Vermoesen</p>
  </div>
</footer>
```

```njk file=src/_includes/banner.njk
{%- set b = atelier.banner -%}
<aside class="event-strip" data-event-strip data-key="{{ b.key }}"{% if b.end %} data-until="{{ b.end }}"{% endif %} aria-label="{{ t.banner.label }}">
  <div class="wrap event-strip__inner">
    <p><span class="event-strip__label">{{ t.banner.label }}</span>
      <a href="{{ 'exhibitions' | pageUrl(lang) }}#e-{{ b.key }}">{{ b.title[lang] or t.banner.more }}</a>
      {%- if b.from or b.to %} · {{ b.from | dateRange(b.to, lang, true) }}{% endif %}
      {%- if b.place %} · {{ b.place }}{% endif %}</p>
    <button type="button" class="event-strip__close" data-dismiss aria-label="{{ t.banner.close }}" hidden>&times;</button>
  </div>
</aside>
<script>(function (strip) { try { if (localStorage.getItem('event-dismissed-' + strip.dataset.key) === '1') strip.remove(); } catch (e) {} })(document.currentScript.previousElementSibling);</script>
```

```njk file=src/_includes/macros.njk
{% macro artImage(image, alt, sizes, loading = 'lazy', preferred = 960) -%}
<img src="{{ image | imgSrc(preferred) }}" srcset="{{ image | srcset }}" sizes="{{ sizes }}" width="{{ image.width }}" height="{{ image.height }}" alt="{{ alt }}" loading="{{ loading }}" decoding="async">
{%- endmacro %}

{% macro workTile(work, lang) -%}
<li class="tile" style="--ar: {{ (work.image.width / work.image.height) | round(3) }}" data-technique="{{ work.technique.key if work.technique else '' }}">
  <a href="{{ 'work' | pageUrl(lang, work.id) }}">{{ artImage(work.image, work.alt[lang], '(min-width: 1200px) 400px, (min-width: 480px) 50vw, 100vw') }}</a>
</li>
{%- endmacro %}

{% macro exhibition(e, lang, t) -%}
<article class="ex" id="e-{{ e.key }}">
  {%- if e.image %}
  <div class="ex__image">{{ artImage(e.image, e.title[lang], '(min-width: 600px) 180px, 100vw', 'lazy', 480) }}</div>
  {%- endif %}
  <div class="ex__body">
    {%- if e.from or e.to %}
    <p class="meta">{{ e.from | dateRange(e.to, lang) }}</p>
    {%- endif %}
    {%- if e.title[lang] %}
    <h3>{{ e.title[lang] }}</h3>
    {%- endif %}
    {%- if e.place or e.address %}
    <p class="ex__place">{{ e.place }}{% if e.place and e.address %}<br>{% endif %}{{ e.address }}</p>
    {%- endif %}
    {{ e.text[lang] | paragraphs | safe }}
    {%- if e.link %}
    <p><a href="{{ e.link }}" rel="noopener">{{ t.exhibitions.moreInfo }}</a></p>
    {%- endif %}
  </div>
</article>
{%- endmacro %}
```

- [ ] **Step 7: Add the pages**

```njk file=src/pages/home.njk
---
layout: base.njk
pagination:
  data: langs
  size: 1
  alias: lang
permalink: "{{ 'home' | pageUrl(lang) }}"
pageKey: home
---
{%- import "macros.njk" as m -%}
{%- set t = i18n[lang] -%}
{%- set hero = atelier.hero -%}
{%- if hero %}
<section class="hero">
  <a class="hero__image" href="{{ 'work' | pageUrl(lang, hero.id) }}">{{ m.artImage(hero.image, hero.alt[lang], '(min-width: 1200px) 1136px, 100vw', 'eager', 1600) }}</a>
  {%- if hero.title[lang] %}
  <p class="hero__caption">{{ hero.title[lang] }}{% if hero.meta[lang] %} · {{ hero.meta[lang] }}{% endif %}</p>
  {%- endif %}
</section>
{%- else %}
<p class="wrap empty">{{ t.work.empty }}</p>
{%- endif %}
{%- if atelier.texts.home_intro %}
<section class="intro wrap-narrow">{{ atelier.texts.home_intro[lang] | paragraphs | safe }}</section>
{%- endif %}
{%- if atelier.banner %}
{%- set e = atelier.banner %}
<section class="event-card wrap-narrow" data-event-card{% if e.end %} data-until="{{ e.end }}"{% endif %}>
  {%- if e.image %}
  {{ m.artImage(e.image, e.title[lang], '(min-width: 600px) 200px, 100vw', 'lazy', 480) }}
  {%- endif %}
  <div>
    <p class="eyebrow">{{ t.banner.label }}</p>
    {%- if e.title[lang] %}
    <h2>{{ e.title[lang] }}</h2>
    {%- endif %}
    <p class="meta">{{ e.from | dateRange(e.to, lang) }}{% if e.place %} · {{ e.place }}{% endif %}</p>
    <p><a href="{{ 'exhibitions' | pageUrl(lang) }}#e-{{ e.key }}">{{ t.exhibitions.moreInfo }}</a></p>
  </div>
</section>
{%- endif %}
{%- if atelier.homeWorks.length %}
<section class="wrap">
  <h2 class="section-title">{{ t.home.more }}</h2>
  <ul class="tiles">{% for w in atelier.homeWorks %}{{ m.workTile(w, lang) }}{% endfor %}</ul>
  <p class="more"><a href="{{ 'work' | pageUrl(lang) }}">{{ t.home.allWork }} →</a></p>
</section>
{%- endif %}
```

```njk file=src/pages/work.njk
---
layout: base.njk
pagination:
  data: langs
  size: 1
  alias: lang
permalink: "{{ 'work' | pageUrl(lang) }}"
pageKey: work
---
{%- import "macros.njk" as m -%}
{%- set t = i18n[lang] -%}
<div class="wrap">
  <h1 class="page-title">{{ t.work.heading }}</h1>
  {%- if atelier.techniques.length > 1 %}
  <div class="filters" data-filters role="group" aria-label="{{ t.work.filterLabel }}" hidden>
    <button type="button" data-filter="" aria-pressed="true">{{ t.work.filterAll }}</button>
    {%- for tech in atelier.techniques %}
    <button type="button" data-filter="{{ tech.key }}" aria-pressed="false">{{ tech.label[lang] }}</button>
    {%- endfor %}
  </div>
  {%- endif %}
  {%- if atelier.works.length %}
  <ul class="tiles" data-tiles>{% for w in atelier.works %}{{ m.workTile(w, lang) }}{% endfor %}</ul>
  {%- else %}
  <p class="empty">{{ t.work.empty }}</p>
  {%- endif %}
</div>
```

```njk file=src/pages/work-detail.njk
---
layout: base.njk
pagination:
  data: atelier.workPages
  size: 1
  alias: wp
permalink: "{{ 'work' | pageUrl(wp.lang, wp.work.id) }}"
pageKey: work
eleventyComputed:
  lang: "{{ wp.lang }}"
---
{%- import "macros.njk" as m -%}
{%- set t = i18n[lang] -%}
{%- set w = wp.work -%}
<article class="work">
  <figure class="work__figure wrap">{{ m.artImage(w.image, w.alt[lang], '(min-width: 1200px) 1136px, 100vw', 'eager', 1600) }}</figure>
  <div class="work__text wrap-narrow">
    <h1{% if not w.title[lang] %} class="visually-hidden"{% endif %}>{{ w.title[lang] or w.alt[lang] }}</h1>
    {%- if w.meta[lang] %}
    <p class="meta">{{ w.meta[lang] }}</p>
    {%- endif %}
    {{ w.description[lang] | paragraphs | safe }}
    <p class="work__contact"><a href="{{ 'contact' | pageUrl(lang) }}">{{ t.work.question }}</a></p>
    <nav class="pager" aria-label="{{ t.work.pagerLabel }}">
      <span>{% if wp.prev %}<a rel="prev" href="{{ 'work' | pageUrl(lang, wp.prev.id) }}">← {{ t.work.prev }}</a>{% endif %}</span>
      <a href="{{ 'work' | pageUrl(lang) }}">{{ t.work.backToAll }}</a>
      <span>{% if wp.next %}<a rel="next" href="{{ 'work' | pageUrl(lang, wp.next.id) }}">{{ t.work.next }} →</a>{% endif %}</span>
    </nav>
  </div>
</article>
```

```njk file=src/pages/exhibitions.njk
---
layout: base.njk
pagination:
  data: langs
  size: 1
  alias: lang
permalink: "{{ 'exhibitions' | pageUrl(lang) }}"
pageKey: exhibitions
---
{%- import "macros.njk" as m -%}
{%- set t = i18n[lang] -%}
{%- set ex = atelier.exhibitions -%}
<div class="wrap-narrow">
  <h1 class="page-title">{{ t.exhibitions.heading }}</h1>
  <section class="ex-group">
    <h2 class="section-title">{{ t.exhibitions.upcoming }}</h2>
    {%- for e in ex.upcoming %}
    {{ m.exhibition(e, lang, t) }}
    {%- else %}
    <p class="empty">{{ t.exhibitions.noneUpcoming }}</p>
    {%- endfor %}
  </section>
  {%- if ex.past.length %}
  <section class="ex-group">
    <h2 class="section-title">{{ t.exhibitions.past }}</h2>
    {%- for e in ex.past %}
    {{ m.exhibition(e, lang, t) }}
    {%- endfor %}
  </section>
  {%- endif %}
  {%- if ex.other.length %}
  <section class="ex-group">
    <h2 class="section-title">{{ t.exhibitions.other }}</h2>
    {%- for e in ex.other %}
    {{ m.exhibition(e, lang, t) }}
    {%- endfor %}
  </section>
  {%- endif %}
</div>
```

```njk file=src/pages/about.njk
---
layout: base.njk
pagination:
  data: langs
  size: 1
  alias: lang
permalink: "{{ 'about' | pageUrl(lang) }}"
pageKey: about
---
{%- set t = i18n[lang] -%}
<div class="wrap about">
  <img class="about__portrait" src="/assets/img/portrait.webp" width="{{ site.portrait.width }}" height="{{ site.portrait.height }}" alt="{{ t.about.portraitAlt }}">
  <div class="about__text">
    <h1 class="page-title">{{ t.about.heading }}</h1>
    {%- if atelier.texts.about %}
    {{ atelier.texts.about[lang] | paragraphs | safe }}
    {%- endif %}
  </div>
</div>
```

```njk file=src/pages/contact.njk
---
layout: base.njk
pagination:
  data: langs
  size: 1
  alias: lang
permalink: "{{ 'contact' | pageUrl(lang) }}"
pageKey: contact
---
{%- set t = i18n[lang] -%}
{%- set c = site.contact -%}
<div class="wrap-narrow contact">
  <h1 class="page-title">{{ t.contact.heading }}</h1>
  <p class="lead">{{ t.contact.intro }}</p>
  <dl class="contact__list">
    <dt>{{ t.contact.email }}</dt>
    <dd><a href="mailto:{{ c.email }}">{{ c.email }}</a></dd>
    <dt>{{ t.contact.phone }}</dt>
    <dd><a href="{{ c.phoneHref }}">{{ c.phone }}</a></dd>
    <dt>{{ t.contact.address }}</dt>
    <dd>{{ c.street }}<br>{{ c.postal }} {{ c.city }}<br>{{ c.country[lang] }}<br><a href="{{ c.routeUrl }}" rel="noopener">{{ t.contact.route }}</a></dd>
    <dt>{{ t.contact.follow }}</dt>
    <dd><a href="{{ c.instagram.url }}" rel="me noopener">Instagram · {{ c.instagram.handle }}</a><br><a href="{{ c.facebook.url }}" rel="me noopener">Facebook · {{ c.facebook.handle }}</a></dd>
  </dl>
</div>
```

```njk file=src/pages/404.njk
---
layout: base.njk
permalink: /404.html
lang: nl
pageKey: notFound
eleventyExcludeFromCollections: true
---
{%- set t = i18n.nl -%}
<div class="wrap-narrow">
  <h1 class="page-title">{{ t.notFound.heading }}</h1>
  <p>{{ t.notFound.text }} <a href="{{ 'work' | pageUrl('nl') }}">{{ t.notFound.back }}</a></p>
  <p lang="en">{{ i18n.en.notFound.text }} <a href="{{ 'work' | pageUrl('en') }}">{{ i18n.en.notFound.back }}</a></p>
</div>
```

```njk file=src/pages/sitemap.njk
---
permalink: /sitemap.xml
eleventyExcludeFromCollections: true
---
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{%- for key in ['home', 'work', 'exhibitions', 'about', 'contact'] %}{% for lang in langs %}
  <url><loc>{{ key | pageUrl(lang) | absUrl }}</loc></url>
{%- endfor %}{% endfor %}
{%- for p in atelier.workPages %}
  <url><loc>{{ 'work' | pageUrl(p.lang, p.work.id) | absUrl }}</loc></url>
{%- endfor %}
</urlset>
```

```njk file=src/pages/robots.njk
---
permalink: /robots.txt
eleventyExcludeFromCollections: true
---
User-agent: *
Allow: /

Sitemap: {{ '/sitemap.xml' | absUrl }}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, including all `site.test.mjs` tests.

- [ ] **Step 9: Commit**

```bash
git add eleventy.config.js src/ test/filters.test.mjs test/site.test.mjs
git commit -m "feat: bilingual Eleventy site with gallery, work pages, exhibitions, about and contact"
```

---

### Task 9: Look & feel — CSS, small JS, favicon, portrait

**Files:**
- Create: `src/assets/css/style.css`, `src/assets/js/site.js`, `src/assets/favicon.svg`, `src/assets/img/portrait.webp` (generated)
- Test: `test/site.test.mjs` (extend: assets exist in output)

**Interfaces:**
- Consumes: markup classes and data attributes from Task 8 (`.tile` + `--ar`, `[data-filters]`, `[data-tiles]`, `[data-event-strip]`, `[data-dismiss]`, `[data-until]`, `[data-event-card]`).
- Produces: none for later tasks.

- [ ] **Step 1: Write the failing test** — append to `test/site.test.mjs`:

```js
test('stylesheet, script, fonts, favicon and portrait are published', () => {
  for (const file of ['assets/css/style.css', 'assets/js/site.js', 'assets/favicon.svg', 'assets/img/portrait.webp', 'assets/fonts/cormorant-garamond-600.woff2', 'assets/fonts/source-sans-3-400.woff2']) {
    assert.ok(existsSync(join(out, file)), file);
  }
});
```

Run: `npm test`
Expected: FAIL — `assets/css/style.css`

- [ ] **Step 2: Add the stylesheet**

```css file=src/assets/css/style.css
/* Dirk Vermoesen — calm gallery: the work is the hero. Light theme only (colour fidelity of the artworks). */

@font-face { font-family: "Cormorant Garamond"; src: url("../fonts/cormorant-garamond-500.woff2") format("woff2"); font-weight: 500; font-display: swap; }
@font-face { font-family: "Cormorant Garamond"; src: url("../fonts/cormorant-garamond-600.woff2") format("woff2"); font-weight: 600; font-display: swap; }
@font-face { font-family: "Source Sans 3"; src: url("../fonts/source-sans-3-400.woff2") format("woff2"); font-weight: 400; font-display: swap; }
@font-face { font-family: "Source Sans 3"; src: url("../fonts/source-sans-3-600.woff2") format("woff2"); font-weight: 600; font-display: swap; }

:root {
  --paper: #f7f4ee;
  --paper-2: #efeae1;
  --ink: #2b2a28;
  --muted: #6b675f;
  --line: #ddd6ca;
  --accent: #56707f;
  --serif: "Cormorant Garamond", Georgia, "Times New Roman", serif;
  --sans: "Source Sans 3", system-ui, -apple-system, "Segoe UI", sans-serif;
  --gutter: 16px;
  --row-h: 180px;
  color-scheme: light;
}

@media (min-width: 700px) { :root { --gutter: 32px; --row-h: 240px; } }
@media (min-width: 1200px) { :root { --row-h: 280px; } }

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 400 1.0625rem/1.65 var(--sans); }
img { display: block; max-width: 100%; height: auto; }
a { color: inherit; text-decoration-color: var(--line); text-decoration-thickness: 1px; text-underline-offset: 0.2em; }
a:hover { text-decoration-color: currentColor; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
h1, h2, h3 { font-family: var(--serif); font-weight: 500; line-height: 1.15; margin: 0 0 0.5em; }
h1 { font-size: clamp(2rem, 5vw, 2.75rem); }
h2 { font-size: clamp(1.5rem, 3.5vw, 1.9rem); }
h3 { font-size: 1.4rem; }
p { margin: 0 0 1em; }

.wrap { max-width: 1200px; margin-inline: auto; padding-inline: var(--gutter); }
.wrap-narrow { max-width: 720px; margin-inline: auto; padding-inline: var(--gutter); }
.visually-hidden { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: var(--gutter); top: 8px; z-index: 10; padding: 8px 12px; background: var(--paper); }

/* Announcement strip: one quiet line */
.event-strip { background: var(--paper-2); border-bottom: 1px solid var(--line); color: var(--muted); font-size: 0.9rem; }
.event-strip__inner { display: flex; align-items: center; gap: 12px; padding-block: 8px; }
.event-strip p { flex: 1; margin: 0; }
.event-strip a { color: var(--ink); }
.event-strip__label { margin-right: 0.5em; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
.event-strip__close { padding: 2px 8px; border: 0; background: none; color: var(--muted); font-size: 1.25rem; line-height: 1; cursor: pointer; }

/* Header */
.site-header { padding-block: 28px 20px; }
.site-header__inner { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px 32px; }
.wordmark { display: flex; flex-direction: column; text-decoration: none; }
.wordmark__name { font-family: var(--serif); font-size: 1.9rem; font-weight: 600; line-height: 1.1; }
.wordmark__tagline { color: var(--muted); font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; }
.site-nav { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 20px; }
.site-nav ul { display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 0; padding: 0; list-style: none; }
.site-nav a { text-decoration: none; }
.site-nav a[aria-current] { text-decoration: underline; text-decoration-color: var(--accent); }
.lang-switch { padding: 0 6px; border: 1px solid var(--line); border-radius: 2px; color: var(--muted); font-size: 0.85rem; letter-spacing: 0.08em; }

main { padding-bottom: 64px; }
.page-title { margin-top: 24px; }
.section-title { margin: 48px 0 20px; font-size: 1.6rem; }
.meta { color: var(--muted); font-size: 0.95rem; }
.empty { color: var(--muted); }
.eyebrow { margin-bottom: 0.4em; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; }

/* Home */
.hero { max-width: 1200px; margin: 8px auto 0; padding-inline: var(--gutter); }
.hero__image img { width: auto; max-height: 78vh; margin-inline: auto; }
.hero__caption { margin-top: 10px; color: var(--muted); font-size: 0.9rem; text-align: center; }
.intro { margin-top: 40px; font-family: var(--serif); font-size: 1.35rem; line-height: 1.5; text-align: center; }
.event-card { display: grid; gap: 16px; margin-top: 48px; padding-block: 20px; border-block: 1px solid var(--line); }
.event-card h2 { margin-bottom: 0.2em; }
.event-card p:last-child { margin-bottom: 0; }
@media (min-width: 600px) {
  .event-card:has(img) { grid-template-columns: 200px 1fr; align-items: center; }
}
.more { margin-top: 20px; text-align: right; }

/* Tiles: justified rows that keep each work's proportions (never cropped) and the sheet order */
.tiles { display: flex; flex-wrap: wrap; gap: 12px; margin: 0; padding: 0; list-style: none; }
.tiles::after { content: ""; flex-grow: 999; }
.tile { flex-grow: var(--ar); flex-basis: calc(var(--ar) * var(--row-h)); }
.tile[hidden] { display: none; }
.tile a { display: block; }
.tile img { width: 100%; background: var(--paper-2); transition: opacity 0.2s; }
.tile a:hover img { opacity: 0.9; }
@media (max-width: 479px) { .tile { flex-basis: 100%; } }

.filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.filters[hidden] { display: none; }
.filters button { padding: 4px 14px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--muted); font: inherit; font-size: 0.9rem; cursor: pointer; }
.filters button[aria-pressed="true"] { border-color: var(--ink); color: var(--ink); }

/* Work detail */
.work__figure { margin: 8px auto 0; }
.work__figure img { width: auto; max-height: 82vh; margin-inline: auto; }
.work__text { margin-top: 28px; }
.work__contact { margin-top: 28px; color: var(--muted); font-size: 0.95rem; }
.pager { display: flex; justify-content: space-between; gap: 16px; margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 0.95rem; }

/* Exhibitions */
.ex { display: grid; gap: 16px; padding-block: 24px; border-top: 1px solid var(--line); }
@media (min-width: 600px) { .ex:has(.ex__image) { grid-template-columns: 180px 1fr; } }
.ex h3 { margin-bottom: 0.25em; }
.ex__place { color: var(--muted); }
.ex-group .section-title { margin-bottom: 8px; }

/* About */
.about { display: grid; gap: 32px; margin-top: 24px; }
@media (min-width: 800px) { .about { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); align-items: start; } }
.about__portrait { width: 100%; max-width: 420px; }
.about__text .page-title { margin-top: 0; }

/* Contact */
.lead { font-family: var(--serif); font-size: 1.3rem; line-height: 1.5; }
.contact__list { display: grid; gap: 4px 24px; margin: 32px 0 0; }
.contact__list dt { margin-top: 16px; color: var(--muted); font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; }
.contact__list dd { margin: 0; }
@media (min-width: 600px) {
  .contact__list { grid-template-columns: 140px 1fr; }
  .contact__list dt { margin-top: 0; padding-top: 3px; }
  .contact__list dd { margin-bottom: 16px; }
}

/* Footer */
.site-footer { padding-block: 32px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.9rem; }
.site-footer p { margin-bottom: 0.5em; }
.site-footer__name { color: var(--ink); font-family: var(--serif); font-size: 1.2rem; }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
```

- [ ] **Step 3: Add the script**

```js file=src/assets/js/site.js
// Progressive enhancements only; the site works without JavaScript.
(function () {
  var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  // Announcements disappear after their end date, even when the site was not rebuilt.
  document.querySelectorAll('[data-until]').forEach(function (el) {
    if (el.dataset.until < today) el.remove();
  });

  // The strip can be closed; the browser remembers that per event.
  var strip = document.querySelector('[data-event-strip]');
  if (strip) {
    var button = strip.querySelector('[data-dismiss]');
    button.hidden = false;
    button.addEventListener('click', function () {
      strip.remove();
      try {
        localStorage.setItem('event-dismissed-' + strip.dataset.key, '1');
      } catch (e) {}
    });
  }

  // Gallery filter by technique.
  var filters = document.querySelector('[data-filters]');
  var tiles = document.querySelector('[data-tiles]');
  if (filters && tiles) {
    filters.hidden = false;
    filters.addEventListener('click', function (event) {
      var chosen = event.target.closest('button[data-filter]');
      if (!chosen) return;
      filters.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === chosen));
      });
      tiles.querySelectorAll('.tile').forEach(function (tile) {
        tile.hidden = chosen.dataset.filter !== '' && tile.dataset.technique !== chosen.dataset.filter;
      });
    });
  }
})();
```

- [ ] **Step 4: Add favicon and portrait**

```svg file=src/assets/favicon.svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#f7f4ee"/><text x="32" y="42" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="28" fill="#2b2a28">DV</text></svg>
```

The portrait is Dirk's drawn self-portrait, cropped from the photo of his business card. The photo's EXIF says
"rotate 180°" but its pixels are already upright, so sharp's `.rotate()` must NOT be used here.

Run:
```bash
mkdir -p src/assets/img && node --input-type=module -e "
import sharp from 'sharp';
await sharp(process.env.HOME + '/Downloads/IMG_20261011_151944495_HDR.jpg')
  .extract({ left: 2160, top: 620, width: 1520, height: 2027 })
  .resize(750, 1000)
  .webp({ quality: 82 })
  .toFile('src/assets/img/portrait.webp');
"
```
Expected: `src/assets/img/portrait.webp` (750×1000). Open it: the face is upright and no white card corner shows.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Visual check (desktop + phone width)**

Run:
```bash
npm run data:fixtures && npm run build && npx @11ty/eleventy --serve --port=8080 &
google-chrome --headless=new --disable-gpu --window-size=1280,2200 --screenshot=/tmp/home-desktop.png http://localhost:8080/aquarel-atelier/
google-chrome --headless=new --disable-gpu --window-size=390,2400 --screenshot=/tmp/werk-phone.png http://localhost:8080/aquarel-atelier/werk/
```
Expected: calm paper-white layout, wordmark + nav, quiet strip at the top, artworks uncropped in justified rows, no
horizontal scroll at 390 px. Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/assets test/site.test.mjs
git commit -m "feat: calm gallery styling, banner and filter script, favicon and portrait"
```

---

### Task 10: Link check + GitHub Actions workflow

**Files:**
- Create: `scripts/check-links.mjs`, `.github/workflows/build.yml`
- Test: `test/check-links.test.mjs`

**Interfaces:**
- Produces: `extractUrls(html): string[]`, `resolveLink(url, pathPrefix): { skip: true } | { file: string } | { error: string }`, `checkSite(outDir, pathPrefix): Promise<string[]>`; CLI `node scripts/check-links.mjs [outDir]` exits 1 on broken links.

- [ ] **Step 1: Write the failing test**

```js file=test/check-links.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/check-links.mjs'`

- [ ] **Step 3: Implement**

```js file=scripts/check-links.mjs
// Checks that every internal href/src/srcset in the built site points to an existing file.
// Usage: node scripts/check-links.mjs [outputDir]   (default: _site)
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function extractUrls(html) {
  const urls = [];
  for (const [, url] of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) urls.push(url);
  for (const [, set] of html.matchAll(/\ssrcset="([^"]*)"/g)) {
    for (const candidate of set.split(',')) urls.push(candidate.trim().split(/\s+/)[0]);
  }
  return urls;
}

export function resolveLink(url, pathPrefix = '/') {
  if (!url.startsWith('/') || url.startsWith('//')) return { skip: true };
  const path = decodeURI(url.split(/[?#]/)[0]);
  if (!path.startsWith(pathPrefix)) return { error: `outside path prefix ${pathPrefix}` };
  const rel = path.slice(pathPrefix.length);
  return { file: rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel };
}

export async function checkSite(outDir, pathPrefix) {
  const problems = [];
  const pages = (await readdir(outDir, { recursive: true })).filter((f) => f.endsWith('.html')).sort();
  for (const page of pages) {
    const html = await readFile(join(outDir, page), 'utf8');
    for (const url of extractUrls(html)) {
      const result = resolveLink(url, pathPrefix);
      if (result.error) problems.push(`${page}: ${url} (${result.error})`);
      else if (result.file && !existsSync(join(outDir, result.file))) problems.push(`${page}: ${url} (missing)`);
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = process.argv[2] ?? '_site';
  const { pathPrefix } = JSON.parse(readFileSync('site.config.json', 'utf8'));
  const problems = await checkSite(outDir, pathPrefix);
  if (problems.length) {
    console.error(`Broken links:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('All internal links OK.');
}
```

- [ ] **Step 4: Run tests and the checker on a real build**

Run: `npm test && npm run data:fixtures && npm run build && npm run check-links`
Expected: tests PASS, then `All internal links OK.`

- [ ] **Step 5: Add the workflow**

```yaml file=.github/workflows/build.yml
name: Build & deploy

on:
  workflow_dispatch: # also triggered by "Website publiceren" in the Sheet
  push:
    branches: [main]
  schedule:
    - cron: "17 2 * * *" # nightly fallback

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: build-and-deploy
  cancel-in-progress: false

env:
  HAS_GOOGLE: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_KEY != '' }}

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      deploy: ${{ steps.flag.outputs.deploy }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test

      - name: Sanity build with sample content
        run: |
          npm run data:fixtures
          npm run build
          npm run check-links

      - id: flag
        run: echo "deploy=$HAS_GOOGLE" >> "$GITHUB_OUTPUT"

      - name: Install HEIC converter
        if: env.HAS_GOOGLE == 'true'
        run: sudo apt-get update && sudo apt-get install -y libheif-examples

      - name: Restore photo cache
        if: env.HAS_GOOGLE == 'true'
        uses: actions/cache@v4
        with:
          path: |
            .cache/originals
            .cache/originals.json
            .cache/images
          key: photos-${{ github.run_id }}
          restore-keys: photos-

      - name: Fetch content from Google Drive
        if: env.HAS_GOOGLE == 'true'
        env:
          GOOGLE_SERVICE_ACCOUNT_KEY: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_KEY }}
        run: npm run fetch

      - name: Prepare content and images
        if: env.HAS_GOOGLE == 'true'
        run: npm run data:google

      - name: Save new work IDs
        if: env.HAS_GOOGLE == 'true'
        run: |
          if [ -n "$(git status --porcelain -- content/ids.csv)" ]; then
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add content/ids.csv
            git commit -m "content: register new works"
            git pull --rebase
            git push
          fi

      - name: Build site
        if: env.HAS_GOOGLE == 'true'
        run: |
          rm -rf _site
          npm run build
          npm run check-links

      - uses: actions/upload-pages-artifact@v3
        if: env.HAS_GOOGLE == 'true'
        with:
          path: _site

  deploy:
    needs: build
    if: needs.build.outputs.deploy == 'true'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Until the Google secret exists the workflow only tests and does a sample build; nothing is deployed, so the sample
content never goes public.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-links.mjs test/check-links.test.mjs .github/workflows/build.yml
git commit -m "ci: link check and build/deploy workflow for GitHub Pages"
```

---

### Task 11: Fetch from Google

**Files:**
- Create: `scripts/fetch.mjs`
- Test: `test/fetch.test.mjs`

**Interfaces:**
- Consumes: `originalName`, `prune` (Task 6), `isImageFile` (Task 4).
- Produces: `matchTabs(titles: string[]): { werken, tentoonstellingen, teksten }` (title or null), `findFolder(children, name)`; CLI writes `.cache/raw.json` (shape in Task 7), `.cache/originals/<driveId><ext>`, `.cache/originals.json` ({ driveId: modifiedTime }).

- [ ] **Step 1: Write the failing test**

```js file=test/fetch.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTabs, findFolder } from '../scripts/fetch.mjs';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../scripts/fetch.mjs'`

- [ ] **Step 3: Implement**

```js file=scripts/fetch.mjs
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
```

- [ ] **Step 4: Run tests and the missing-config path**

Run: `npm test && node scripts/fetch.mjs; echo "exit=$?"`
Expected: tests PASS; fetch prints `Fill in google.folderId and google.sheetId in site.config.json` and `exit=1`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch.mjs test/fetch.test.mjs
git commit -m "feat: fetch Sheet and photos from Google Drive"
```

---

### Task 12: Sheet menu (Apps Script) and documentation

**Files:**
- Create: `apps-script/Code.gs`, `docs/setup.md`, `docs/handleiding-dirk.md`, `README.md`

**Interfaces:**
- Consumes: workflow file name `build.yml` (Task 10), Sheet headers (Tasks 4–5), folder names `Werken` / `Tentoonstellingen`.
- Produces: Sheet menu *Website* → *Nieuwe foto's ophalen*, *Website publiceren*; editor function `setupSheet()`.

- [ ] **Step 1: Add the Apps Script**

```js file=apps-script/Code.gs
/**
 * Menu "Website" for the Google Sheet "Website inhoud" (Dirk Vermoesen).
 * Install: see docs/setup.md. The GitHub token lives in Project settings → Script properties → GITHUB_TOKEN.
 */
var REPO = 'AlexanderBoucquey/aquarel-atelier';
var WORKFLOW = 'build.yml';
var WORKS_FOLDER = 'Werken';
var TECHNIQUES = ['Aquarel', 'Tekening', 'Olieverf'];
var HEADERS = {
  Werken: ['Bestand', 'ID', 'Titel NL', 'Titel EN', 'Techniek', 'Jaar', 'Afmetingen', 'Beschrijving NL', 'Beschrijving EN', 'Tonen', 'Uitgelicht'],
  Tentoonstellingen: ['Titel NL', 'Titel EN', 'Van', 'Tot', 'Plaats', 'Adres', 'Tekst NL', 'Tekst EN', 'Afbeelding', 'Link', 'Tonen', 'Banner'],
  Teksten: ['Key', 'NL', 'EN'],
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Website')
    .addItem("Nieuwe foto's ophalen", 'menuFetchPhotos')
    .addItem('Website publiceren', 'menuPublish')
    .addToUi();
}

function menuFetchPhotos() {
  var added = addNewPhotoRows_();
  SpreadsheetApp.getUi().alert(added === 0
    ? "Geen nieuwe foto's gevonden."
    : added + " nieuwe foto('s) bovenaan toegevoegd. Vul gerust een titel of andere info in (alles is optioneel).");
}

function menuPublish() {
  var ui = SpreadsheetApp.getUi();
  var added = addNewPhotoRows_();
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    ui.alert('Publiceren is nog niet ingesteld. Laat het even weten aan Alexander.');
    return;
  }
  var response = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ ref: 'main' }),
  });
  if (response.getResponseCode() === 204) {
    ui.alert('Website wordt bijgewerkt, klaar binnen ±2 minuten.' + (added ? '\n\n' + added + " nieuwe foto('s) werden aan de lijst toegevoegd." : ''));
  } else {
    ui.alert('Publiceren lukte niet (code ' + response.getResponseCode() + '). Probeer het later opnieuw of laat het weten aan Alexander.');
  }
}

/** Adds a row at the top of "Werken" for every photo in the Werken folder that has no row yet. */
function addNewPhotoRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Werken');
  if (!sheet) throw new Error('Tabblad "Werken" niet gevonden.');
  var parent = DriveApp.getFileById(ss.getId()).getParents().next();
  var folders = parent.getFoldersByName(WORKS_FOLDER);
  if (!folders.hasNext()) throw new Error('Map "' + WORKS_FOLDER + '" niet gevonden naast deze Sheet.');
  var folder = folders.next();

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  var col = function (name) {
    var i = headers.indexOf(name);
    if (i < 0) throw new Error('Kolom "' + name + '" ontbreekt in het tabblad Werken.');
    return i + 1;
  };
  var fileCol = col('bestand');
  var idCol = col('id');
  var tonenCol = col('tonen');
  var featuredCol = col('uitgelicht');
  var techniqueCol = col('techniek');

  var knownIds = {};
  var knownNames = {};
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, idCol, lastRow - 1, 1).getValues().forEach(function (r) {
      if (r[0]) knownIds[String(r[0]).trim()] = true;
    });
    sheet.getRange(2, fileCol, lastRow - 1, 1).getValues().forEach(function (r) {
      if (r[0]) knownNames[String(r[0]).trim().toLowerCase()] = true;
    });
  }

  var fresh = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var isImage = f.getMimeType().indexOf('image/') === 0 || /\.(jpe?g|png|webp|heic|heif|tiff?|avif|gif)$/i.test(f.getName());
    if (isImage && !knownIds[f.getId()] && !knownNames[f.getName().trim().toLowerCase()]) fresh.push(f);
  }
  if (fresh.length === 0) return 0;
  fresh.sort(function (a, b) {
    return b.getDateCreated() - a.getDateCreated();
  });

  sheet.insertRowsBefore(2, fresh.length);
  fresh.forEach(function (f, i) {
    var row = 2 + i;
    sheet.getRange(row, fileCol).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(f.getName()).setLinkUrl(f.getUrl()).build());
    sheet.getRange(row, idCol).setValue(f.getId());
  });
  sheet.getRange(2, tonenCol, fresh.length, 1).insertCheckboxes().check();
  sheet.getRange(2, featuredCol, fresh.length, 1).insertCheckboxes().uncheck();
  sheet.getRange(2, techniqueCol, fresh.length, 1).setDataValidation(techniqueRule_());
  return fresh.length;
}

function techniqueRule_() {
  return SpreadsheetApp.newDataValidation().requireValueInList(TECHNIQUES, true).setAllowInvalid(true).build();
}

/** Run once from the Apps Script editor: creates the three tabs with their columns. Existing tabs are left alone. */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    if (ss.getSheetByName(name)) return;
    var sheet = ss.insertSheet(name);
    var headers = HEADERS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    if (name === 'Werken') {
      sheet.hideColumns(headers.indexOf('ID') + 1);
      sheet.getRange(2, headers.indexOf('Techniek') + 1, 999, 1).setDataValidation(techniqueRule_());
    }
    if (name === 'Tentoonstellingen') {
      sheet.getRange(2, headers.indexOf('Tonen') + 1, 200, 1).insertCheckboxes().check();
      sheet.getRange(2, headers.indexOf('Banner') + 1, 200, 1).insertCheckboxes();
      sheet.getRange(2, headers.indexOf('Van') + 1, 200, 2).setNumberFormat('dd/mm/yyyy');
    }
    if (name === 'Teksten') {
      sheet.getRange(2, 1, 2, 1).setValues([['home_intro'], ['about']]);
    }
  });
  ['Blad1', 'Sheet1'].forEach(function (name) {
    var blank = ss.getSheetByName(name);
    if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  });
}
```

Run: `cp apps-script/Code.gs "$TMPDIR/Code.js" 2>/dev/null || cp apps-script/Code.gs /tmp/Code.js; node --check /tmp/Code.js && echo syntax-ok`
Expected: `syntax-ok`

- [ ] **Step 2: Add the setup guide for Alexander**

````markdown file=docs/setup.md
# Setup — aquarel-atelier

One-time setup to connect Dirk's Google Drive to the site. Allow ±1 hour, together with Dirk for step 1.

## 1. Google Drive + Sheet (Dirk's Google account)

1. Dirk needs a free Google account; it can use his existing e-mail address (create it via accounts.google.com → *Use my current email address instead*).
2. In Dirk's Drive, create the folder **Website Dirk Vermoesen** with two subfolders: **Werken** and **Tentoonstellingen**.
3. In that folder, create a Google Sheet **Website inhoud**. *File → Settings → Locale: Belgium* (so 12/11/2026 means 12 November).
4. Share the folder with Alexander as **Editor**.
5. In the Sheet: *Extensions → Apps Script*. Replace the code with `apps-script/Code.gs`, save, choose `setupSheet` and click *Run* (accept the permissions). Reload the Sheet: the menu **Website** appears.

## 2. Google Cloud service account (read-only access for the build)

1. console.cloud.google.com → create project `aquarel-atelier` (no billing needed).
2. *APIs & Services → Library*: enable **Google Drive API** and **Google Sheets API**.
3. *IAM & Admin → Service accounts → Create*: name `website-build`, no roles.
4. Open it → *Keys → Add key → JSON*. Keep the downloaded file safe and never commit it.
5. Share the folder **Website Dirk Vermoesen** with the service account's e-mail address as **Viewer**.

## 3. GitHub

1. Repository `AlexanderBoucquey/aquarel-atelier` must be **public** (free Pages + Actions).
2. *Settings → Secrets and variables → Actions → New repository secret*: `GOOGLE_SERVICE_ACCOUNT_KEY` = the full JSON file contents.
3. *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
4. In `site.config.json` fill in `google.folderId` (from the folder URL `…/folders/<id>`) and `google.sheetId` (from `…/spreadsheets/d/<id>/edit`). Commit and push to `main`: the workflow fetches, builds and deploys.

## 4. "Website publiceren" button

1. GitHub → *Settings → Developer settings → Fine-grained tokens → Generate*: repository access **only** `aquarel-atelier`, permission **Actions: Read and write**, expiry 1 year. Put a renewal reminder in your calendar.
2. Apps Script editor → *Project settings → Script properties*: add `GITHUB_TOKEN` with the token.
3. In the Sheet: *Website → Website publiceren* → the *Actions* tab on GitHub shows a run.

## 5. Domain (once bought)

1. DNS at the registrar: `A` records for the apex to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, and `CNAME www → alexanderboucquey.github.io`.
2. *Settings → Pages → Custom domain*: the domain, then *Enforce HTTPS*.
3. `site.config.json`: `"baseUrl": "https://<domain>"`, `"pathPrefix": "/"`. Commit and push.

## Local development

```bash
npm ci
npm run dev            # sample content from fixtures/, http://localhost:8080/aquarel-atelier/
npm test
```

With real content (needs the key file):

```bash
export GOOGLE_SERVICE_ACCOUNT_KEY="$(cat ~/keys/aquarel-atelier-key.json)"
npm run fetch && npm run data:google && npm run build
```

A local run reads `content/ids.csv` but never writes it; new IDs are only saved by the GitHub workflow.

## Acceptance check (after setup)

Upload a HEIC photo from an iPhone, a JPG without row, hide a work, leave English empty for one work, add a past
and an upcoming exhibition with *Banner* ticked → *Website publiceren*. Check: all photos upright, hidden work
gone, English pages fall back to Dutch, strip + homepage card visible, strip closes with ×. Share a work link in
Facebook's Sharing Debugger (developers.facebook.com/tools/debug) to see the preview, and run Lighthouse (mobile).
````

- [ ] **Step 3: Add Dirk's one-page guide (Dutch)**

````markdown file=docs/handleiding-dirk.md
# Zo werk je je website bij

Alles staat in één map in Google Drive: **Website Dirk Vermoesen**.

## Een werk toevoegen

1. Zet de foto in de map **Werken**. Gewoon de foto van je gsm of camera; je hoeft niets om te zetten.
2. Open de Sheet **Website inhoud** → menu **Website** → **Website publiceren**.
3. Klaar: binnen ±2 minuten staat de foto op je website.

Een titel of uitleg erbij? De foto staat nu bovenaan in het tabblad **Werken**. Vul in wat je wil (alles is
optioneel) en kies opnieuw **Website publiceren**.

## Tabblad Werken

| Kolom | Wat |
|---|---|
| Bestand | De foto (wordt automatisch ingevuld) |
| Titel NL / Titel EN | Titel van het werk |
| Techniek | Aquarel, Tekening of Olieverf (iets anders typen mag ook) |
| Jaar, Afmetingen | Bv. 2024 en 30 x 40 cm |
| Beschrijving NL / EN | Wat uitleg bij het werk |
| Tonen | Uitvinken = het werk is niet meer te zien op de website |
| Uitgelicht | Aanvinken = het werk komt op de startpagina |

- **Volgorde**: de website toont de werken in de volgorde van de rijen. Sleep een rij (aan het rijnummer links) naar boven of beneden.
- **Engels leeg laten mag**: de Engelse website toont dan de Nederlandse tekst.

## Tentoonstelling of nieuws toevoegen (tabblad Tentoonstellingen)

Vul een nieuwe rij in: titel, **Van** en **Tot** (bv. 12/11/2026), plaats, adres, tekst en eventueel een link.
Een affiche of foto erbij? Zet die in de map **Tentoonstellingen** en typ de bestandsnaam in de kolom
**Afbeelding**.

- **Banner** aanvinken: een rustige melding bovenaan de website en een blokje op de startpagina. Die verdwijnt vanzelf na de einddatum.
- **Tonen** uitvinken: de tentoonstelling helemaal verbergen.

## Teksten (tabblad Teksten)

- **home_intro**: de tekst op de startpagina.
- **about**: jouw verhaal op de pagina "Over Dirk".

Een nieuwe alinea in een cel: **Ctrl + Enter** (Mac: **⌘ + Enter**), twee keer voor een lege regel.

## Iets verschijnt niet?

- Wacht ±2 minuten en ververs de pagina.
- Datum goed getypt? Dag/maand/jaar, bv. 12/11/2026.
- Nog steeds niet? Stuur Alexander een berichtje: hij ziet precies wat er misliep.
````

- [ ] **Step 4: Add the README**

````markdown file=README.md
# aquarel-atelier

Website of Dirk Vermoesen — Aquarel · Tekening · Olieverf. Static, bilingual (NL/EN), built with Eleventy and
deployed to GitHub Pages. Dirk maintains the content in Google Drive + a Google Sheet.

- Design: [docs/design.md](docs/design.md)
- Implementation plan: [docs/implementation-plan.md](docs/implementation-plan.md)
- One-time setup (Google, GitHub, domain): [docs/setup.md](docs/setup.md)
- Guide for Dirk (Dutch): [docs/handleiding-dirk.md](docs/handleiding-dirk.md)

```bash
npm ci
npm run dev     # sample content from fixtures/
npm test
```

How it works: `scripts/fetch.mjs` (Google → `.cache/`) → `scripts/build-data.mjs` (content + WebP images) →
Eleventy (`src/`) → `_site/`. The workflow in `.github/workflows/build.yml` runs this on every push, nightly, and
when Dirk clicks *Website publiceren* in the Sheet.
````

- [ ] **Step 5: Final verification**

Run: `npm test && npm run data:fixtures && npm run build && npm run check-links`
Expected: all tests PASS, `All internal links OK.`

- [ ] **Step 6: Commit**

```bash
git add apps-script/Code.gs docs/setup.md docs/handleiding-dirk.md README.md
git commit -m "docs: Sheet menu script, setup guide, Dirk's guide and README"
```
