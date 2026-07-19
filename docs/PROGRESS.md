# Progress log

Newest entry first. Per plan §18: every phase ends with tests green, app runnable, this file updated, git commit.

## 2026-07-19 — Phase 8: offline resilience and polish (implementation complete; iPhone gate pending)

**Completed**
- Versioned service-worker update flow: a waiting release shows **Update available — Restart**, activates only on request, then reloads once under the new worker.
- Focus/visibility refresh reloads data changed in another tab. A database version change immediately closes the stale connection and keeps a blocking reload screen authoritative even over an in-flight render.
- B6 automated offline reload now runs under reliable Chromium network emulation; B7 proves a synthetic database upgrade blocks the stale tab and removes its logging controls.
- Plain-language database recovery distinguishes a tab-blocked upgrade from other failures. Destructive reset is only revealed after repeated failures, first instructs the owner to locate a backup, and requires typing `RESET MY DATA` exactly.
- Accessibility polish adds strong keyboard focus indicators, modal focus containment, Escape close, focus restoration, a focused update screen, reduced-motion support, and large-text header wrapping.
- Automated polish coverage verifies system dark mode, 200% text without horizontal overflow, and keyboard-modal behaviour on an iPhone-sized WebKit viewport.
- Service-worker cache advanced to `gt-v0.11.0`; README, testing and maintenance guidance updated.

**Tests run** (2026-07-19): Vitest 59/59; Playwright 13/13 phone-browser tests; `check:precache` OK (24 files).

**Known issues / device gate**: Add to Home Screen, actual iPhone airplane-mode logging, dictation, Files/share sheet, force-quit persistence, update notice on a real deploy, CSP inspection and VoiceOver walkthrough require the owner’s phone. Automated equivalents are green where browser automation can truthfully cover them.

**Next step**: deploy `gt-v0.11.0`, run the short iPhone device script, then enter Phase 9 acceptance measurement.

**Departures from plan**: B6 uses Chromium because Playwright WebKit aborts service-worker navigations when its offline inspector switch is enabled; all other phone wiring remains WebKit-tested.

## 2026-07-19 — Phase 7: settings, backup and restore ✅

**Completed**
- Settings controls for coarse weight increment and recent/manual exercise ordering, persisted through the existing validated settings store.
- Best-effort durable-storage request begins after the first successful manual, repeat, or batch save; Settings reports the browser’s current persistence status without overstating the guarantee.
- Canonical `gym-tracker-backup-YYYY-MM-DD.json` export with app marker, DB schema version, timestamp, exercises, sets, settings, and separately preserved unreadable raw records.
- Backup preparation happens before the export tap so iPhone Safari retains share-sheet activation; download fallback remains available. Successful export records `lastExportAtMs`.
- Quick-entry grammar now accepts natural dictation such as “3 sets of 8, with 10 kg” and Dutch “drie sets van acht, met tien kilo”.
- Service-worker cache bumped to `gt-v0.9.0`; `backup.js` added to the offline precache.
- Import stages files up to 10 MB, validates identity/version/structure/caps/records/IDs/names/foreign keys before writes, previews replacement counts and unreadable omissions, then requires explicit confirmation.
- Confirmed restore downloads an automatic safety copy first and replaces exercises, sets and settings in one IndexedDB transaction; failures leave the existing database intact.
- Home shows a dismissible 30-day backup reminder after changed data (7-day snooze); Settings shows exercise/set counts and unreadable-entry warnings.
- Service-worker cache advanced to `gt-v0.10.0` for the completed restore surface.

**Tests run** (2026-07-19): Vitest 58/58; Playwright 10/10 browser tests including export, restore preview, safety download, atomic replacement and persisted preferences; `check:precache` OK (24 files).

**Known issues**: native iPhone share/download and persistence status remain device-gate checks.

**Next step**: Phase 8 — offline/update behaviour, recovery views, accessibility and release polish.

**Departures from plan**: none; implementation was checkpointed internally in two data-safety slices.

## 2026-07-19 — Phase 6: progress dashboard ✅

**Completed**
- Pure dashboard metrics in `stats.js`: data-driven weight/reps mode, per-day top weight and max reps, Epley estimated 1RM with weight-0 and reps-over-12 exclusions, all-time PRs with dates, period filtering, and distinct-workout consistency over the trailing 28 days.
- Dashboard exercise selector uses MRU order; period selector offers 8 weeks, 6 months, and All while PR cards remain honestly all-time.
- Weighted exercises show top-set weight and best estimated-1RM charts; zero-weight-only exercises show max reps. Mixed weighted-calisthenics days plot 0 added kg where appropriate.
- Shared dependency-free inline SVG chart with time-scaled x-axis, three y guides, labelled latest value, accessible image label, qualifying-data empty state, and a useful single-session message.
- Empty tracker, unlogged exercise, no-sessions-in-period, and single-session states render deliberately rather than producing broken charts.
- Service-worker cache bumped to `gt-v0.8.0` with the chart helper precached.

**Tests run** (2026-07-19): Vitest 54/54 (dashboard fixtures cover mode selection, Epley decimals/exclusions, PRs, periods, consistency, and empty data); Playwright 9/9 browser tests including weighted/bodyweight dashboard modes, PRs, consistency, and single-point states; `check:precache` OK (23 files).

**Known issues**: none.

**Next step**: Phase 7 — restorable backup/import, remaining settings, persistence status, and backup reminder.

**Departures from plan**: none.

## 2026-07-19 — Owner addition: analysis-ready data export ✅

**Completed**
- Settings now offers “Export for AI analysis”: readable, pretty-printed JSON with a schema guide, summary, exercise catalogue, and chronological per-set rows containing names, archive state, local/UTC timestamps, workout day, kg, reps, and bodyweight meaning.
- Export is prepared before the tap so iPhone Safari retains permission to open its share sheet; browsers without file sharing use a dated JSON download fallback.
- Privacy remains local-first: the app performs no upload and clearly explains that the file leaves the device only through the owner’s chosen Files/share destination.
- This is deliberately separate from the strict restorable backup/import format still due in Phase 7.

**Tests run** (2026-07-19): Vitest 51/51 (new analysis-export suite: 2); Playwright 8/8 browser tests including file download and JSON-content verification; `check:precache` OK (22 files).

**Known issues**: the native iPhone share sheet needs the planned real-device pass; automated WebKit verifies the standards-based download fallback and file contents.

**Next step**: Phase 6 — dashboard metrics, PRs, consistency, and inline SVG progress charts.

**Departure from plan**: owner-requested analysis format added; the relevant export surface was pulled forward ahead of Phase 7 without changing backup/restore semantics.

## 2026-07-19 — Phase 5: history, editing and day overview ✅

**Completed**
- History screen (§6.3): reverse-chronological workout-day cards, full date + session summary headers linking to Day overview, ordered set rows, and clear no-history state.
- One shared set editor used from History, Day overview, and Today on the Log screen: decimal-comma weight/reps validation, local `datetime-local` editing, derived workout-day preview, and exact timestamp/day movement semantics.
- Set deletion commits after one confirmation and shows a 6-second Undo action; Undo restores the identical record and expiry leaves the deletion permanent.
- Day overview (§6.7): Today/Yesterday/date labels, previous/next workout-day navigation with future days blocked, rest-day state, all exercises grouped by first-set order, and set rows opening the shared editor.
- Day summary shows exercise count, set count, and first-set-to-last-set duration; fewer than two sets renders “—”. Archived exercises remain name-resolvable in historical day views.
- Pure stats helpers and fixtures added for day duration and cross-exercise grouping; service-worker cache bumped to `gt-v0.6.0` with the shared editor precached.

**Tests run** (2026-07-19): Vitest 49/49 (new day grouping/duration cases); Playwright B1–B5 + B8 green, 7/7 browser tests (editing, timestamp day move, delete + Undo + expiry, two-exercise day grouping/navigation); `check:precache` OK (21 files).

**Known issues**: none.

**Next step**: Phase 6 — dashboard metrics, PRs, consistency, and inline SVG progress charts.

**Departures from plan**: none.

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
