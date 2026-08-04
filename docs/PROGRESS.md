# Progress log

> **Resuming after a break? Start with `docs/HANDOFF.md`.** Current state: change set 4 deployed
> 2026-08-04 at `gt-v0.22.0` (`DB_VERSION = 2`, unchanged), tests green (Vitest 121, Playwright 43).

Newest entry first. Per plan §18: every phase ends with tests green, app runnable, this file updated, git commit.

## 2026-08-04 — Change set 4: the superset picker could not be scrolled ✅

First feedback from real use of change set 3, reported within hours of the deploy: *"When I want to
add a superset, I can't scroll the list of exercises. I'd need to be able to scroll them, but ideally
would also have them grouped in their groups (in a foldable way)."*

**Reproduced before fixing.** With 20 exercises at iPhone viewport, the sheet's top sat **337 px above
the screen** — the title and the first third of the list were unreachable, and so was Cancel. Root
cause: `.sheet` had neither `max-height` nor `overflow`, so it grew to its content and the bottom-
anchored overlay pushed the overflow off the top. This was latent for every sheet in the app; only
the superset picker has an unbounded number of rows, so only it hit the limit. Change set 3 shipped
it because its own tests used two exercises.

**Fixed at the root**, not just for the picker: `.sheet` is now capped at `85dvh` with `overflow-y:
auto` and `overscroll-behavior: contain`. `dvh` is declared after `vh` so it wins where supported —
on iOS a `vh` cap ignores the browser chrome and would still overflow.

**New `js/ui/exercise-picker.js`** replaces the flat `menuSheet` for choosing a superset partner:
sections in the same taxonomy order as Home, each with a fold arrow and a count, and the exercise you
are supersetting *from* excluded. Its **list** scrolls rather than the whole sheet, so the title and
Cancel stay put instead of scrolling away from someone halfway down a long list.

**Fold state is shared with Home** (`settings.collapsedGroups`), so folding Legs in the picker folds
it on Home and vice versa — one preference, not one per screen.

To keep the two lists from drifting, `groupExercises` moved out of `home.js` into `components.js` and
the fold control became a shared `groupToggleButton()`; Home and the picker now build sections from
one implementation. Same reasoning as `exercise-actions.js` in change set 2 and `entry-panel.js` in
change set 3.

**Tests** (2026-08-04): Vitest 121/121, Playwright 43/43, `check:precache` OK (28 files). Cache
`gt-v0.21.0` → `gt-v0.22.0`. New coverage (all four written to fail first): the picker fits on screen
with its last section reachable and Cancel always in view; sections grouped, counted and foldable with
the source exercise excluded; picking a partner opens that superset; the fold preference shared with
Home.


## 2026-07-29 — Change set 3: four owner-feedback items ✅

Owner asked for four things after continued real use. Design brief → Codex review → response, all in
`docs/reviews/` (`CHANGE_SET_3_BRIEF.md`, `CODEX_REVIEW_CHANGE_SET_3.md`,
`CLAUDE_RESPONSE_CHANGE_SET_3.md`). Codex raised 3 blockers, 7 should-fixes and 2 considers; all
accepted, two with refinements. Six slices, all landed. No schema change: `DB_VERSION` stays 2.

**Slice 1 — add an exercise and go straight into it ✅**

New shared `exerciseAddSheet()` in `exercise-actions.js` takes the name **and** an optional muscle
group in one sheet; adding from Home then navigates to `#/log/<newId>`. This amends D8 (recorded as
**D9**): the owner adds an exercise at the gym in order to log it, so returning to the list meant
finding it again, and grouping never happened at the moment the exercise was in mind. The group stays
optional, so the fast path costs no extra tap. Manage's add uses the same sheet but deliberately
stays put — housekeeping there happens in batches — and the first-run starter chips also stay put, or
tapping one suggestion would make the other seven unreachable.

Built on `sheet()` rather than by giving `promptSheet` a mode flag (it has four other single-field
call sites), so the inline-error contract is reproduced explicitly: a duplicate name reports and
keeps the sheet open with the typing intact. A `saving` latch stops Enter-plus-tap creating two.

**Tests** (2026-07-29): Vitest 117/117, Playwright 27/27, `check:precache` OK (25 files). Cache
bumped `gt-v0.17.0` → `gt-v0.18.0`.

**Slice 2 — fold group sections away on Home ✅**

Each group heading is now a button with a ▸/▾ arrow and a count ("Legs (3)") that folds its rows
away, remembered between visits in `settings.collapsedGroups`. No `DB_VERSION` change: settings is a
free-form single record merged over the defaults. But a new key gets no validation for free, so a
`normalizeSettings()` is applied at all four boundaries — `getSettings`, `updateSettings`,
`snapshotForBackup`, `replaceFromBackup` — accepting only an array of known group names (plus the
`Ungrouped` literal, now exported as `UNGROUPED_KEY` so home.js and the store share it). Backup
*validation* stays tolerant: a junk display preference must never block restoring real history, so
restore canonicalises it instead of rejecting the file.

Verified that `updateSettings` does not call `touchDataChange`, so folding a group cannot move
`lastDataChangeAtMs` and cannot trigger the backup-overdue banner. There is a unit test pinning that.

**Folding and filtering share one `applyVisibility()`.** Two handlers each writing
`row.style.display` would overwrite each other — a fresh way to reintroduce the change-set-2 filter
regression. While the filter has text every section is forced open (a search that silently skipped
folded groups would be worse than no search) and the heading reports the state actually on screen via
`aria-expanded`; clearing the filter restores the fold. A remembered group with no exercises is kept,
not pruned, so no write happens during a render.

**Tests** (2026-07-29): Vitest 119/119, Playwright 29/29, `check:precache` OK. New coverage:
`collapsedGroups` normalising from duplicates, unknown names, a non-array and a restored backup;
folding not moving any backup timestamp; fold → reload → still folded; a filter match showing inside
a folded group and re-folding when cleared; fold state surviving a focus/visibilitychange refresh.

**A pre-existing flaky test was found and fixed** (not caused by this change set — reproduced on the
slice-1 commit, failing about 1 run in 4). The plateau-nudge test saved a set and then typed into the
inputs without waiting for the asynchronous post-save re-render, so the typing could land in the
outgoing DOM and the next tap re-saved the pre-filled weight. It now waits for the "Today — N sets"
heading between saves, as every other consecutive-save test already did. Worth having fixed before
slice 5 refactors that exact save→refresh path.

**Slice 3 — group several exercises in one pass ✅**

Manage gains "⋮⋮ Group several exercises…" (shown once there are at least two). It picks the target
group, then every row becomes a tick-toggle: tapping assigns the group, tapping a ticked row puts it
back to Ungrouped. A row taken out of another group reads "Arms — was Chest", so an overwrite is
visible rather than silent. Manage stays flat throughout, per D8.

**The mode lives in the route** (`#/manage/group/<Group>`), not in module or closure state. The app
re-renders on `focus` and `visibilitychange`, so a mode held in a render closure would be silently
dropped when the phone locks mid-list; in the route it re-renders straight back into the mode, and
Back leaves it naturally. `parseRoute` stays ignorant of the taxonomy — `manage.js` falls back to the
plain list for an unrecognised name — and a malformed percent-escape is caught rather than thrown out
of the router.

**Each tap writes immediately** instead of staging an Apply. A staged draft has exactly the same
lock-the-phone failure as a closure-held mode, and the owner's own wording ("go through the list to
select all arms exercises, **thereby** grouping them") describes selecting as grouping. Because the
write is immediate there is nothing to lose and a mis-tap is corrected by tapping again. A tap
deliberately does **not** call `ctx.refresh()`: re-rendering the whole screen per tap would throw away
the owner's place in a long list. The list refreshes once, on the way out.

**Tests** (2026-07-29): Vitest 120/120, Playwright 30/30, `check:precache` OK. New coverage: the
grouping route including a space in the name, an unknown name and a malformed escape; tagging several
exercises in one pass; the "was Chest" overwrite label; the mode and its writes surviving a
focus/visibilitychange refresh; untick returning to Ungrouped; and Home showing the resulting section.

**Process note:** slice 2 changed app files without bumping `CACHE_VERSION`, which the project rule
requires per commit. Corrected here — the bump to `gt-v0.19.0` covers slices 2 and 3. No deploy
happened in between, so no device ever saw `gt-v0.18.0` without the folding code.

**Slice 4 — characterisation tests before the refactor ✅**

`tests/browser/entry-panel.spec.js`, written against the *old* code so the extraction had a net that
already existed. The existing suites covered the entry block's features; what they did not cover was
the coupling between them, which is what an extraction breaks silently. Pins: one `pending` guard
shared by manual Save, Repeat and the quick-entry confirm; the quick draft surviving navigation and a
failed parse and clearing only after success; quick parsing falling back to the stepper's weight; the
batch taking the add-on from the toggle; and Repeat taking the add-on from the set it copies rather
than from the toggle. No app code changed.

**Slice 5 — entry block extracted to `js/ui/entry-panel.js` ✅**

Pure refactor. `log.js` drops from 376 to ~150 lines and now only composes the screen (header, Last
time, Today, nudge, panel). The boundary **includes quick entry**, which the Codex review caught as
the blocker in the brief: the quick confirm joins the same `saveButtons` list and calls the same
guard, reads the panel's live weight and add-on, and clears its draft only after a successful write.
Drawing the line at the manual controls would have meant callbacks across a module boundary or a
second independent guard — quietly downgrading the rule that every write button for one exercise is
mutually exclusive (plan §12).

`fmtSet` moved to `components.js` with the other formatters rather than being re-exported from
`log.js`, which would have been a misleading indirection kept only to avoid touching an import line;
`pickRepeatSet` moved with the panel. **Only import lines changed in `tests/log.test.js` — no
assertion anywhere was edited**, which was the success criterion for this slice.

Also recorded in the panel: `ctx.refresh()` after a write is deliberately **not** gated on
`ctx.isCurrent()`. `renderSeq` is monotonic and `shouldCommitRender` requires `seq === currentSeq`,
so a background render that began before the write can never commit over the post-write one. Gating
the refresh is the actual hazard — it would skip exactly when a background render had invalidated the
token, letting a pre-write snapshot be the last thing committed.

**Slice 6 — the superset screen ✅**

`#/superset/<idA>/<idB>` shows two stacked panels, each the shared entry panel in compact mode, so
both exercises are logged without leaving the screen. Started from "⇄ Superset with…" on either
exercise's own screen; a ⇄ header button swaps which is on top. Recorded as **D10**.

The pair lives in the route because it is ad-hoc per session (owner's choice): nothing stored, no
pairs to manage, no schema change, and an iOS relaunch onto the last hash restores it. `parseRoute`
**rejects an exercise supersetted with itself** — that would be two independent guards and two live
Save buttons over one exercise, the duplicate path the guard exists to prevent. If one exercise has
since been archived or deleted the screen falls back to the survivor's own logging screen with a
toast; if both are gone, Home. Every render-time toast and redirect is gated on `ctx.isCurrent()`.

**Scroll behaviour was measured rather than assumed**, per the review. On WebKit at iPhone viewport,
saving from the lower panel moves the scroll only when the page genuinely gets shorter and the
browser clamps to the new bottom (573→476 as a placeholder is replaced by a one-line summary);
with the page height stable it does not move at all (476→476). Preserving `scrollY` could not fix a
clamp, so **no `app.js` scroll change was made** — a global policy would touch every screen for no
benefit. Re-open if the owner sees a jump on the device.

**Tests** (2026-07-29): Vitest 121/121, Playwright 39/39 (run twice, stable), `check:precache` OK
(27 files). Cache `gt-v0.21.0`. New coverage: superset route parsing including self-pairing and
malformed pairs; two exercises logging independently on one screen across two alternating rounds, the
sets landing against the right exercises; the pair surviving a reload; swapping the panels; quick
entry absent from compact panels while the per-panel guard still refuses a double tap; and the
archived/deleted fallbacks.

**Deployed 2026-08-04.** Pushed `96c011e`–`ede64d0` to `main`; GitHub Pages build `ede64d0` verified
built, and the live `sw.js` confirmed serving `gt-v0.21.0` with `entry-panel.js` and `superset.js`
both reachable. **Still outstanding:** the owner's device pass on the iPhone — see `docs/HANDOFF.md`.


New coverage: the add lands on the logging screen with the chosen group applied; no chip selected
stores Ungrouped; re-tapping a chip clears it; a duplicate name keeps the sheet open with the text;
Manage's add stays on Manage across two consecutive adds.

**Five existing browser tests were edited, and it is worth being explicit that this was a real
behaviour change and not test accommodation.** `exercises.spec.js` asserted the old
return-to-Home behaviour directly; `features.spec.js` and `render-race.spec.js` add from Home in a
helper and needed a Back tap to leave the caller where it was; `dashboard.spec.js` and
`history-day.spec.js` tapped a list row that the app now skips past. No assertion about anything
other than the add flow was weakened.

## 2026-07-25 — Change set 2: four owner-feedback items ✅

Owner reported the Home search had stopped working and asked for four things. All implemented; no schema change.

**Completed**
- **Fixed the Home filter regression.** When rendering moved to building each screen in a detached container and moving its children into `#app` (commit `333474b`), the filter's `input` handler still re-queried that container — which is empty after the move — so typing matched nothing. The filter is now wired to the captured row/heading **elements**, which stay live after the move. The existing filter test never created >12 exercises (the threshold for the box to appear), so it never exercised this path; a new browser test now seeds 13 and asserts narrowing + clearing.
- **Search on the Progress tab.** A type-ahead box narrows the exercise picker (shown once there is more than one exercise). Options are rebuilt from the matches rather than hidden, because iOS Safari's native `<select>` wheel ignores `display:none` on `<option>`. A miss reports "No exercise matches …" instead of silently showing everything.
- **"Heavier but fewer reps" now reads as a single strength number.** The entry screen shows a live estimated 1-rep max (Epley, the same formula the dashboard already uses) and compares it to the previous session's best: ▲ stronger / same / ▼ below. Recorded kg only, so an add-on set is flagged and not compared (D7); shown only up to 12 reps, where Epley is reliable. New pure helper `bestE1rm` in `stats.js`.
- **Rename and re-group from inside the exercise.** The entry screen header gains an "✎" menu (Rename / Muscle group), so neither action needs a trip back to Manage. Both flows live in a new `js/ui/exercise-actions.js` shared by Manage and the entry screen, so there is one source of truth.

**Tests run** (2026-07-25): Vitest 117/117, Playwright 26/26, `check:precache` OK (25 files). New coverage: Home filter past 12 exercises, Progress-tab search (narrow + miss), the live e1rm readout (stronger/below), rename+group from the entry screen, and a `bestE1rm` unit test. Cache bumped `gt-v0.16.0` → `gt-v0.17.0`; `js/ui/exercise-actions.js` added to `PRECACHE`.

**Known issues**: none.

**Next step**: owner device pass on the iPhone, then deploy.

**Departures from plan**: the muscle-group/rename flows moved out of `manage.js` into a shared module so the entry screen can reuse them — behaviour unchanged.

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
