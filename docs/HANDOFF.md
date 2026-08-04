# Handoff — resume here

Last updated: 2026-08-04, after deploying change set 4. Written so Claude, Codex, or the owner can pick this up cold.

## Where things stand

The app is **built, deployed and in real use**. v1 (phases 0–8) shipped on 2026-07-19; change set 1 shipped 2026-07-21; change set 2 shipped 2026-07-25; change set 3 shipped 2026-08-04; change set 4 (superset-picker scrolling) shipped the same day.

- Live: <https://rm482.github.io/gym-tracker/> — repo `RM482/gym-tracker`, GitHub Pages from `main`. Push to `main` = deploy.
- Working tree clean, `main` in sync with `origin/main`; change set 3 shipped in commits `96c011e`–`ede64d0`, Pages build verified serving `gt-v0.21.0`.
- Service-worker cache `gt-v0.22.0`. **`DB_VERSION = 2`** (unchanged — neither change set 3 nor 4 touched the schema).
- Tests green: **Vitest 121/121, Playwright 43/43, `check:precache` OK (28 files).**

```bash
npm install          # once
npm test             # unit
npm run test:browser # browser (npx playwright install webkit once)
npm run check:precache
npm run serve        # http://localhost:4173
```

## The one thing outstanding

**The owner's device pass on their iPhone.** Nothing is blocked on code; this is the acceptance step. Change set 3 is deployed and changed nothing about stored data (no migration).

New in change set 3, worth trying first:

A. Add an exercise from Home — it should take the name *and* a group in one sheet, then drop you straight into that exercise ready to log.
B. Manage → "Group several exercises…" → pick Arms → tap down the list. Each tap saves as you go; tapping a ticked row puts it back to Ungrouped.
C. Tap a group heading on Home to fold it away. It should still be folded next time you open the app.
D. Open an exercise → "⇄ Superset with…" → pick the partner. The picker is grouped and foldable and scrolls; both exercises then stay on one screen, so you log alternating sets without navigating. ⇄ in the header swaps which is on top.

Carried over from change set 1:

1. Tag a few exercises (Manage → ⋯ → Muscle group). They start Ungrouped by design.
2. Use the machine add-on toggle mid-workout; check the `+on` badge reads well in history.
3. Confirm zoom-on-tap is genuinely gone while tapping quickly between sets.
4. Watch for the duplicate list by switching away from the app and back repeatedly (the old trigger).

Added by change set 2:

5. Confirm the Home filter box works again (needs >12 exercises to appear) — this is the reported regression.
6. Try the new Progress-tab search, the live estimated-1RM readout on the entry screen, and Rename / Muscle group from inside an exercise (the ✎ header button).

Also still unverified on a real device, from the original plan's device script: Add to Home Screen, dictation into quick entry, the Files/share sheet for export, force-quit persistence, and the update toast on a live deploy. Browser automation cannot truthfully cover these.

When the next round of feedback arrives, treat it as change set 4 and follow the same process (below).

## What changed in change set 1

Owner reported six things; all six are done. Full reasoning in `docs/reviews/` and `docs/PROGRESS.md`.

| # | Item | Outcome |
|---|------|---------|
| 1 | Exercise list appearing 2–3 times | Fixed. Overlapping renders each cleared `#app` then interleaved appends. Screens now build detached and commit atomically via `shouldCommitRender()`. |
| 2 | Group by muscle group | Home groups under a curated taxonomy; Ungrouped kept distinct from a deliberate Other. Manage stays flat (grouped sections would fight its global ▲▼ order). |
| 3 | Highlight what's done this session | Rows logged today are ticked and receded, never reordered. |
| 4 | Machine "on" add-on switch | Recorded as `SetEntry.addOn` metadata with a `+on` badge. Its kilograms are unknown, so it is **never** folded into `weightKg` or any calculation. |
| 5 | Notify after 3 sessions at the same weight | In-app nudge on the Log screen (not an OS push — that needs a push service and account, contrary to the app's principles). Compares `(top weight, add-on)` as a pair. |
| 6 | Screen zooming on tap | Fixed: `touch-action: manipulation` kills double-tap zoom; a `max(1rem, 16px)` floor on every editable control kills iOS focus zoom. Pinch-zoom preserved. |

Plus, unprompted but flagged to and approved by the owner: the backup reminder no longer fires the instant anything is saved when they have never exported (`firstDataChangeAtMs` baseline, plan §6.1 timing).

Two **pre-existing latent defects** in shipped code were found during review and fixed as prerequisites of the schema change: backup restore never replayed record migrations, and `VersionError` (stale code meeting newer data) was unhandled and could route the owner toward the destructive reset screen.

## What changed in change set 2

Owner reported one regression and asked for three additions; all four done. No schema change. Full reasoning in `docs/PROGRESS.md` (2026-07-25 entry).

| # | Item | Outcome |
|---|------|---------|
| 1 | Home search stopped working | Fixed. The detached-container render (`333474b`) left the filter's `input` handler re-querying a container whose children had already been moved into `#app`, so it matched nothing. It now holds the row/heading **elements**, which stay live after the move. Regression test seeds 13 exercises (the box only appears past 12, which is why no test caught it). |
| 2 | Search in the Progress tab | Type-ahead box narrows the exercise picker; options are rebuilt from matches (iOS Safari ignores `display:none` on `<option>`); a miss reports it. |
| 3 | Reflect heavier-but-fewer-reps as progress | Live estimated 1-rep max (Epley) on the entry screen, compared to last session's best (▲/=/▼). Recorded kg only, add-on flagged not compared (D7); shown ≤12 reps. New pure helper `bestE1rm` in `stats.js`. |
| 4 | Rename / group from inside an exercise | ✎ menu in the entry-screen header. Shares one implementation with Manage via new `js/ui/exercise-actions.js` (added to `PRECACHE`). |

**Process note (deviation):** unlike change set 1, this round was implemented and deployed directly, without a design brief or an independent Codex review round. It is small, self-contained and fully tested, but if the owner wants the same review gate applied retrospectively, run Codex read-only over the change-set-2 diff per the process below.

## What changed in change set 3

Owner reported four things; all four are done. Full reasoning in `docs/PROGRESS.md` (2026-07-29) and `docs/reviews/CHANGE_SET_3_*`.

| # | Item | Outcome |
|---|------|---------|
| 1 | Adding an exercise returned to the main menu | The add sheet now takes name + optional group together, then lands on that exercise's logging screen. **D9**, amending D8. Manage's add and the starter chips deliberately stay put. |
| 2 | Mass grouping | `#/manage/group/<Group>`: pick the group, tap down the list, each tap writes immediately. **D11**. |
| 3 | Supersets | `#/superset/<idA>/<idB>`: two stacked compact entry panels on one screen, ad-hoc pair held in the route, no stored pairs. **D10**. |
| 4 | Fold groups away | Foldable Home sections with ▸/▾ and a count, remembered in `settings.collapsedGroups`. |

Plus, as a prerequisite of item 3: the entry block was **extracted from `log.js` into `js/ui/entry-panel.js`** so the superset screen could reuse it rather than fork it. Characterisation tests were written *before* the move (`tests/browser/entry-panel.spec.js`) and no existing assertion was edited — only import lines in `tests/log.test.js`.

Also fixed on the way: a **pre-existing flaky browser test** (plateau nudge) that typed into the entry inputs without waiting for the post-save re-render.

## Decisions that bind future work

Recorded in `docs/DECISIONS.md` (D1–D11). The ones most likely to be re-litigated:

- **D4** — Fitbit/calorie import rejected: needs a developer app, OAuth and online-only APIs, against the no-login/offline/local-first design. Duration is derived locally from set timestamps instead; calories are deliberately absent rather than invented.
- **D6** — the plateau nudge is **in-app**, not an OS notification, for the same reason.
- **D7** — the add-on's weight is unknown and must never be guessed into `weightKg`. `beatsBaseline()` in `stats.js` deliberately refuses to claim an ordering it cannot establish (notably: dropping the add-on and adding weight is *not* provably heavier). If the owner ever measures the add-on, an optional per-exercise `addOnKg` can fold in **without** another set-schema change.
- **D5** — zoom: deliberate pinch-zoom stays available (plan §13 accessibility). Do not add `user-scalable=no`.
- **D8** — muscle groups: curated list only, Home-only grouping, no enable/disable setting. **Amended by D9**: an exercise may now be grouped as it is added.
- **D10** — supersets are ad-hoc and live in the route; no stored pairs, no schema change. Each panel keeps its **own** write guard, and `parseRoute` rejects an exercise supersetted with itself, because two panels over one exercise would mean two live Save buttons for the same target.
- **D11** — bulk grouping keeps its mode in the route and writes on every tap, because the app re-renders on focus/visibilitychange and anything held in a render closure is silently lost when the phone locks.

## Schema and deploy rules

- `DB_VERSION = 2`. The v1→v2 migration adds `Exercise.muscleGroup` (nullable) and `SetEntry.addOn` (boolean, default false).
- **Never lower `DB_VERSION`.** Upgrades are one-way; a rollback that reverts it breaks every upgraded device. Revert behaviour, keep the version and its readers. See `docs/MAINTENANCE.md`.
- Any new schema change must ship: the record transform, updated constructors/validators, a pure fixture test **and** a real database-upgrade test, plus backup-import coverage. `migrateBackup()` in `backup.js` replays the same transforms — do not fork that logic.
- Writes are canonical, reads are tolerant: new fields are normalised on read so a record that escaped a migration is corrected rather than hidden from history. Keep that split.
- Bump `CACHE_VERSION` in `sw.js` in the same commit as any app change; `npm run check:precache` fails if the precache list and files on disk diverge.

## Process to follow for the next change set

The owner wants Codex used as an independent reviewer. What worked:

1. Investigate reported bugs in the code **and reproduce them** before proposing fixes.
2. Write a design brief to `docs/reviews/CHANGE_SET_N_BRIEF.md` with options, a recommendation and open questions.
3. Run Codex read-only over the brief **plus the real code**:
   ```bash
   "/Applications/ChatGPT.app/Contents/Resources/codex" exec --sandbox read-only \
     -C "/Users/mr/Desktop/AI/Test projects/Gym tracker" \
     -o docs/reviews/CODEX_REVIEW_CHANGE_SET_N.md - < prompt.md
   ```
4. Verify Codex's load-bearing claims against the code before accepting them, then write `CLAUDE_RESPONSE_*.md` marking each finding accepted / partially accepted / rejected with reasons.
5. Put genuine product choices to the owner (AskUserQuestion works well); decide technical ones yourself.
6. Implement in small slices, each ending with tests green, cache bumped, `PROGRESS.md` updated, and its own commit.
7. **Run Codex again over the finished implementation, not just the plan.** It found five real defects that the plan review could not have caught, including a latent multi-version migration bug.

Anything touching the owner's data on their phone: ask them to export a backup first and hold the deploy until they confirm.

## Known gaps, deliberately left

- Sheets are capped at `85dvh`. A future sheet with a lot of content should scroll rather than grow; `.picker-list` is the pattern for keeping a title and Cancel fixed while the list scrolls.
- No browser test for the `DbTooOldError` recovery screen (unit-tested at the database layer; the screen is a static render of a known branch).
- No scroll-restoration policy in `app.js`. Measured on WebKit at iPhone viewport: saving from the lower superset panel moves the scroll only when the page genuinely shortens and the browser clamps; with a stable page height it does not move. Re-open only if the owner sees a jump on the device.
- No end-to-end browser test of add-on correction via quick-entry / repeat / the set editor (each is unit-tested through the store; the toggle itself is browser-tested).
- Device-only behaviours listed above.

## Document map

`REQUIREMENTS.md` (what it must do) · `PROJECT_PLAN_FINAL.md` (approved plan, still the reference for §-numbers cited in code comments) · `DECISIONS.md` (D1–D8) · `PROGRESS.md` (newest first, one entry per slice) · `TESTING.md` (device scripts, tap-count convention) · `MAINTENANCE.md` (recipes: add a field, bump cache, restore, deploy, roll back) · `reviews/` (every Codex review and Claude response, both change sets).
