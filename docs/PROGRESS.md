# Progress log

Newest entry first. Per plan §18: every phase ends with tests green, app runnable, this file updated, git commit.

## 2026-07-19 — Phase 4: quick entry ✅

**Completed**
- Pure deterministic parser (`js/parser.js`) for the approved English/Dutch typed-or-dictated grammar: set counts, reps/weight forms, number words one–twelve / een–twaalf, bodyweight, decimal commas, inherited pre-filled/last-mentioned weights, and explicit ambiguity errors.
- Parser is all-or-nothing, identifies failing fragments, never throws, enforces 20 sets per segment and 30 sets per submission, and runs fully offline with no AI or network calls.
- Log-screen sentence field with iOS keyboard Done handling, keyboard-aware scroll, in-memory draft preservation across app navigation, preview chips, and one "Add N sets" confirmation.
- Confirm uses the existing atomic `store.addSets()` transaction and shared write-pending guard; successful batches immediately appear in Today in their spoken order.
- Service-worker cache bumped to `gt-v0.5.0` and `js/parser.js` added to the offline precache.

**Tests run** (2026-07-19): Vitest 47/47 (new parser suite: 7); Playwright B1–B4 green, 5/5 browser tests (B4 covers canonical 3-set preview/save and all-or-nothing parse failure); `check:precache` OK (20 files).

**Known issues**: dictation itself still needs the planned real-iPhone device check; browser automation verifies the resulting sentence flow.

**Next step**: Phase 5 — History/edit/delete + Undo and the cross-exercise day overview.

**Departures from plan**: none.

## 2026-07-19 — Phase 3: logging core ✅

**Completed**
- Log screen (§6.2): Last-time card with relative date (adds "· N days ago" beyond a week), collapsed Earlier line (2 prior sessions) linking to History, Today card with per-set times.
- Entry controls: weight steppers `[−coarse][−0.5][value][+0.5][+coarse]` (coarse from settings) + reps `[−1][value][+1]`; decimal-comma input accepted; centre values open the right iOS keypads.
- Pre-fill rules: today's last set → else previous session's *first* set → else empty weight + reps 8 (first-time state).
- "Save set" saves and stays with values retained; "↻ Same as last time — 10 kg × 8" implements the n+1/last-set rule with the pending values always visible in the label; single shared write-pending guard across all save paths (§12 — no value-based duplicate prompts).
- Stale exercise links (deleted/archived) redirect Home with a toast (§12).
- Store: `getRecentSessions(exerciseId, limit)`; `getPreviousSession` now delegates to it.

**Tests run** (2026-07-19): Vitest 40/40 (new: ↻ n+1 worked examples from §6.2, bodyweight formatting); Playwright B1–B3 green (B3: decimal-comma entry, stepper, save-and-stay, reload persistence, Home summary); `check:precache` OK.

**Known issues**: none. Tap-count check (browser estimate): repeat flow = 1 (exercise) + 3 (↻ ×3) = 4 taps, matching §7.

**Next step**: Phase 4 — quick-entry parser (test-first) + sentence input UI.

**Departures from plan**: none.

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
