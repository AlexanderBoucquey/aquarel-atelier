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
