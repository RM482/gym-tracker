# Gym Tracker

A very fast, local-first gym logging app for one user's iPhone, built as an installable web app (PWA). Log a set in a few taps, instantly see what you lifted last time, and watch progress on a simple dashboard. Works fully offline; all data stays on the phone.

**Status: in development — Phase 0 (scaffold).** See `docs/PROGRESS.md`.

## Documentation

- `docs/REQUIREMENTS.md` — what the app must do (source of truth)
- `docs/PROJECT_PLAN_FINAL.md` — the approved implementation plan (reviewed twice + verified by Codex; see `docs/reviews/`)
- `docs/DECISIONS.md` — decision log
- `docs/PROGRESS.md` — build progress
- `docs/TESTING.md` — test strategy results and the manual device scripts
- `docs/MAINTENANCE.md` — how to change, deploy and recover the app

## Development

The app itself has **zero dependencies and no build step** — plain HTML/CSS/JS. npm is only used for tests.

```bash
npm install            # once, dev tools only
npm test               # unit tests (Vitest)
npm run test:browser   # browser smoke tests (Playwright WebKit; first run: npx playwright install webkit)
npm run check:precache # verifies sw.js PRECACHE matches the files on disk
npm run serve          # local server at http://localhost:4173
```

The service worker is skipped on localhost so edits show up immediately; append `?sw=on` to test offline behaviour locally.

## Install on iPhone (once deployed)

1. Open the app's URL in Safari.
2. Tap Share → **Add to Home Screen**.
3. Launch from the icon — it runs full-screen and works offline.

## Data safety

Your data lives only on your phone (browser storage). Make occasional backups: Settings → **Export backup** → save to iCloud Files. Backups are plain JSON files — treat them like personal documents. Restoring: Settings → Import backup.
