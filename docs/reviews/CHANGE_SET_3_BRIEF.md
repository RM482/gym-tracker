# Change set 3 — design brief

Status: **reviewed and amended**. Written 2026-07-29, after the owner's third round of real-use
feedback. Reviewed by Codex the same day.

> **Read `CLAUDE_RESPONSE_CHANGE_SET_3.md` alongside this document — it supersedes the brief where
> the two disagree.** The review found three blockers, all accepted. The material changes: the
> entry-panel extraction boundary must include quick entry; mass grouping saves per tap instead of
> staging an Apply; the superset route rejects identical ids and needs an explicit invalid-route
> policy; the folded "2 of 6 done" count is cut; the slice plan grows to six.

Baseline: `gt-v0.17.0`, `DB_VERSION = 2`, working tree clean, Vitest 117 / Playwright 26 green.

## The four items, as reported

Verbatim from the owner:

1. "When adding an exercise, I want to immediately be able to group it and record my sets — now it
   goes back to the main menu."
2. "I want to be able to mass group items. E.g. I select 'Arms', and then go through the list to
   select all arms exercises, thereby grouping them."
3. "I do supersets — is there a way to have two exercises open at the same time? Perhaps in a split
   screen? Now I have to go back and forward between exercises in between reps to record weight
   changes."
4. "I need to be able to 'fold in' groups (with a little arrow) so I don't have a massive list."

None of these is a defect report; the owner states the app otherwise works well. Item 1 is a
friction complaint about a deliberate past decision, items 2–4 are additions.

## Owner decisions taken up front

Put to the owner before designing, because each changes the shape of the work:

| Question | Decision |
|---|---|
| Superset layout | **Both exercises stacked on one scrolling screen**, each with its own entry controls. Not a true side-by-side split (columns would halve the stepper buttons on an iPhone) and not a fast-switch button. |
| Superset pairing lifetime | **Picked fresh each time.** No stored pairs, no setup screen, no "my supersets" management. |
| New-exercise flow | **Name + optional muscle group in one sheet**, then land directly on that exercise's logging screen. |
| Folded groups | **Remembered between visits**, until the owner unfolds them. Default: unfolded. |

Item 3's answer is the load-bearing one: an ad-hoc pair needs no new stored data at all, which keeps
this whole change set free of any schema change.

## Item 1 — Add an exercise, then land in it

**Today.** `addButton()` in `home.js:188-209` opens `promptSheet`, calls `store.addExercise(value)`
and then `ctx.refresh()`, which re-renders Home. The comment there records the reasoning: grouping
was left to Manage so the common path stays "one field long", avoiding a second modal on every add.

**Change.** One sheet collects the name *and*, optionally, the group; on submit the app navigates to
`#/log/<newId>`. `store.addExercise(name, { muscleGroup })` already accepts the group and already
returns the created exercise including its `id` (`store.js:166-178`), so no store change is needed.

New shared `exerciseAddSheet(ctx, { onAdded })` in `js/ui/exercise-actions.js`, built on the existing
`sheet()` primitive rather than by extending `promptSheet` — `promptSheet` is used in five places and
should not grow a mode flag for one caller.

Sheet contents: name input, then a row of the eight `MUSCLE_GROUPS` chips plus an implicit "skip".
No chip selected ⇒ `muscleGroup: null` ⇒ Ungrouped, exactly as today. Validation errors (duplicate
name) surface inline and keep the sheet open, matching `promptSheet`'s contract.

**Where the jump applies, and where it deliberately does not:**

- **Home's ＋ Add exercise** → jumps into the new exercise. This is the reported path.
- **Manage's ＋ Add exercise** (`manage.js:177-193`) → stays on Manage. Manage is a housekeeping
  screen; someone adding three exercises in a row there should not be thrown into a logging screen
  after the first. It gets the same name+group sheet, without the navigation.
- **First-run starter chips** (`home.js:171-180`) → stay on Home. Tapping one of eight suggestions
  and being navigated away after the first would make the other seven unreachable in that flow.

This is a partial reversal of the "no second modal" note in `home.js:186-187` and touches the spirit
of **D8** ("existing exercises start Ungrouped and are tagged incrementally"). D8's substance is
unaffected — the taxonomy, Home-only grouping and the Ungrouped/Other distinction are unchanged —
but the reasoning should be re-recorded, since the owner has now asked for the opposite trade-off.
Proposed as a decision-log amendment, not a silent reversal.

## Item 2 — Group several exercises at once

**Today.** Grouping is one exercise at a time: Manage ⋯ → "Muscle group: X" → pick
(`manage.js:107-130` → `exercise-actions.js:26-40`), or the same from the ✎ menu inside an exercise.
Tagging twenty exercises is sixty taps.

**Change.** A grouping mode on Manage, matching the owner's described order (group first, then walk
the list). New button under the list: "Group several exercises…".

1. Tap it → `menuSheet` picks the target group (the eight groups; Ungrouped is not offered as a
   target — see below).
2. The screen enters grouping mode: header becomes "Group as Arms", every active exercise becomes a
   toggle row with a checkbox. Rows already in Arms start **ticked**.
3. Tapping toggles. A row currently in another group shows what would be overwritten
   ("Chest → Arms") so nothing is reassigned invisibly.
4. "Apply" writes every change in one pass and toasts a count; "Cancel" writes nothing.

**Batch-on-apply rather than save-per-tap.** Save-per-tap is simpler, but it makes the meaning of a
second tap ambiguous: does re-tapping an exercise that was already Chest revert it to Chest or drop
it to Ungrouped? Deferring the write lets the mode hold a clean before/after set, makes a mis-tap
free to correct, and makes Cancel meaningful.

**Unticking a pre-ticked row sets it to Ungrouped**, which is the only sensible reading of "remove
from Arms". This is the one destructive-ish edge, so the Apply toast names it: "6 grouped as Arms,
1 ungrouped". Ungrouped is therefore reachable by unticking and does not need to be a target group.

Writes: loop `store.setMuscleGroup(id, group)` over changed rows only. Each is its own transaction —
acceptable here (a dozen small writes, no cross-record invariant), and it keeps the store API
unchanged. A batch store method is deliberately not added for this.

Manage stays a flat list in grouping mode, per **D8**.

## Item 3 — Supersets: two exercises on one screen

The largest item, and the only one that adds a screen.

**Today.** Nothing relates two exercises. Logging A then B means Home → find B → tap → log → back →
find A → tap, between every round.

**Change.** A new screen at `#/superset/<idA>/<idB>` showing two stacked entry panels.

**The pair lives in the URL.** Because the owner picks the partner fresh each session, the route
*is* the pairing — no new store, no settings key, no schema change, and iOS restoring the app to its
last hash restores the pair for free. Reversing the ids is the same superset with the panels
swapped, which is harmless.

**Entry point.** A "⇄ Superset with…" button on the normal logging screen opens a picker of the
other active exercises (with the same >12 filter box as Home) and navigates. Back returns to A's
plain logging screen. No Home entry point in this change set — you are always already in one of the
two exercises when you decide to superset.

**Panel contents** — a compact version of the existing entry block, per panel:

- Exercise name as a heading, tappable → that exercise's full logging screen.
- "Last time" one-liner and today's sets one-liner (compressed from the two cards on the full screen).
- Weight stepper, add-on toggle, reps stepper, "Save set", "↻ Same as last time".
- The live estimated-1RM readout (one line, and it is the reason change set 2 added it).
- Plateau nudge if one applies.

**Deliberately not in a panel:** the typed/dictated quick-entry box (bulky, and it is a
plan-several-sets-at-once tool, which is not what supersetting mid-round needs), and the "Earlier:"
history line. Both stay one tap away on the full screen.

**The refactor this forces.** `log.js` builds the entry block inline across roughly
`log.js:136-269` — steppers, add-on toggle, e1RM readout, the shared `pending` write guard, Save,
and Repeat. The superset screen must not fork that logic. Proposal: extract it into
`js/ui/entry-panel.js` exporting `buildEntryPanel(ex, data, ctx, { compact })`, consumed by both
`log.js` and the new `superset.js` — the same pattern used when `exercise-actions.js` was extracted
in change set 2 for exactly this reason.

**This refactor is the main risk in the change set.** It touches the most-used code path in the app,
and the write guard (`log.js:224-238`) is called out in the plan as "the ONLY duplicate protection
(§12)". Two rules for it:

- Each panel gets **its own** `pending` guard and its own save-button list. A shared guard would let
  a save on Bench disable the Save button on Row, which in a superset is precisely the wrong
  coupling. Two panels writing to two different exercises cannot duplicate each other.
- The extraction must be behaviour-preserving for `log.js`; the existing Vitest/Playwright coverage
  of the logging screen is the regression net and must pass **unchanged**, with no test edited to
  accommodate the refactor. Any test that needs editing is evidence of a behaviour change and must
  be justified, not absorbed.

**Refresh and scroll.** Saving calls `ctx.refresh()`, which re-renders the whole screen and
`el.replaceChildren(...)` in `app.js:219`. On a tall two-panel screen, saving in the lower panel may
throw the view back to the top. **To be verified empirically before choosing a fix** — document
scroll is not reset by `replaceChildren` per se, so this may not reproduce. If it does, the fix
belongs in `app.js`: preserve `window.scrollY` when the route key is unchanged (a refresh) and reset
it when the route changes (a navigation). That rule is a small general improvement and would also
help the plain logging screen.

**Rejected: `addOn` state across a refresh.** Note that the add-on toggle is local state re-derived
from the last set on each render (`log.js:142-147`); nothing about the refactor changes that, and it
should not be "improved" opportunistically inside this change set.

## Item 4 — Fold groups on Home

**Today.** `home.js:55-67` renders a plain `<h2>` per group with all rows always visible.

**Change.** Each heading becomes a button with a ▸/▾ arrow and a count ("Legs (6) ▾"), toggling its
rows. Collapsed groups are stored in settings as `collapsedGroups: []` (array of group names,
including the literal `'Ungrouped'`).

**No schema change.** Settings is a single record merged over `DEFAULT_SETTINGS` on read
(`store.js:398-401`), so a new key needs no migration and an older backup simply gets the default.
`updateSettings` does **not** call `touchDataChange` (`store.js:403-411`) — verified — so folding a
group correctly does not count as a data change and cannot trigger the backup-overdue banner.
Per the project's "writes canonical, reads tolerant" rule, `collapsedGroups` is filtered to known
group names on read, so a hand-edited or foreign backup cannot inject junk into the UI.

**Interaction with the filter box** (the >12-exercise search, `home.js:128-141`): while the filter
has text, every group renders expanded so matches cannot hide inside a folded section; clearing the
filter restores the stored fold state. The filter code must keep working on captured elements rather
than DOM queries — that re-query bug is exactly the change-set-2 regression (`home.js:46-49`) and
folding adds a second way to reintroduce it.

**Done-today visibility.** Folding hides the ✓ ticks that show what is already done. Proposed: when
a folded group contains exercises logged today, the heading says "Legs · 2 of 6 done". Small, and it
preserves the point of the tick feature under folding. Flagged as optional scope.

**Accessibility.** `aria-expanded` on the heading button and `aria-controls` pointing at the rows
container; the arrow is decorative (`aria-hidden`) with the state carried by `aria-expanded`, not by
the glyph. Consistent with the F6 fix in change set 1, where an `aria-label` override was removed
because it destroyed the computed name.

## What this change set does *not* touch

- `DB_VERSION` stays **2**. No record shape changes. No migration, therefore no migration test.
- No change to the muscle-group taxonomy (**D8**) or to add-on semantics (**D7**).
- No stored superset pairs, no workout templates, no rest timer — all unrequested.
- Manage stays flat and Home-only grouping stays Home-only.

## Proposed slices

Each ends with tests green, `CACHE_VERSION` bumped, `PROGRESS.md` updated, its own commit.

1. **Add-exercise sheet + landing** (item 1). Smallest, self-contained, immediate daily benefit.
2. **Fold groups** (item 4). Home-only, plus one settings key.
3. **Mass grouping** (item 2). Manage-only.
4. **Entry-panel extraction** — pure refactor, no behaviour change, existing tests unedited.
5. **Superset screen** (item 3) on top of slice 4.

Slices 4 and 5 are separated so the refactor can be reviewed and reverted independently of the
feature that motivates it.

## Test plan

New unit coverage: `collapsedGroups` normalisation (unknown names dropped); the grouping-mode
before/after diff (which ids change, which are ungrouped) as a pure function; superset route parsing
in `parseRoute`, including a malformed or identical-id pair.

New browser coverage: add-with-group lands on the logging screen with the group applied; fold a
group, reload, still folded; filtering reveals rows inside a folded group and clearing re-folds;
grouping mode applies and cancels; a superset screen saving a set in each panel independently and
both landing against the right exercise.

Unchanged and must stay green: the full existing logging-screen suite, as the guard on slice 4.

## Open questions for review

1. Is `#/superset/<idA>/<idB>` the right home for the pairing, given it is explicitly session-only?
   The alternative is module memory as `quickDrafts` does (`log.js:18`), which loses the pair on
   reload — worse on iOS, where the app is killed frequently.
2. Is per-panel `pending` genuinely safe, or is there a duplicate-write path across two panels that
   the single-screen guard was covering incidentally?
3. Does anything else read `settings` in a way that a new array-valued key could disturb — analysis
   export, backup validation, the settings screen?
4. Is the "2 of 6 done" folded heading worth its complexity, or scope creep?
5. Slice 4's success criterion is "no existing test edited". Is that too strict — is there a case
   where a legitimately better structure forces a test change?
