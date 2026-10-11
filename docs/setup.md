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
