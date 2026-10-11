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

const warnings = [...(raw.warnings ?? []), ...content.warnings, ...imageWarnings];
const banner = site.banner ? `, banner: "${site.banner.title.nl}"` : '';
const summary = [
  `Gepubliceerd: ${site.works.length} werken, ${site.exhibitions.upcoming.length} komende en ${site.exhibitions.past.length} voorbije tentoonstellingen${banner}.`,
  ...(added.length ? [`Nieuwe werken geregistreerd: ${added.length}.`] : []),
  ...(warnings.length ? ['', 'Aandachtspunten:', ...warnings.map((w) => `- ${w}`)] : ['Geen aandachtspunten.']),
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Website-inhoud\n\n${summary}\n`);
