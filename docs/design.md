# Aquarel-atelier — website Dirk Vermoesen — Design

**Status:** Approved · 2026-10-11
**Key decisions:** approach A (build-time sync), all fields optional, own UUIDs in the repo, Google Sheet as data
file, event banner (strip + homepage card, calm) with *Tonen*/*Banner* toggles.

## Brief

| | |
|---|---|
| **Who** | Dirk Vermoesen — Aquarel · Tekening · Olieverf, Brasschaat (same client as `vioolbouw`, separate brand) |
| **Goal** | Show his work online, announce exhibitions/news, make it easy to contact him |
| **Sections** | Home, Gallery, Exhibitions & news, About, Contact |
| **Languages** | Dutch (default) + English; empty English text falls back to Dutch |
| **Maintained by** | Dirk himself, via Google Drive + Google Sheets — no code, no CMS login |
| **Hosting** | GitHub Pages, public repo, new custom domain |
| **Later, not now** | Selling works (status/price per work), contact form, analytics, French |

**Contact details (from business card):** Veldstraat 258, 2930 Brasschaat, Belgium · dirkvermoesen@hotmail.com ·
+32 489 91 90 14 · Facebook `dirk.vermoesen` · Instagram `vermoesen.dirk`

## Chosen approach — A: build-time sync

Dirk edits content in Google. A GitHub Action pulls it, converts photos to WebP, generates static NL/EN pages
and deploys them to GitHub Pages. The live site never calls Google, so a mistake in Drive cannot break it: the
last good build stays online.

```
Dirk ──uploads──▶ Drive folder "Werken/"            ┐
Dirk ──fills in─▶ Sheet "Website inhoud"            ├──▶ GitHub Action ──▶ GitHub Pages ──▶ visitors
Dirk ──clicks──▶ Sheet menu "Website publiceren" ───┘     (fetch · WebP · build · deploy)
```

Rejected — B (browser fetches Drive/Sheet live): slower gallery, no WebP, relies on undocumented Drive image
URLs, no social-media link previews, Dirk's mistakes go live instantly.

**Cost:** €0 except the domain (~€10–20/year). Drive/Sheets APIs, Apps Script, GitHub Pages and Actions (public
repo) are free.

## 1. Dirk's workflow & content model

**Drive folder** `Website Dirk Vermoesen` (owned by Dirk, shared *Editor* with Alexander and *Viewer* with the
build's service account; not public):

- `Werken/` — photos of works. Any format: JPG, PNG, HEIC (iPhone), WebP. Dirk never converts anything.
- `Tentoonstellingen/` — optional images for exhibitions (posters, venue photos); same formats.
- `Website inhoud` — Google Sheet with three tabs:

**Tab `Werken`** — one row per work. Gallery order = row order (Dirk can drag rows).

| Column | Notes |
|---|---|
| Bestand | Link to the photo in Drive (filled in by the script); a manually added row may hold the file name instead |
| ID | Drive file ID, hidden column (filled in by the script). Rows are matched on ID, so renaming the file is safe; without ID, matched on file name |
| Titel NL / Titel EN | |
| Techniek | Dropdown: Aquarel · Tekening · Olieverf |
| Jaar · Afmetingen | Free text, e.g. `2024` · `30 x 40 cm` |
| Beschrijving NL / EN | Optional |
| Tonen ☑ | Untick to hide a work without deleting it (ticked by default) |
| Uitgelicht ☑ | Shown on the homepage |

**Every column is optional, including the title.** A photo in `Werken/` is published unless its row has *Tonen*
unticked; a photo without any row is published too (image only). Dirk and Alexander both edit this Sheet:
changing a field afterwards (e.g. hiding a work) = edit the cell → *Website publiceren*.
Future sales columns (*Status*: te koop / verkocht, *Prijs*) can be added without restructuring.

**Tab `Tentoonstellingen`** — Titel NL/EN · Van · Tot · Plaats · Adres · Tekst NL/EN · Afbeelding (optional,
file name in `Tentoonstellingen/`) · Link · **Tonen ☑** · **Banner ☑**. Split automatically into *upcoming* and
*past* by date (Europe/Brussels). A news item is a row without *Tot*. All columns optional; fully empty rows are
skipped, rows without any date are listed after the dated ones in Sheet order.

- **Tonen ☑** (ticked by default) — untick to hide an event entirely, e.g. once it's over.
- **Banner ☑** (unticked by default) — tick to announce the event on the site (see §2 *Event banner*). Switches
  itself off after *Tot* (or *Van* if there is no *Tot*), even if Dirk forgets to untick it.

**What Dirk can adjust himself, in summary:**

| Area | What |
|---|---|
| Works | Add/remove photos · all texts NL/EN · technique · year · size · description · show/hide · featured on homepage · gallery order |
| Exhibitions & news | Add/edit items · image · show/hide · announce with banner |
| Texts | Homepage intro · about-me bio |
| Not Dirk (repo) | Contact details · layout & colours · menu · fixed UI labels · portrait |

**Tab `Teksten`** — Key · NL · EN. Keys: `home_intro`, `about`. Lets Dirk edit his bio himself.

**Sheet menu "Website"** (Apps Script, bound to the Sheet):

1. **Nieuwe foto's ophalen** — inserts a row at the top for every photo in `Werken/` that has no row yet
   (link + hidden ID pre-filled, *Tonen* ticked). Dirk fills in the title etc.
2. **Website publiceren** — runs *Nieuwe foto's ophalen* first, then triggers the build; shows "Website wordt
   bijgewerkt, klaar binnen ±2 minuten".

**Dirk's routine:** upload photo → (optionally fill in title etc.) → *Website publiceren*.

**Identity (internal, in the repo):** `content/ids.csv` maps each photo's Drive file ID to our own UUID v4
(`uuid,drive_id,file_name,first_seen`). The build appends a row whenever it meets a new Drive file ID and
commits the file back to `main`. Rows are never edited, deleted or reused. Dirk has no access to the repo, and
Drive file IDs are assigned by Google and survive renaming, so nothing Dirk does in Drive or the Sheet can
change a work's ID or URL. At worst a Sheet row gets detached from its photo: the photo then shows without
text and the build summary lists a warning.

A one-page Dutch instruction sheet ("Zo werk je je website bij") is part of the delivery.

## 2. Site structure & pages

Dutch at the root, English under `/en/`. Header has a language switch linking to the same page in the other
language.

| Page | NL | EN | Content |
|---|---|---|---|
| Home | `/` | `/en/` | Featured work as hero, intro text, event card (only when an event has *Banner* ☑), *Uitgelicht* works |
| Gallery | `/werk/` | `/en/work/` | Grid of all published works, filter by technique |
| Work detail | `/werk/<id>/` | `/en/work/<id>/` | Large image, title, technique, year, size, description, prev/next, "Interesse? Neem contact op" |
| Exhibitions | `/tentoonstellingen/` | `/en/exhibitions/` | Upcoming first, then past |
| About | `/over/` | `/en/about/` | Bio (`Teksten.about`) + portrait |
| Contact | `/contact/` | `/en/contact/` | Address, `tel:` and `mailto:` links, Facebook, Instagram, "Route" link to Google Maps |
| 404 | `/404.html` | | Link back to gallery |

Decisions:

- **Detail page per work** (no lightbox): every work gets a shareable link with a proper preview on
  Facebook/Instagram/WhatsApp (Open Graph image + title).
- **`<id>`** = first 8 characters of the work's UUID (e.g. `/werk/3f2a9c1e/`), checked for collisions when the
  UUID is generated. URLs never change, whatever happens to titles or file names.
- **Missing texts:** the heading is left out; page title and alt text fall back to "Werk van Dirk Vermoesen" /
  "Work by Dirk Vermoesen", plus technique and year when known.
- **Images never cropped** in the grid: paintings keep their own proportions (CSS columns layout).
- **Technique filter** is a small script; without JavaScript all works are shown.
- **No cookies, no tracking, no embedded Google Maps or Google Fonts** → no cookie banner needed (GDPR).
- **SEO:** per-page title + description, `hreflang` NL/EN, Open Graph tags, `sitemap.xml`, `robots.txt`,
  alt text = title + technique (or the fallback above).

**Event banner — calm, never pushy:**

- **Strip:** one line of small text at the top of every page except the exhibitions page, e.g.
  "Tentoonstelling *Licht op water* · 12–20 nov · Brasschaat → meer info". Page colours, no bright accent, no
  animation, no countdown. A small **×** closes it; the browser remembers that per event (localStorage, keyed
  by a hash of title + date; if storage is unavailable the strip simply shows again).
- **Homepage card:** below the hero and intro, styled like the rest of the content, with the event image if set.
  Never replaces or covers the artwork.
- **At most one event** is announced: the soonest upcoming one with *Banner* ☑.
- **Auto-off:** the build leaves out events past their end date, and a few lines of page JS hide the strip and
  card after that date as well, so it disappears on time even without a rebuild.
- Nothing is announced unless Dirk ticks *Banner*; otherwise events only appear on the exhibitions page.

## 3. Build pipeline

**Stack:** Eleventy (static site generator, outputs plain HTML) · Nunjucks templates · plain CSS · `sharp` for
images · `googleapis` for Drive/Sheets · Node LTS.

**Repo layout:**

```
src/                 templates, pages, css, js, i18n strings (nl.json / en.json for fixed UI labels)
src/_data/           content JSON, generated at build time (git-ignored)
content/ids.csv      uuid ↔ Drive file ID registry, append-only, committed by the build
scripts/fetch.mjs    read Sheet tabs + list both folders → normalized works.json, exhibitions.json, texts.json
scripts/ids.mjs      assign UUIDs to new Drive file IDs, append to content/ids.csv
scripts/images.mjs   download new/changed photos → WebP 480/960/1600 px + 1200×630 JPEG for Open Graph
scripts/content.mjs  pure functions: validation, NL→EN fallback, visibility, joins, upcoming/past split, banner pick
apps-script/         Code.gs for the Sheet menu (copied into the Sheet manually; versioned here)
fixtures/            sample content + images for local development and CI tests
.github/workflows/   build.yml
```

**Images:** auto-rotate, strip all metadata (removes GPS location from phone photos), WebP quality ~80. HEIC is
converted first with `heif-convert` (installed on the runner), because `sharp` cannot read iPhone HEIC.
Processed images are cached between runs, keyed by Drive file ID + modified time, so only new/changed photos
are processed.

**Workflow `build.yml`** — triggers:

| Trigger | Purpose |
|---|---|
| `workflow_dispatch` | Called by the *Website publiceren* menu; also usable manually |
| `push` to `main` | Code/design changes |
| `schedule` nightly | Fallback if Dirk forgets to publish. GitHub disables schedules after 60 days without repo activity; publishing still works. |

Steps: fetch → assign IDs (commit `content/ids.csv` if changed) → images → content validation → Eleventy build →
deploy with `actions/deploy-pages`. Images are **not** committed to git; the repo stays small. The workflow runs
in a single `concurrency` group so two builds never write `ids.csv` at the same time; the ID commit uses the
workflow's own token, which does not trigger another run.

**Secrets & access:**

| What | Where | Scope |
|---|---|---|
| Google service account key | GitHub Secret `GOOGLE_SERVICE_ACCOUNT_KEY` | Read-only on Dirk's folder (shared with it) |
| Sheet ID, folder ID | `site.config.json` in repo | Not secret |
| GitHub fine-grained token | Apps Script *Script Properties* (never in the Sheet itself) | This repo only, *Actions: write* only → can trigger a build, cannot change code. Expires ≤ 1 year → renewal reminder |

**Error handling:**

- **Content problems** (row whose photo can't be found, two rows for the same photo, unparseable date) → the
  row is ignored (its photo, if any, still shows), warning listed in the GitHub run summary. The build continues.
- **Technical problems** (Google unreachable, bad credentials, build error) → build fails, nothing is deployed,
  the previous version stays live. GitHub emails Alexander on failure.
- Dirk gets no technical errors; if something he added doesn't appear, the run summary explains why.

## 4. Look & feel (proposal — to refine with mockups)

- **The work is the hero:** calm layout, lots of whitespace, no visual noise competing with the paintings.
- **Never pushy:** no pop-ups, modals, newsletter prompts, "NEW!" labels, auto-playing slideshows or sales
  language anywhere on the site. Announcements stay quiet (see §2 *Event banner*).
- **Palette:** warm off-white "watercolour paper" background, dark graphite text, one muted accent; grey tones
  echo his business card.
- **Type:** elegant serif for headings + clean sans-serif for text, both self-hosted.
- **Identity:** wordmark "Dirk Vermoesen" with tagline "Aquarel · Tekening · Olieverf"; his drawn
  self-portrait (from the business card) on the About page and as favicon source.
- **Mobile-first**, responsive grid 1 → 2 → 3 → 4 columns.
- Light theme only (colour fidelity of the artworks).

## 5. Testing

- **Unit tests** (`node:test`) for `scripts/content.mjs` and `scripts/ids.mjs`: visibility rule (no row, empty
  row, *Tonen* unticked), EN→NL fallback and title-less fallbacks, row↔photo join (by ID, by file name, detached),
  ID registry (append-only, stable across runs, 8-char collision), upcoming/past split around midnight Brussels
  time, event *Tonen*/*Banner* (only one announced, soonest wins, off after end date), validation warnings.
- **CI build against `fixtures/`** on every push (no Google credentials needed), plus an internal link check.
- **Manual acceptance** with a test Sheet + folder: full Dirk routine incl. HEIC photo, hidden work, EN left
  empty, past and upcoming exhibition; check link preview via Facebook's sharing debugger; Lighthouse on mobile.

## Open questions

1. **Domain name** — e.g. `dirkvermoesen.be`; to buy before go-live.
2. **Techniques list** — only Aquarel · Tekening · Olieverf, or also e.g. *Gemengde techniek*?
3. **Initial content from Dirk** — first photos, bio text (NL, optionally EN), portrait image.
4. **Google account** — Dirk creates a free Google account (can use his Hotmail address); Alexander sets up the
   folder, Sheet and service account with him.

## Out of scope (now)

Selling / prices, contact form, newsletter, analytics, French, dark mode, lightbox.
