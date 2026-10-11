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
