# Progress log

Newest entry first. Per plan §18: every phase ends with tests green, app runnable, this file updated, git commit.

## 2026-07-19 — Phase 2: exercise management ✅

**Completed**
- App shell wired to the data layer: screens receive `{ store, refresh }`; DB open failure shows a plain-language retry screen; `versionchange` shows the reload overlay (plan §10/§12); stale-render guard on navigation.
- Shared components: bottom sheets (prompt/confirm/menu) with inline validation errors, day-label and session-summary formatters (§6.1 formats).
- Home: MRU-first exercise list with last-session summaries ("Today · 3 sets · top 10 kg"), empty state with the 8 starter chips (D2), filter box beyond 12 exercises, pinned add button.
- Manage: ▲▼ reorder (accessible, contiguous sortOrder), rename with uniqueness errors, archive with toast, two-step delete naming the exact set count (archive offered first), archived section with unarchive incl. name-conflict rename flow.
- Store: `getLastSessionsByExercise()` for Home summaries.

**Tests run** (2026-07-19): Vitest 36/36; Playwright B1 + B2 green on WebKit/iPhone-13 (B2 covers chips, add, duplicate rejection, rename round-trip); `check:precache` OK.

**Known issues**: none.

**Next step**: Phase 3 — the logging screen (last-time card, steppers with pre-fill, Save set, ↻ Same as last time).

**Departures from plan**: none.

## 2026-07-19 — Phase 1: data layer ✅

**Completed**
- `js/stats.js`: workout-day grouping (D1 03:00 rule, per-set stored offsets) + deterministic set ordering.
- `js/db.js`: IndexedDB open/bootstrap at `DB_VERSION = 1`, migration machinery (empty v1 table per plan §10), `versionchange`-close protocol, promisified single-transaction runner, `deleteDb` for the guided reset.
- `js/store.js`: full validation + data API — exercise CRUD incl. archive/unarchive-with-conflict, cascade delete, ▲▼ reorder with contiguous `sortOrder`, MRU listing; set add/edit/delete/restore incl. batch quick-entry semantics (`now + i` ms), FK-inside-transaction, workout-day recompute on timestamp edits; previous-session and day queries; settings with defaults; malformed records excluded-but-retained.
- Deployed to GitHub Pages (RM482/gym-tracker); Phase 0 exit criteria met on the live site.

**Tests run** (2026-07-19): Vitest 35/35 across 4 suites (stats 6, db 5, router 4, store 20); `check:precache` OK (19 files); Playwright B1 green on WebKit/iPhone-13.

**Known issues**: none.

**Next step**: Phase 2 — exercise management UI (Home list + empty state + starter chips, Manage screen wired to the store).

**Departures from plan**: none.

## 2026-07-19 — Phase 0: scaffold (in progress)

**Completed**
- Planning + two-round Codex review + capped verification pass; plan approved by owner (v1.4, decisions D1–D4).
- Dedicated git repository initialised.
- App shell: `index.html` (CSP per plan §15), theme CSS (light/dark), hash router with all 7 routes and placeholder screens, `platform.js` adapters.
- PWA plumbing: `manifest.webmanifest`, versioned precache `sw.js` (skipped on localhost), generated icons (512/192/180).
- Test wiring: Vitest (`tests/router.test.js`), Playwright WebKit smoke B1, `check:precache` script.

**Tests run** (2026-07-19): Vitest 4/4 passed (`router.test.js`); `check:precache` OK (16 files); Playwright B1 passed on WebKit/iPhone-13 profile.

**Known issues**: GitHub repository/Pages not yet created — waiting on owner's choice of GitHub account.

**Next step**: finish Phase 0 exit criteria (tests green, deploy to GitHub Pages, install check on iPhone), then Phase 1 (data layer).

**Departures from plan**: none.
