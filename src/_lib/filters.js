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
