## Summary

The change set has a sound overall direction, but it is not ready to implement as written. Item 1’s diagnosis and detached-render approach are substantially correct, and Items 3 and 6 are appropriately restrained. The main blockers are the unimplemented backup-migration replay, unsafe handling of old code opening a newer database, ambiguous grouping/reordering behavior, and incomplete add-on/nudge semantics.

After resolving the Critical and Major findings below—and obtaining the small number of genuine owner decisions—the work can proceed without violating the local-first, offline, minimal-scope, or accessibility principles.

## Per-item verdicts

| Item | Verdict | Note |
|---|---|---|
| 1 | Approach sound | Root cause is correct; detached rendering works, but the guarded swap and regression test need tighter specification. |
| 2 | Needs change | Curated groups are sensible, but the proposed setting and grouped Manage screen introduce unresolved scope and reorder behavior. |
| 3 | Approach sound | Home-only, non-reordering highlighting is appropriate; per-group counts are optional scope. |
| 4 | Needs change | Metadata-only is honest, but every write/edit/display path and its interaction with calculations must be defined. |
| 5 | Needs change | In-app is correct, but the threshold, current-session behavior, and add-on comparison are not precise enough. |
| 6 | Needs change | `touch-action: manipulation` is right, but the claim that every input is already at least 16px is false. |

## Findings

### F1

- **Severity**: Major
- **Item**: 1
- **Issue**: The root-cause diagnosis is correct. [`js/app.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/app.js:170>) increments `renderSeq`, checks it only after `ensureCtx()`, clears the live root, then awaits the screen:

  ```js
  if (seq !== renderSeq) return;
  el.innerHTML = '';
  await SCREENS[route.screen].render(el, route.params, ctx);
  ```

  Meanwhile, [`js/app.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/app.js:224>) registers independent `hashchange`, `focus`, and visible `visibilitychange` renders. In Home, all calls await settings, exercises and sessions before synchronously appending the rows ([`js/ui/home.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/home.js:20>)). Thus several renders can each clear once and later append complete lists to the same live root. The diagnosis is slightly imprecise in saying Home awaits “while appending rows”; it does not await inside the row loop, but that does not invalidate the race.
- **Recommendation**: Implement the detached-root design with this exact commit condition: render into a fresh container, then perform `replaceChildren(...container.childNodes)` only when `seq === renderSeq`, `updateRequired === false`, and the route is still current. Never clear the live root at render start. Keep `hashchange` immediate; coalesce only redundant focus/visibility refreshes into one scheduled refresh.

### F2

- **Severity**: Minor
- **Item**: 1
- **Issue**: No exported screen currently performs an unawaited append to its supplied root after `render()` resolves. Dashboard awaits its initial asynchronous `draw()` ([`js/ui/dashboard.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/dashboard.js:52>)); subsequent `draw()` calls are user-event work on the mounted screen. Log’s delayed callback only scrolls after the quick-entry input receives focus ([`js/ui/log.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:225>)). Listeners attached during detached rendering remain valid, and Home’s `el.querySelectorAll(...)` correctly scopes to the detached root. However, detached rendering prevents stale DOM commits, not all stale side effects: screen renders can still call `toast()` or change `location.hash` while superseded.
- **Recommendation**: Document the screen-render contract: rendering may build and attach listeners to its provided root, must await initial data-driven DOM work, and should avoid navigation, focus or global UI side effects after an await unless still current. Audit that contract whenever new screens are added.

### F3

- **Severity**: Minor
- **Item**: 1
- **Issue**: The proposed event-burst regression can be timing-dependent. The existing temporary test dispatches events and waits 600ms, but does not force a known interleaving. It also dispatches `visibilitychange` without controlling the actual visibility state and identifies rows only by count.
- **Recommendation**: Make the race deterministic by delaying a screen data read or otherwise controlling render completion order. Assert one screen header and exactly one row for each seeded exercise after focus/visibility bursts and rapid navigation. Remove or rename the throwaway `zz-repro-tmp.spec.js` test when the permanent regression is added.

### F4

- **Severity**: Major
- **Item**: 2
- **Issue**: A curated, single-value taxonomy is proportionate for 10–20 exercises, but the UI proposal is over-scoped and incomplete. A `groupByMuscle` preference was not requested and adds another setting and interaction with `exerciseSort`. More importantly, grouping Manage conflicts with its global ▲/▼ reorder model: [`js/ui/manage.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/manage.js:24>) renders and moves exercises in a single global order. Under fixed group sections, moving across a group boundary may appear to do nothing or produce surprising placement. The brief does not define this.
- **Recommendation**: Group Home only. Keep Manage flat, show the assigned group as secondary text, and provide an edit action there. Preserve global manual ordering within each Home group. Do not add `groupByMuscle` unless the owner specifically wants a disable switch; grouping can remain effectively flat while everything is Ungrouped.

### F5

- **Severity**: Minor
- **Item**: 2
- **Issue**: Filtering grouped rows is under-specified. The current filter only toggles `.list-row[data-name]` ([`js/ui/home.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/home.js:50>)); group headings and counts would remain visible even when all their rows are filtered out. “Other/null = Ungrouped” also conflates a deliberately assigned “Other” category with an unclassified record.
- **Recommendation**: Use distinct `Other` and `Ungrouped` sections. Filtering should search across all groups, hide empty headings, and define whether displayed counts describe the whole group or the filtered result. Keep group headings semantic (`h2` or labelled sections), not visual-only dividers.

### F6

- **Severity**: Minor
- **Item**: 3
- **Issue**: The approach is correct, including use of the approved 03:00 workout-day boundary and no mid-workout reordering. A new full-store query is probably unnecessary: Home already obtains `getLastSessionsByExercise()`, whose result includes today ([`js/store.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:341>)); an exercise is done when its latest session day equals `getTodayDay()`. Per-group “2/5 done” counts go beyond the owner’s request and may add clutter.
- **Recommendation**: First ship the row-level check and subdued styling, deriving it from the already-loaded session map. Use visible or visually hidden text such as “Logged today” in the button’s accessible name; do not rely on a checkmark’s standalone `aria-label`. Defer group counts unless the owner finds the basic highlight insufficient.

### F7

- **Severity**: Critical
- **Item**: cross-cutting
- **Issue**: The brief incorrectly says the import path “already replays” migrations. The approved plan requires that behavior in `PROJECT_PLAN_FINAL.md` §10, but [`js/backup.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/backup.js:25>) only validates and returns the original object. It neither imports `migrations` nor applies `migrations[s…DB_VERSION-1].records`. [`replaceFromBackup`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:378>) then writes those records directly. A v1 backup restored into v2 could therefore retain missing `muscleGroup` and `addOn` fields, defeating the migration and potentially making records unreadable once validators are tightened.
- **Recommendation**: Make backup staging replay the exported pure record migrations before current-schema validation and insertion, without mutating the input. Set the staged schema version to the current version. Add explicit v1-backup→v2 tests covering both fields, malformed input, referential integrity and a successful restore round trip.

### F8

- **Severity**: Major
- **Item**: cross-cutting
- **Issue**: The proposed “two nullable fields” description is inaccurate: `muscleGroup` is nullable, while `addOn` should be a required boolean defaulting to `false`. Batching them in one v2 migration is otherwise sound because they ship as one compatible release and require no structural index change. The proposal does not say that fresh writes, edits, validators, backup validation and fresh-install records must all produce or accept the current shapes. Merely transforming existing records is insufficient.
- **Recommendation**: Define v2 invariants explicitly: `Exercise.muscleGroup` is `null` or one approved taxonomy value; `SetEntry.addOn` is boolean. Update every constructor and validator at the same time as the migration. Add the mandated pure fixture and real v1-database upgrade tests from `MAINTENANCE.md`, plus fresh-v2 bootstrap and backup-import tests.

### F9

- **Severity**: Major
- **Item**: cross-cutting
- **Issue**: The update protocol safely closes an old open connection when new code upgrades the database ([`js/db.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/db.js:71>)), but it does not handle the reverse skew cleanly. Old cached JS calling `indexedDB.open(..., 1)` against an already-v2 database receives `VersionError`. The current generic recovery UI counts that as an open failure and can eventually expose destructive reset ([`js/app.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/app.js:130>)). This state can arise from an old cached client or an attempted code rollback. The maintenance instruction “git revert … bump `CACHE_VERSION`” is no longer sufficient once the DB has irreversibly reached v2.
- **Recommendation**: Recognize `VersionError` as “this app code is older than your data,” offer update/reload guidance, and never expose reset for it. Test both directions: new code upgrading v1, and old-version code refusing v2 without data mutation or reset. Update the rollback recipe: any rollback deployed after v2 must retain `DB_VERSION >= 2` and compatible readers, rather than reverting the schema version.

### F10

- **Severity**: Major
- **Item**: 4
- **Issue**: Metadata-only is the honest choice because the increment is unknown, but the proposed feature is not specified end-to-end. Current manual save, repeat and quick-entry paths only pass weight and reps ([`js/ui/log.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:161>), [`js/ui/log.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:174>), [`js/ui/log.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:254>)). The brief does not define:

  - whether the toggle applies to all sets in a quick-entry batch;
  - whether “Same as last time” copies the source set’s state or the current toggle;
  - whether edits can correct `addOn`;
  - how prefill chooses a state when the previous session varies;
  - where badges appear in last-time, today, history, day overview and analysis export.

- **Recommendation**: Define one consistent rule before implementation. A sensible minimal rule is: toggle is part of the current entry state; manual saves and quick-entry batches use it; repeat copies the selected historical set’s `addOn`; after any save the entry state becomes that saved state; edit sheets can correct it. Show the badge everywhere a set is rendered and include it in both backup and analysis export.

### F11

- **Severity**: Major
- **Item**: 4
- **Issue**: Excluding an unknown add-on from arithmetic is appropriate, but “ignore it for the nudge” is not. A base setting of 50kg with the add-on off and 50kg with it on are not the same training load. Ignoring the state would produce a knowingly false “same weight” assertion. Dashboard PR and e1RM values also become lower-bound/base-stack measures when add-on sets are included, yet the dashboard currently labels them simply “Heaviest” and “Best estimated 1RM” ([`js/ui/dashboard.js`](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/dashboard.js:78>)).
- **Recommendation**: Keep `weightKg` arithmetic unchanged, but compare `(top weightKg, addOn state)` for the nudge—or suppress the nudge whenever a relevant top set uses the unknown add-on. Where an exercise contains add-on sets, disclose that dashboard weights/e1RM use recorded base kg and exclude the unknown increment. Do not claim that an add-on set is a quantified PR over a non-add-on set with the same base weight.

### F12

- **Severity**: Major
- **Item**: 5
- **Issue**: Reinterpreting “notification” as an in-app nudge is correct under the approved plan, which explicitly excludes push notifications. iOS Home Screen apps do support Web Push, but it requires notification permission and a push delivery path; that would add online/backend machinery contrary to this app’s constraints ([WebKit’s iOS Web Push documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). The brief’s actual nudge rule is not precise, however. It alternates among “>3 sessions,” “last 3 sessions” and “fires on the 3rd repeat.” It also fails to define whether an in-progress current workout-day is one of the three. Dynamically counting today can make a nudge disappear after a warm-up set before the day’s top set is known.
- **Recommendation**: Define the trigger using completed prior workout-days, strictly before today. Show the nudge when the selected metric is identical across the chosen number of consecutive prior sessions; keep it visible during today until today’s top set exceeds the baseline or the workout-day changes. Use factual copy such as “Top recorded weight unchanged for 3 sessions” rather than the coaching-like “ready to add?”

### F13

- **Severity**: Minor
- **Item**: 5
- **Issue**: Skipping pure bodyweight exercises is the correct minimal v1 behavior. A “top reps” substitute measures a different kind of progression and would require its own threshold semantics. Mixed bodyweight/added-weight exercises need an explicit rule: the dashboard already enters weight mode if any positive weight exists, while a workout-day containing only zero-weight sets has a top weight of zero.
- **Recommendation**: Skip the nudge when all relevant session top weights are zero. For mixed exercises, apply the weight rule only when each relevant session has a positive top weight; otherwise do not nudge. Add tests for pure bodyweight, mixed zero/positive sessions, deleted sets, edited workout days, ties and add-on-state changes.

### F14

- **Severity**: Major
- **Item**: 6
- **Issue**: `touch-action: manipulation` is the right response to double-tap zoom and preserves panning and pinch zoom; it is equivalent to allowing pan and pinch while excluding double-tap zoom ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)). A hard viewport lock would violate `PROJECT_PLAN_FINAL.md` §13’s 200% zoom requirement. However, the diagnosis that every input is already at least 16px is false. `.sheet-field` is `0.85rem` and its nested input uses `font: inherit` ([`css/style.css`](</Users/mr/Desktop/AI/Test projects/Gym tracker/css/style.css:195>)); settings labels are `0.9rem` and their selects also inherit ([`css/style.css`](</Users/mr/Desktop/AI/Test projects/Gym tracker/css/style.css:366>)); the recovery input inherits `0.9rem` as well. These controls can still trigger iOS focus zoom.
- **Recommendation**: Add `touch-action: manipulation` to the appropriate interactive surface while preserving the current viewport declaration. Explicitly give every editable input and select a computed font size of at least 16px, then device-test steppers, quick entry, edit sheets, settings selects and recovery input. Retain the existing 200% pinch-zoom acceptance test.

## Decisions the owner must make

- **Grouping model**: Use one curated group per exercise, with `Other` separate from `Ungrouped`; recommend Home grouping only and no enable/disable setting initially.
- **Existing exercises**: Decide whether to classify them manually before grouped Home launches; recommend leaving them safely Ungrouped and assigning groups incrementally.
- **Machine add-on meaning**: Confirm that recording the on/off state without pretending to know its kilograms is useful; recommend metadata-only, with explicit dashboard caveats.
- **Nudge threshold**: Choose three consecutive prior sessions or the literal “more than three” meaning four; recommend three if the intent is an early, lightweight reminder.
- **Zoom meaning**: Confirm whether “locked” means preventing accidental double-tap zoom rather than disabling deliberate pinch; recommend preserving pinch zoom.

## Implementation sequencing

1. Implement Item 1’s detached guarded render and deterministic overlap tests.
2. Implement Item 6’s `touch-action: manipulation` plus the missing 16px control fixes; verify double-tap, input focus and 200% pinch zoom on the owner’s iPhone.
3. Resolve the owner decisions above and freeze the exact v2 field invariants and nudge rule.
4. Before changing production data, export a current device backup and implement the v2 compatibility layer: both record transforms, current-shape constructors/validators, backup migration replay, `VersionError` handling, and the corrected rollback recipe.
5. Run the mandated pure migration fixture, real v1→v2 database upgrade, v1-backup→v2 restore, fresh-v2 bootstrap, two-client upgrade and old-code/new-DB refusal tests.
6. Ship the v2 data layer and cache version together, then verify the real iPhone update flow, retained data, backup restore and offline reload.
7. Implement Item 2 with Home grouping and flat Manage editing; verify filtering, archived exercises and manual ordering.
8. Implement Item 4 across every save, repeat, quick-entry, edit, history, day, backup and analysis-export path.
9. Implement Item 3’s Home-only done marker, initially without group counts.
10. Implement Item 5 last, because its correct behavior depends on the final Item 4 semantics. Add pure stats fixtures and Home/Log browser coverage before release.