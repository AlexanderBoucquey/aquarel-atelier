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

/** Plain text from the Sheet → escaped HTML paragraphs, one per line (empty lines are skipped). */
export function paragraphs(value) {
  if (!value) return '';
  return String(value)
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
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

// Widest a gallery tile can get, per unit of aspect ratio, from each breakpoint up: row height (--row-h in
// style.css) × 1.7, because justified rows stretch tiles to fill the line. 1136px is the widest content width.
const TILE_WIDTH_PER_AR = [[1200, 476], [700, 408], [480, 306]];
const CONTENT_WIDTH = 1136;

/** sizes attribute for a gallery tile, so the browser picks a sharp enough variant. */
export function tileSizes(image) {
  const sizes = TILE_WIDTH_PER_AR.map(([minWidth, perAr]) => `(min-width: ${minWidth}px) ${Math.min(CONTENT_WIDTH, Math.ceil((perAr * image.width) / image.height))}px`);
  return [...sizes, '100vw'].join(', ');
}
