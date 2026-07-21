# Progress log

Newest entry first. Per plan §18: every phase ends with tests green, app runnable, this file updated, git commit.

## 2026-07-21 — Change set 1: Codex verification pass, five defects fixed ✅

Codex reviewed the implemented code (not just the plan) and raised five findings; all were verified against the code and fixed.

**Completed**
- **Superseded renders can no longer hijack navigation (G1).** Rendering was atomic, but side effects were not: a stale Log/History render for a missing exercise still toasted and redirected Home, pulling the owner off the screen they had actually opened. Screens now get `ctx.isCurrent()` and must check it before any post-await global effect, and `render()` re-checks after the database opens before invoking a screen at all.
- **v2 shapes are now enforced at the write and backup boundaries (G2)** — a gap between what the previous response document promised and what shipped. Backup import rejects an out-of-taxonomy muscle group or non-boolean add-on flag *after* migration (so genuine v1 files still restore); every exercise/set write-back normalises, so an unrelated rename or edit cannot persist a legacy record un-migrated; snapshots export canonical shapes. Tolerant reads are kept on purpose: a cosmetic field must never make real history vanish.
- **The plateau nudge no longer claims orderings it cannot establish (G3).** The streak compared (weight, add-on) as a pair but the clear-check compared weight alone. Now it clears only where the comparison holds whatever the unknown add-on weighs: same state and heavier, or off→on at the same or more weight — never on→off, because the dropped add-on could outweigh the gain.
- **Multi-version migrations are genuinely sequential (G4).** One cursor per version over the same store meant two cursors could read the same original record, letting a later version's transform overwrite an earlier one's. Harmless for the shipped single-step v1→v2, a landmine for the next one. Each store is now walked once, applying every version's transform in order.
- **The done-today marker keeps its accessible name (G5).** The `aria-label` override was replacing the computed name and costing screen-reader users the session summary; it is now visually-hidden text inside the button instead.

**Tests run** (2026-07-21): Vitest 116/116, Playwright 22/22, `check:precache` OK. New coverage: stale-render navigation suppression, current-schema backup rejection (invalid group, non-boolean flag) with v1 files still accepted, legacy records normalising on rename/archive/edit/snapshot, plateau clearing across every add-on transition, and a real v1→v3 upgrade with a dependent step and a deleting step. Cache `gt-v0.16.0`.

**Known issues**: none. Deliberately not browser-tested (noted, not skipped silently): the `DbTooOldError` recovery screen, and end-to-end add-on correction via quick-entry/repeat/editor — both covered at the unit level.

**Next step**: owner device pass on the iPhone.

**Departures from plan**: none.

## 2026-07-21 — Change set 1, slices 5–8: the four requested features ✅

**Completed**
- **Muscle-group sections on Home (D8).** Exercises appear under fixed-order headings (Chest → Full body → Other), with never-assigned exercises in a distinct **Ungrouped** section at the end — kept separate from a deliberately chosen "Other" (F5). Ordering within a section still follows the owner's recent/manual preference. Filtering searches across all groups and hides headings whose rows are all filtered out. **Manage deliberately stays flat**, showing the group as secondary text with a picker in the row menu, because grouped sections would conflict with its single global ▲▼ ordering (F4). Adding an exercise does *not* prompt for a group — new exercises land Ungrouped and are tagged from Manage when convenient.
- **Already-logged-today marking.** Rows trained today are ticked and receded, with "logged today" in the accessible name rather than colour or an icon alone. They are **not** reordered: rows shifting under your thumb between sets would be worse than scanning past them. Derived from the session map Home already loads — no extra query (F6).
- **Machine add-on toggle (D7).** A single toggle beside the weight steppers, carried through every save path: manual save uses the current state, quick-entry applies it to the whole batch, "Same as last time" copies the *source set's* state, and the shared set editor can correct it afterwards (F10). Sets render a `+on` badge everywhere they appear (log, today, history, day overview) via the shared formatter. The unknown kilograms are never invented into `weightKg`, and the dashboard now discloses that its weights and 1RM estimates exclude the add-on where any set used it (F11).
- **Plateau nudge (D6).** "Top weight unchanged for 3 sessions" appears on the Log screen after three consecutive earlier sessions at an identical top effort. Evaluated over completed workout-days strictly before today, so a warm-up set cannot hide it before today's real top set exists; it clears once today beats the plateau (F12). Pure bodyweight exercises are skipped rather than measured on the wrong axis (F13). Because a set at 50 kg with the add-on is genuinely a heavier effort than 50 kg without, the comparison uses the pair (top weight, add-on state) — ignoring the flag would assert something false (F11).
- **Backup reminder timing fixed** (owner-reported nag): it fired the instant anything was saved when the owner had never exported, so it showed permanently. It now counts 30 days from the last export, or from a new `firstDataChangeAtMs` baseline when there has never been one, and only when there are genuinely unexported changes — matching plan §6.1.

**Bug caught by the new tests**: the Home rewrite initially dropped the exercise row's click handler, so tapping an exercise did nothing. Fixed and covered.

**Tests run** (2026-07-21): Vitest 102/102 (new: plateau streak/nudge incl. add-on pairing, bodyweight and mixed-session skips, today-clears-it; backup-reminder timing incl. the never-exported case; v2 store fields); Playwright 21/21 (new `features.spec.js`: grouping order and filtering, flat Manage, done-today marking, add-on badge/persistence/dashboard caveat, and the nudge appearing then clearing). `check:precache` OK. Cache `gt-v0.15.0`.

**Known issues**: none.

**Next step**: owner device pass on iPhone — grouping, tagging, the add-on toggle mid-workout, and confirming the zoom fix by feel.

**Departures from plan**: none. Scope was actively trimmed twice on review grounds: no `groupByMuscle` setting, and no forced muscle-group prompt after adding an exercise.

## 2026-07-21 — Change set 1, slice 4: v2 schema (muscle group + machine add-on) ✅ built, deploy held

**Completed**
- `DB_VERSION` raised to **2** with the first real migration: `Exercise.muscleGroup` (nullable — Ungrouped until assigned) and `SetEntry.addOn` (required boolean, default false). Records-only; no new stores or indexes.
- v2 shapes are applied at every write, not just in the migration: `buildSet` always stamps `addOn`, `addExercise` accepts and stamps `muscleGroup`, `editSet` normalises `addOn` so it is correctable, and new `setMuscleGroup(id, group)` edits it. The curated taxonomy `MUSCLE_GROUPS` (D8) is validated on write; unknown values are rejected.
- **Reads normalise rather than validate** the new fields: a record that somehow escaped the migration is corrected in memory instead of being counted "unreadable" and disappearing from the owner's history. Writes stay canonical, reads stay forgiving.
- Analysis export carries `exerciseMuscleGroup` and `machineAddOn`, with guidance text stating explicitly that the add-on's kilograms are unknown and deliberately excluded from `weightKg`, so a reader cannot treat 50 kg with the add-on as the same load as 50 kg without.

**Tests run** (2026-07-21): Vitest 86/86; Playwright 17/17; `check:precache` OK. New coverage includes the `MAINTENANCE.md`-mandated pair — a pure record-transform fixture (defaults, idempotency, non-boolean coercion) **and** a real v1 database upgraded in place with every record preserved including an archived exercise and a 0 kg bodyweight set — plus fresh-v2 bootstrap, a genuine v1-backup-restored-into-v2 round trip, referential integrity after migrating, and legacy records normalising on read. Version-dependent tests that hardcoded schema 1 were rebased on `DB_VERSION` so they cannot rot at the next bump.

**Deploy held deliberately**: a database upgrade is one-way. This slice is committed but not pushed until the owner has exported a backup from their phone.

**Known issues**: none.

**Next step**: the feature UI on top of v2 — muscle-group grouping on Home, machine add-on toggle, done-today highlight, same-weight nudge.

**Departures from plan**: none.

## 2026-07-21 — Change set 1, slice 3: data-safety prerequisites ✅

Two latent defects found by Codex in already-shipped code. Both are harmless while only one schema version exists and become data-integrity bugs the moment a second one does, so they land *before* the v2 schema rather than alongside it.

**Completed**
- **Backup restore now replays record migrations (F7).** `backup.js` previously validated an imported file against the *current* schema and inserted it unchanged — it never imported `migrations` at all, despite plan §10/§16 requiring migrate-then-validate. A genuine older backup would therefore have been restored missing any field a later migration adds, or rejected for lacking it. Import order is now: envelope + size caps → `migrateBackup()` replaying the same pure record transforms the database upgrade uses → full current-schema validation on the migrated result. `migrateBackup` copies records before transforming, so the caller's object is never mutated, and honours a step returning `null` as a record deletion.
- **`VersionError` is now its own state (F9).** Old cached code opening a database a newer release already upgraded raised a raw `VersionError`, which the recovery screen counted as a generic open failure — and after two such failures it revealed the destructive "RESET MY DATA" path. That is a route from "your app is stale" to "erase your workouts". `db.js` now raises `DbTooOldError`; the recovery screen shows "This app needs updating / Reload to update", states the data is safe, and **never** exposes reset. Neither `DbTooOldError` nor `DbBlockedError` counts towards the failure counter, so a safe-fix state cannot inflate it and bring the destructive option within reach of a later unrelated hiccup.
- `docs/MAINTENANCE.md` rollback recipe corrected: `DB_VERSION` must never be rolled backwards, because a database upgrade is one-way — revert behaviour, keep the version and its readers.

**Tests run** (2026-07-21): Vitest 73/73 (new: 6 migration-replay cases incl. non-mutation, record deletion, refusing an unmigratable version, and proving validation runs on the migrated result; 2 `DbTooOldError` cases incl. data surviving untouched); Playwright 17/17; `check:precache` OK. Cache `gt-v0.13.0`.

**Known issues**: none.

**Next step**: v2 schema — `Exercise.muscleGroup` (nullable, curated taxonomy) and `SetEntry.addOn` (required boolean, default false) in one migration, with the `MAINTENANCE.md`-mandated fixture + real upgrade tests, and v2 shapes applied to constructors, validators and fresh-install bootstrap.

**Departures from plan**: none — this slice closes gaps against the approved plan rather than deviating from it.

## 2026-07-21 — Change set 1, slices 1–2: duplicate-list bug + zoom on tap ✅

**Completed**
- **Duplicate exercise list fixed (owner-reported).** Root cause: `render()` cleared `#app` at the start and only checked whether it had been superseded *before* the screen's async data loads, so two overlapping renders (returning to the app fires `focus` and `visibilitychange` together) each cleared once and then interleaved their appends. Reproduced deterministically with a macrotask stagger — one header, two stacked lists.
- Screens now render into a **detached container** and commit atomically via `replaceChildren` only when `shouldCommitRender()` holds: still the newest render, no blocking update pending, and the route unchanged. The live screen is never cleared until a replacement is ready, so a superseded render drops its work instead of painting a second copy. Child *nodes* are moved (not a wrapper element) because `#app > .btn-*` are direct-child selectors.
- `focus`/`visibilitychange` are coalesced into one scheduled refresh; `hashchange` stays immediate. Side benefit: no blank-screen flash between screens.
- **Zoom on tap fixed (D5).** Two independent iOS causes addressed: `touch-action: manipulation` on interactive surfaces removes double-tap-to-zoom, and every editable control now has a `max(1rem, 16px)` floor — rules using `font: inherit` inside small labels (set editor 0.85rem, settings 0.9rem, recovery input 0.9rem) were computing 13.6–14.4px and triggering iOS focus zoom. Deliberate pinch-zoom is preserved (plan §13).
- Test-rot fixed: B1 hardcoded `#/day/2026-07-19` and asserted it renders as "Today", which silently expired the next day; it now derives today's workout day from the app. Ambiguous `getByRole('button', {name:'Back'})` locators (substring-matched "**Back**up recommended — Export") replaced with exact `aria-label` selectors — surfaced because the screen no longer flashes blank.

**Tests run** (2026-07-21): Vitest 65/65 (new: `routeKey`, 5 `shouldCommitRender` cases); Playwright 17/17 including new B9 render-race regressions (staggered + same-tick event bursts, rapid navigation) and two zoom specs asserting the 16px floor, `touch-action`, and the absence of a viewport zoom lock; `check:precache` OK (24 files). Service-worker cache `gt-v0.12.0`.

**Known issues**: none from these slices. Observation for the owner (not changed): the Home "Backup recommended" banner appears as soon as any data changes if you have *never* exported, rather than after 30 days as plan §6.1 describes — so it may be showing permanently.

**Next step**: data-safety prerequisites before the v2 schema — backup restore must replay record migrations (Codex F7) and `VersionError` must be handled distinctly (F9).

**Departures from plan**: none.

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
