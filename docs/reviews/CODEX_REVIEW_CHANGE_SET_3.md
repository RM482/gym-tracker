## Overall verdict

The brief is directionally sound, respects D1–D8, and is right that no IndexedDB version bump is required. I would not implement the superset or staged mass-grouping slices yet, however. Their lifecycle and refresh behavior need tightening first.

The two main blockers are:

- The proposed entry-panel extraction boundary omits quick entry even though quick entry shares the write guard and panel-local state.
- The superset screen does not specify what happens when either exercise becomes invalid, or how stale renders and post-write side effects obey the app’s detached-render protocol.

## Correctness against the real code

| Brief claim | Verdict |
|---|---|
| Home’s add button opens a prompt, calls `addExercise`, then refreshes Home. | Correct: [home.js:188](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/home.js:188>)–206. |
| `store.addExercise(name, { muscleGroup })` accepts a group and returns the created exercise with its ID. | Correct: validation is at [store.js:166](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:166>)–168, the ID is created at line 173, and the record is returned at lines 176–177. Existing unit coverage confirms this at [store.test.js:254](</Users/mr/Desktop/AI/Test projects/Gym tracker/tests/store.test.js:254>)–266. |
| `promptSheet` keeps validation errors inline. | Correct: it awaits the callback and catches errors without closing at [components.js:122](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/components.js:122>)–128. A raw `sheet()`, however, does not supply that behavior automatically; the new add sheet must implement it. |
| `promptSheet` is used in five places. | Minor factual error. There are four call sites: Home add, Manage add, unarchive rename, and rename flow at [home.js:196](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/home.js:196>), [manage.js:164](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/manage.js:164>), [manage.js:182](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/manage.js:182>), and [exercise-actions.js:13](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/exercise-actions.js:13>). This does not change the design recommendation. |
| Starter chips stay on Home. | Correct today: [home.js:171](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/home.js:171>)–180. |
| Manage’s add flow stays on Manage. | Correct today: [manage.js:177](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/manage.js:177>)–193. |
| Group assignment is currently one exercise at a time. | Correct: Manage opens the action at [manage.js:107](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/manage.js:107>)–118 and the shared picker writes one record at [exercise-actions.js:26](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/exercise-actions.js:26>)–37. |
| Manage is a flat list. | Correct: active rows are appended directly at [manage.js:25](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/manage.js:25>), consistent with D8. |
| Each proposed `setMuscleGroup` call is its own transaction. | Correct: [store.js:195](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:195>)–205. |
| There is no stored superset concept today. | Correct. No store, route, or data field relates two exercises; current routes are enumerated at [app.js:23](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/app.js:23>)–33. |
| The log entry block is roughly lines 136–269. | Partly correct. Manual and repeat controls are there, but the shared ownership boundary continues into quick entry at lines 271–344. See blocker below. |
| The `pending` flag is the only UI duplicate-write protection. | Correct: [log.js:224](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:224>)–238. The store creates fresh UUIDs and has no idempotency key. |
| Successful saves refresh the whole screen. | Correct: saves call `ctx.refresh()` at [log.js:243](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:243>)–265, and the winning render replaces the live children at [app.js:212](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/app.js:212>)–219. |
| Add-on state is local and re-derived after refresh. | Correct: [log.js:139](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:139>)–147. |
| Home currently uses plain group headings and always-visible rows. | Correct: [home.js:53](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/home.js:53>)–67. |
| Home filtering uses captured elements due the detached-render regression. | Correct: [home.js:46](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/home.js:46>)–49 and [home.js:124](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/home.js:124>)–140. The shipped regression is documented at [PROGRESS.md:9](</Users/mr/Desktop/AI/Test projects/Gym tracker/docs/PROGRESS.md:9>)–19. |
| `updateSettings` does not call `touchDataChange`. | Correct: [store.js:403](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:403>)–409. Folding alone will not update `lastDataChangeAtMs` or `firstDataChangeAtMs`, which are what [isBackupOverdue at store.js:452](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:452>)–462 reads. It therefore cannot make the backup reminder newly overdue. |
| A settings key needs no `DB_VERSION` bump. | Correct. Settings is already a free-form single record in the existing store; `DB_VERSION` governs stores, indexes, and migrated record requirements at [db.js:21](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/db.js:21>)–35. |
| `collapsedGroups` will survive backup export/import. | Correct mechanically. Snapshots spread all settings properties at [store.js:412](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:412>)–430, backup export includes settings at [backup.js:12](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/backup.js:12>)–20, and restore spreads them back at [store.js:433](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:433>)–439. An old backup receives the new default through that merge. |
| Backup validation already protects `collapsedGroups` from junk. | Not correct yet. The validator only checks that `settings` is an object at [backup.js:36](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/backup.js:36>)–44; it does not inspect settings fields. Normalization must be added explicitly. |
| “No record shape changes.” | Literally false. `collapsedGroups` is a new optional settings-record field. It is not an IndexedDB schema-version change, but the brief should say that accurately. |

## Findings

### BLOCKER — The extraction boundary omits hidden quick-entry coupling

The proposed extraction stops around `log.js:269`, but quick entry depends on entry-panel internals:

- Its draft lives in the module-level map at [log.js:16](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:16>)–18 and is loaded at line 287.
- Draft changes and previews are managed at lines 302–316.
- Parsing uses the panel’s current weight as fallback at [log.js:316](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:316>).
- Its confirm button is inserted into the same `saveButtons` list and uses the same `guard` at [log.js:332](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:332>)–342.
- It applies the panel’s current `addOn` value to the batch at line 337.
- The draft is deleted only after the write succeeds at line 339.

Extracting only manual Save and Repeat would either leave awkward callbacks crossing module boundaries or give quick entry a second guard, weakening today’s “all write buttons on this exercise are mutually exclusive” behavior.

Recommendation: make one panel/controller own weight, reps, add-on, e1RM, `pending`, every write button, and quick-entry state. In compact mode, do not render quick entry, but keep the ownership model the same. Keep the full-screen history cards and plateau presentation outside if that makes the normal and compact layouts simpler.

### BLOCKER — Superset invalid-route and mid-session behavior is unspecified

Normal Log already treats missing and archived exercises as invalid and gates its redirect with `ctx.isCurrent()` at [log.js:39](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:39>)–48. A two-ID route needs an explicit equivalent policy.

Recommendation:

- Reject identical IDs in `parseRoute`.
- Load both records before building panels.
- If both are invalid, toast once and go Home.
- If exactly one remains active, toast and fall back to that exercise’s normal Log screen.
- Gate any render-time toast/navigation with `ctx.isCurrent()`.
- If an exercise is archived or deleted after the panel was rendered, `addSet` will reject it because of the in-transaction foreign-key/archive check at [store.js:278](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:278>)–287. Show the panel error, then refresh/revalidate the route rather than leaving a permanently dead panel.

### BLOCKER — The new screen must explicitly follow the detached-render/commit protocol

Every render receives a detached container, and only the newest route-matching render may commit at [app.js:191](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/app.js:191>)–219. Returning from the background can start another render through [app.js:225](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/app.js:225>)–231.

The brief mentions `ctx.isCurrent()` only indirectly. It should require:

- No redirect, toast, focus, or navigation after an awaited render-time lookup unless `ctx.isCurrent()` still holds.
- A stale missing-ID render must not redirect over a newer screen.
- Post-write behavior must distinguish the required fresh refresh from optional toast/navigation. A background refresh can invalidate the old render token while its live DOM is still clickable. Suppressing the post-write refresh in that case could let an older snapshot commit after the write. This deserves a targeted race test, not an assumption.

This protocol previously fixed a real duplicate/stale-render defect; see [PROGRESS.md:27](</Users/mr/Desktop/AI/Test projects/Gym tracker/docs/PROGRESS.md:27>)–38.

### SHOULD-FIX — Per-panel guards are safe only when IDs are distinct

With distinct IDs, per-panel guards are correct. Each call writes an explicit `exerciseId` at [store.js:278](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:278>)–287, and the two read-write transactions overlap the same object stores, so IndexedDB serializes them. A late second refresh supersedes the earlier render and should see both committed writes.

If `idA === idB`, however, two guards expose two independent Save buttons for the same exercise. That creates exactly the duplicate path the single-screen guard prevents. Rejecting identical IDs is therefore a safety requirement, not just route tidiness.

### SHOULD-FIX — Staged mass grouping is vulnerable to refresh loss and partial Apply

Manage’s only existing session state is module-level `showArchived` at [manage.js:9](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/manage.js:9>), which survives `ctx.refresh()`. If grouping mode and its draft live only in a render closure, a focus/visibility refresh will silently cancel the mode. If they live in module state, the brief must define when they reset and how a refreshed exercise list reconciles with the saved baseline.

The proposed Apply loop is also not atomic. If an early row succeeds and a later exercise was deleted, earlier writes remain committed. `setMuscleGroup` rejects missing records but permits archived records at [store.js:195](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:195>)–205. Thus an archived row can be changed invisibly, while a deleted row can leave a partial Apply.

For this one-person app, the simpler design is immediate save-per-tap:

- Pick “Arms.”
- Each row’s checkbox means “currently Arms.”
- Tapping on assigns Arms; tapping off assigns Ungrouped.
- “Done” exits the mode; there is no pretend transactional Cancel.

The old group shown in the row already makes overwrites clear. This avoids draft reconciliation, partial Apply semantics, and background-refresh loss. If true Apply/Cancel is retained, use one atomic batch store transaction and preserve/reconcile grouping state across refreshes.

### SHOULD-FIX — Settings normalization needs one canonical function

Adding `collapsedGroups` to `DEFAULT_SETTINGS` is not enough. Current `getSettings()` merely spreads raw values over defaults at [store.js:398](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/store.js:398>)–400. A backup containing `"collapsedGroups": "Legs"` or unknown names would reach Home unchanged.

Add a `normalizeSettings()` used by:

- `getSettings`
- `updateSettings`
- `snapshotForBackup`
- `replaceFromBackup`

It should accept only an array, retain unique values from `MUSCLE_GROUPS` plus literal `Ungrouped`, and write canonical arrays. Backup validation may remain tolerant because this is a harmless preference, provided restore and subsequent export canonicalize it.

A known group with no current exercises is not dangerous. I recommend ignoring it while the group is empty and retaining it in settings; that preserves the owner’s remembered preference if the group later returns. Do not perform cleanup writes during Home rendering.

### SHOULD-FIX — Folding and filtering must share one visibility calculation

The brief correctly recognizes the regression. The implementation should not give the fold click handler and filter handler separate authority over `row.style.display`; they will overwrite each other.

Use one `applyVisibility()` based on:

- Current filter text
- Current collapsed set
- Row name and group

When filter text is non-empty, matching rows ignore collapse. Clearing it re-applies collapse. Continue operating on captured elements as the current code does at [home.js:128](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/home.js:128>)–140.

### SHOULD-FIX — Superset navigation and edit semantics are incomplete

The panel heading is proposed as a link to full Log, but normal Log’s header always goes back Home at [log.js:51](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:51>)–54. Therefore “tap heading for full Log” loses the obvious route back to the superset.

Also, normal Log offers rename and group, not archive, at [log.js:54](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/log.js:54>)–69. Archiving remains Manage-only at [manage.js:119](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/manage.js:119>)–127.

For the first version, keep panels focused on logging:

- No rename/archive controls inside the superset.
- Do not make the heading navigate unless return behavior is designed.
- Top-level Back returns to A’s normal Log as proposed.
- Renaming elsewhere is reflected on the next refresh.
- Archiving/deleting elsewhere invokes the invalid-route fallback above.

This avoids adding return-route parameters merely for a rarely used edit action.

### SHOULD-FIX — D8 needs an explicit amendment

The new add sheet changes the previous recorded choice that new additions land Ungrouped and are tagged later, documented at [DECISIONS.md:30](</Users/mr/Desktop/AI/Test projects/Gym tracker/docs/DECISIONS.md:30>) and [PROGRESS.md:49](</Users/mr/Desktop/AI/Test projects/Gym tracker/docs/PROGRESS.md:49>). The owner has now explicitly changed that trade-off, so the brief is right to propose an amendment. It must be recorded in the same slice rather than described only as touching D8’s “spirit.”

No other D1–D8 conflict is present.

### CONSIDER — The folded “2 of 6 done” count is unnecessary scope

The owner asked to shorten the list, not add a second progress summary. A heading count such as “Legs (6)” is sufficient. The done ticks reappear as soon as the section is opened or a filter is used.

Leave “2 of 6 done” out until real use demonstrates that folded sections hide needed information.

### CONSIDER — Do not change global scroll behavior unless reproduced

The brief’s empirical-first approach is correct. `replaceChildren` does not inherently reset document scroll. A global same-route scroll restoration policy in [app.js:219](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/app.js:219>) affects every screen and introduces timing/focus considerations.

Test saving from the lower panel on WebKit and the iPhone. Change `app.js` only if the jump actually occurs.

## Answers to the five open questions

1. **Use `#/superset/<idA>/<idB>`.** It survives iOS termination/reload and stores no product data. Preserve order because order determines panel layout. Reject malformed and identical pairs.

2. **Per-panel `pending` is safe for two distinct exercise IDs.** It is unsafe for an identical-ID pair, so equality must be rejected. Each guard must disable every write button belonging to its own panel.

3. **The extra settings key does not disturb analysis export or the Settings screen.** Analysis export reads exercises and sets only at [analysis-export.js:57](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/analysis-export.js:57>)–60. The Settings screen reads specific known properties at [settings.js:27](</Users/mr/Desktop/AI/Test projects/Gym tracker/js/ui/settings.js:27>)–47, so an extra property is ignored. Backup round-trip works, but validation/normalization must be added as described above.

4. **Drop “2 of 6 done” from this change set.** It is scope creep for a single-user list-folding request.

5. **“No existing test edited” is too strict as an absolute rule.** Existing browser behavior tests should remain unchanged during a pure refactor. Unit imports may legitimately change when a helper moves modules. For example, [log.test.js:2](</Users/mr/Desktop/AI/Test projects/Gym tracker/tests/log.test.js:2>) imports helpers from `log.js`, while History and Day also import `fmtSet` from Log. Forcing a misleading re-export solely to avoid editing that import is worse structure. Require unchanged assertions and behavior; allow reviewed import-only edits.

## Slicing and tests

The slice order is broadly right: small owner-visible changes first, then extraction immediately before the superset feature. Separating extraction from feature implementation is especially sensible.

I would change slice 3 to immediate-save grouping unless the owner specifically wants undoable Apply/Cancel. Before slice 4, write characterization tests for the hidden entry-panel behavior so the refactor has a stronger net than today’s tests.

Tests missing from the brief:

- Add sheet: duplicate error stays open; no selected group stores `null`; Manage add stays on Manage; starter chips still stay on Home.
- Settings: folding does not change any backup-reminder timestamp; `collapsedGroups` survives export/validate/replace; non-array, duplicate, and unknown values normalize safely.
- Folding: repeated fold/unfold taps do not lose updates; focus/visibility refresh preserves stored folding; filtering a collapsed section and clearing the filter restores it.
- Grouping: returning-from-background during the mode; an exercise archived/deleted after entry; failure partway through Apply if staged writes are retained.
- Refactor: quick draft survives navigation and failed saves; successful quick save clears it; quick confirm shares duplicate protection with manual/repeat; quick parsing still uses current weight; batch uses current add-on; Repeat copies the source set’s add-on rather than the toggle.
- Superset: unknown A, unknown B, both unknown, archived A/B, deleted after render, identical IDs, reload restoration, simultaneous saves in both panels, rapid double-tap within one panel, Repeat advancing independently, add-on/e1RM isolation, lower-panel scroll, and a stale superset render unable to redirect or toast over a newer route.

The existing Playwright coverage is useful but not enough to prove extraction safety: current logging tests cover persistence, quick-entry basics, add-on behavior, e1RM, and plateau behavior, but not their shared guard and local-state coupling.