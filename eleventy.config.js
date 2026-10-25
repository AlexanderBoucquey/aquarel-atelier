import { readFileSync } from 'node:fs';
import { HtmlBasePlugin } from '@11ty/eleventy';
import { pageUrl, absoluteUrl, dateRange, paragraphs, srcset, imgSrc, tileSizes } from './src/_lib/filters.js';

const config = JSON.parse(readFileSync('site.config.json', 'utf8'));

const fonts = (pkg, name, weights) =>
  Object.fromEntries(weights.map((w) => [`node_modules/@fontsource/${pkg}/files/${pkg}-latin-${w}-normal.woff2`, `assets/fonts/${name}-${w}.woff2`]));

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true });

  eleventyConfig.addPassthroughCopy({
    'src/assets': 'assets',
    '.cache/site-img': 'img',
    '.cache/site-pdf': 'pdf',
    ...fonts('cormorant-garamond', 'cormorant-garamond', [500, 600]),
    ...fonts('source-sans-3', 'source-sans-3', [400, 600]),
  });

  eleventyConfig.addFilter('pageUrl', pageUrl);
  eleventyConfig.addFilter('absUrl', (path) => absoluteUrl(path, config.baseUrl, config.pathPrefix));
  eleventyConfig.addFilter('dateRange', (from, to, lang, short = false) => dateRange(from, to, lang, { short }));
  eleventyConfig.addFilter('paragraphs', paragraphs);
  eleventyConfig.addFilter('srcset', srcset);
  eleventyConfig.addFilter('imgSrc', imgSrc);
  eleventyConfig.addFilter('tileSizes', tileSizes);

  return {
    dir: { input: 'src', includes: '_includes', data: '_data' }, // output: Eleventy's default _site (a config value would override the API's output dir)
    templateFormats: ['njk'],
    pathPrefix: config.pathPrefix,
  };
}
