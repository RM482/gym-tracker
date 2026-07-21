# Gym Tracker

A very fast, local-first gym logging app for one user's iPhone, built as an installable web app (PWA). Log a set in a few taps, instantly see what you lifted last time, and watch progress on a simple dashboard. Works fully offline; all data stays on the phone.

**Status: in use.** v1 plus change set 1 (muscle groups, done-today marking, the machine add-on flag and the plateau nudge) are deployed. Real-device checks on the owner's iPhone are the one thing outstanding.

**Picking this up after a break? Read `docs/HANDOFF.md` first.**

## Documentation

- `docs/HANDOFF.md` — **start here**: current state, what is outstanding, and the process to follow
- `docs/REQUIREMENTS.md` — what the app must do (source of truth)
- `docs/PROJECT_PLAN_FINAL.md` — the approved implementation plan (reviewed twice + verified by Codex; see `docs/reviews/`)
- `docs/DECISIONS.md` — decision log (D1–D8)
- `docs/PROGRESS.md` — build progress, newest first
- `docs/TESTING.md` — test strategy results and the manual device scripts
- `docs/MAINTENANCE.md` — how to change, deploy and recover the app

## Development

The app itself has **zero dependencies and no build step** — plain HTML/CSS/JS. npm is only used for tests.

```bash
npm install            # once, dev tools only
npm test               # unit tests (Vitest)
npm run test:browser   # phone-sized browser tests (WebKit + one Chromium offline check)
npm run check:precache # verifies sw.js PRECACHE matches the files on disk
npm run serve          # local server at http://localhost:4173
```

The service worker is skipped on localhost so edits show up immediately; append `?sw=on` to test offline behaviour locally.

Deployed updates install safely in the background. When a new version is ready, the app shows **Update available → Restart**; existing data remains in the phone's local database.

## Install on iPhone (once deployed)

1. Open the app's URL in Safari.
2. Tap Share → **Add to Home Screen**.
3. Launch from the icon — it runs full-screen and works offline.

## Data safety

Your data lives only on your phone (browser storage). Settings → **Export backup** creates a complete restorable copy; **Import backup** validates, previews, safety-copies current data, then replaces it atomically. Treat exported JSON like a personal document.

## Analysing your training data

Settings → **Export for AI analysis** creates a readable JSON file containing exercise names and one chronological row per set, including local/UTC timestamps, workout day, weight and reps. Attach that file to an LLM when you want help reviewing trends. The app does not upload it: saving or sharing the file is always your choice. Treat it as a personal health-adjacent document.
