# Setup — aquarel-atelier

One-time setup to connect the Google Drive folder to the site. Allow ±1 hour.

## Status and next steps

Last updated 2026-10-22. Tick items off here as you go.

- [x] Website built and tested (`npm test`), merged on `main` and pushed to GitHub.
- [x] Commits use the GitHub noreply address; `content/ids.csv` holds no file names. Safe to make the repo public.
- [x] The sample paintings in `fixtures/` are only for local preview and CI; they are never published.
- [ ] Make the repository public: GitHub → repo *Settings → General → Danger Zone → Change visibility*. Optional: switch off *Issues*, *Wiki*, *Projects* under *Settings → General → Features*.
- [x] Step 1 — Google Drive + Sheet in Alexander's personal Google account; IDs in `site.config.json`.
- [ ] Give Dirk access (step 1.5) once he maintains the site himself.
- [ ] Step 2 — Google Cloud service account.
- [ ] Step 3 — GitHub secret and Pages. First real version goes live at https://alexanderboucquey.github.io/aquarel-atelier/.
- [ ] Step 4 — "Website publiceren" button (GitHub token in the Sheet).
- [ ] Acceptance check (bottom of this page), then give Dirk `docs/handleiding-dirk.md`.
- [ ] Step 5 — domain, once bought.

**Good to know**

- Until step 3 is done, every push to `main` only runs the tests and a sample build; nothing is deployed.
- New photos in `Werken/` are *added* to the gallery (at the top). Existing works stay until they are hidden
  (*Tonen* unticked) or deleted from Drive.
- To replace the photo of an existing work and keep its URL and texts: in Drive, right-click the photo → *File
  information → Manage versions → Upload new version*. Deleting it and uploading a new file gives the work a new URL.
- Failed builds e-mail you (GitHub default). The previous version of the site stays online.
- Renew the GitHub token for the Sheet once a year (calendar reminder).
- GitHub switches off the nightly run after 60 days without repo activity. Publishing from the Sheet keeps
  working; re-enable the schedule under *Actions → Build & deploy* if you want it back.
- Improvements deliberately left for later, from the code review: warn about subfolders in `Werken/` and about
  *Van* after *Tot*; reprocess images when image settings change; detect HEIC by type, not only by extension;
  guard `content/ids.csv` against an Excel save; speed up the workflow (cache only processed images, skip tests on
  publish); Apps Script polish (trashed files, double click, minimal scopes, "unverified app" screen); accept a file
  name without extension or a Drive link in *Bestand*/*Afbeelding*; small display details on the home card.

## 1. Google Drive + Sheet (Alexander's personal Google account)

Use the personal account, not the Harmoney one, in a browser window where only that account is signed in: with
several accounts signed in, Apps Script often runs as the wrong one.

1. Create the website folder **Website Dirk Vermoesen** (any location in Drive; the name is free) with two
   subfolders: **Werken** and **Tentoonstellingen**. Photos go directly in **Werken**; subfolders are skipped.
2. In that folder, create a Google Sheet **Website inhoud**. *File → Settings → Locale: Belgium* (so 12/11/2026 means 12 November).
3. In the Sheet: *Extensions → Apps Script*. Replace the code with `apps-script/Code.gs` and save. In the function
   dropdown next to *Run* choose `setupSheet` (it starts on `onOpen`, which only adds the menu) and click *Run*
   (*Advanced → Go to … (unsafe) → Allow*). Reload the Sheet: the tabs and the menu **Website** appear.
4. `site.config.json`: `google.folderId` is the website folder (from `…/folders/<id>`), not **Werken**;
   `google.sheetId` is from `…/spreadsheets/d/<id>/edit`.
5. When Dirk maintains the site himself: he needs a free Google account, which can use his existing e-mail address
   (accounts.google.com → *Use my current email address instead*). Share the website folder with him as **Editor**;
   its link is where he drops photos. Drive has no upload link that works without an account.

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
4. With the IDs in `site.config.json` (step 1.4), run *Actions → Build & deploy → Run workflow*, or push to `main`: the workflow fetches, builds and deploys.

## 4. "Website publiceren" button

1. GitHub → *Settings → Developer settings → Fine-grained tokens → Generate*: repository access **only** `aquarel-atelier`, permission **Actions: Read and write**, expiry 1 year. Put a renewal reminder in your calendar.
2. Apps Script editor → *Project settings → Script properties*: add `GITHUB_TOKEN` with the token.
3. In the Sheet: *Website → Website publiceren* → the *Actions* tab on GitHub shows a run.

## 5. Domain (once bought)

Cost: ±€10–20 per year at any registrar. Use 2FA on the registrar account.

1. Verify the domain for your GitHub account first, so nobody else can point it at their site: your profile
   *Settings → Pages → Add a domain*, then add the TXT record GitHub shows at the registrar and click *Verify*.
2. DNS at the registrar: `A` records for the apex to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, and `CNAME www → alexanderboucquey.github.io`.
3. Repo *Settings → Pages → Custom domain*: the domain, then *Enforce HTTPS* (the certificate can take up to a day).
4. `site.config.json`: `"baseUrl": "https://<domain>"`, `"pathPrefix": "/"`. Commit and push to `main`; tests and links
   follow the new values automatically.
5. Tick *Step 5* in the status list above and update the date.

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
