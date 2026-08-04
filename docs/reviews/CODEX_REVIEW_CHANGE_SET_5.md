## Verdict

The proposed v2→v3 record migration composes correctly with the existing v1→v2 migration, and IndexedDB makes the upgrade atomic. The data transform itself is straightforward and can be safe.

I would not approve the brief unchanged, however. Two release-safety gaps matter before this touches the owner’s only copy:

- A failed migration is currently treated as a generic open failure and can eventually expose the destructive reset UI.
- The brief calls the schema-only slice “deployable” but omits HANDOFF’s mandatory pre-deploy backup confirmation and hold.

## Findings

### BLOCKER — A migration abort can lead toward destructive reset

IndexedDB will roll back an aborted upgrade transaction, so the records and database version remain at v2. That part is safe: the upgrade runs inside the version-change transaction at [db.js:98](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/db.js:98), and synchronous setup failures explicitly abort it at [db.js:102](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/db.js:102).

The recovery path is not fully safe:

- Only `VersionError` becomes `DbTooOldError` at [db.js:112](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/db.js:112).
- A failed migration normally reaches the app as another error, such as `AbortError`.
- Generic failures increment the persistent failure count at [app.js:225](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/app.js:225).
- After two reloads, the UI offers “Still can’t open it?” and then the reset flow at [app.js:142](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/app.js:142).

Thus an atomic migration failure does not erase data by itself, but it can tell a beginner that reset is the next step even though the intact v2 database merely needs corrected v3 code.

Recommendation: distinguish an attempted-upgrade failure, for example with `DbUpgradeError`, and treat it like `DbTooOldError`: say the data is unchanged, never count it toward reset, and never reveal reset for that error. Also add an atomic-abort test whose failure occurs inside a record transform; the present test only throws from `structural` at [db.test.js:57](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/tests/db.test.js:57).

### BLOCKER — The release gate required by HANDOFF is missing

The brief says slice 1 is independently deployable at [CHANGE_SET_5_BRIEF.md:127](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/docs/reviews/CHANGE_SET_5_BRIEF.md:127). In this repository, pushing `main` deploys immediately, while HANDOFF says any change touching phone data must be held until the owner confirms a backup at [HANDOFF.md:131](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/docs/HANDOFF.md:131).

Recommendation:

- Developing and committing the schema slice separately is fine.
- Do not deploy the inert schema slice separately.
- Before the one production deployment, ask the owner to export a backup and wait for confirmation.
- Ship `DB_VERSION`, migration, readers, writers, UI and the cache bump together. This also follows the schema/deploy rules at [HANDOFF.md:106](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/docs/HANDOFF.md:106).

### SHOULD-FIX — Add explicit production v2→v3 and v1→v3 tests

The G4 test is still valid, but it is not a production migration test. It hardcodes target version 3 and supplies a synthetic table at [db.test.js:175](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/tests/db.test.js:175). Changing the real `DB_VERSION` to 3 does not alter what that test exercises.

The test that does change meaning is the current “v1 → v2” real-upgrade test. It calls `openDb({name})` at [db.test.js:148](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/tests/db.test.js:148), so once `DB_VERSION` becomes 3 it silently becomes a production v1→v3 test. Its title, version assertion and expectations will then be stale.

Ship these separately:

- Preserve an explicit v1→v2 test by opening with `_version: 2`.
- Add a real v2 database fixture upgraded by production `openDb()` to v3. This is the path the owner’s phone will actually take.
- Add or convert a real v1→current test that checks all three results together: `muscleGroup`, `addOn`, and `intensity`.
- Keep G4 unchanged as a machinery test for ordered dependent transforms.
- Add a record-transform failure test proving both records and database version remain v2.

This is required by [HANDOFF.md:110](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/docs/HANDOFF.md:110).

### SHOULD-FIX — `restoreSet` was missed as a canonical writer

Undo preserves an already-present intensity because the entire deleted object is returned and reinserted at [store.js:348](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/store.js:348). But `restoreSet` writes the raw object at [store.js:359](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/store.js:359).

If a record escaped migration, delete/undo would write it back without `intensity`, contrary to HANDOFF’s “writes canonical, reads tolerant” rule at [HANDOFF.md:111](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/docs/HANDOFF.md:111).

Recommendation: restore `normalizeSet(record)` and return the canonical restored object. Test both:

- A legitimate `'hard'` intensity survives delete/undo.
- A legacy record missing intensity comes back with `intensity: null`.

### SHOULD-FIX — Repeat needs an explicit intensity rule

The Repeat handler reconstructs a new set from selected source fields at [entry-panel.js:168](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/ui/entry-panel.js:168). It is not covered merely by changing `buildSet`.

Do not copy the historical set’s intensity. Repeat should copy the prescribed setup—weight, reps and physical `addOn`—but use the current intensity selection, initially `null`. That permits this workflow:

1. Perform today’s set.
2. Select “Struggled”.
3. Tap Repeat to save the repeated load with today’s outcome.

Copying `repeat.intensity` would claim that today felt the same as the prior session.

The Repeat label may still display the old set’s intensity because that is useful historical context; the save must not inherit it.

### SHOULD-FIX — Quick-entry batches should remain unflagged

The current quick-entry route creates weight/reps rows, adds the panel’s physical `addOn`, and submits them at [entry-panel.js:230](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/ui/entry-panel.js:230) and [entry-panel.js:250](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/ui/entry-panel.js:250).

A sentence such as `3x8 @ 60kg` contains no intensity information. Applying one panel selection to all three would invent that all three sets felt alike—the exact within-session variation this feature is intended to record.

Recommendation:

- `addSets` should support an intensity on each input object, because it is a general store API.
- The current quick-entry UI should submit `null` for every parsed set.
- Do not build per-preview intensity editing in this change set. The normal editor can correct individual sets later.

### SHOULD-FIX — Current-schema backup validation must require the field

After migration, a current v3 backup should require:

```js
set.intensity === null || ['easy', 'ok', 'hard'].includes(set.intensity)
```

Do not accept `undefined` as a current v3 shape. Genuine v1 and v2 backups will already have been stamped with `null` by `migrateBackup()` before validation at [backup.js:64](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/backup.js:64).

Otherwise a nominal v3 backup can be restored with a missing field, despite the schema being declared `null | enum`. The existing `addOn` validator at [backup.js:93](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/backup.js:93) is looser than its comments claim; do not copy that weakness for intensity.

Keep `isValidSet` tolerant. Tightening [store.js:65](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/store.js:65) would risk hiding history. Strictness belongs in constructors, edits and post-migration backup validation; `normalizeSet` remains forgiving.

### SHOULD-FIX — Display the owner’s label, not the storage token

The brief says stored `'hard'` is deliberately separate from owner-facing “Struggled” at [CHANGE_SET_5_BRIEF.md:40](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/docs/reviews/CHANGE_SET_5_BRIEF.md:40), but later proposes displaying `hard` at [CHANGE_SET_5_BRIEF.md:103](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/docs/reviews/CHANGE_SET_5_BRIEF.md:103).

Map tokens explicitly:

- `easy` → `Easy`
- `ok` → `OK`
- `hard` → `Struggled`

The analysis export should retain the readable stable token and explain this mapping in its guidance.

### CONSIDER — The brief overstates where `fmtSet` is used

`fmtSet` does feed Log, Superset, History, Day, Repeat and preview chips. But Home uses `sessionSummary`, not `fmtSet`, at [home.js:134](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/ui/home.js:134). History headings likewise use `sessionSummary` at [history.js:42](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/ui/history.js:42).

This does not invalidate the global formatter approach; it just means the claimed seven-site effect is inaccurate.

I would keep intensity in `fmtSet`. “Last time” is arguably the most important place to show it because it helps decide today’s weight. If actual iPhone testing shows poor wrapping, adjust presentation then rather than introducing two drifting formatters now.

## Migration trace

Assuming `migrations[2]` is a total record transform that stamps a valid existing token or `null`, the migration machinery itself is correct:

- **Device at v1:** the loop covers versions 1 and 2 at [db.js:63](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/db.js:63). The `sets` chain becomes `[addOn transform, intensity transform]`.
- **Device at v2:** only `migrations[2]` runs.
- **Device already at v3:** no upgrade event occurs, so no transform runs.
- **Fresh install:** `oldVersion === 0` bootstraps stores directly at v3 at [db.js:99](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/db.js:99). There are no old records to migrate; constructors must create canonical v3 records.

G4 still holds. Transforms are collected by store name into one array at [db.js:62](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/db.js:62), then each store gets one cursor and each record receives every transform in order at [db.js:77](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/db.js:77). Two `sets` steps therefore compose correctly without competing cursors.

If the upgrade transaction aborts, IndexedDB rolls back every cursor update and keeps the old database version. The recovery-UI issue described above occurs after that safe rollback.

## Version skew and backups

The stale-shell path is otherwise correct:

- A cached v2 shell opening a v3 database receives `VersionError`.
- `openDb` maps it to `DbTooOldError` at [db.js:112](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/db.js:112).
- The UI says the data is safe and not to clear anything at [app.js:127](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/app.js:127).
- That error is excluded from the reset counter and reset UI at [app.js:225](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/app.js:225).

There is no stale-shell route toward reset in that specific case.

A v3 backup imported into a v2 app is rejected before records are examined at [backup.js:36](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/backup.js:36). “This backup comes from a newer app version — update the app and retry” is honest and gives the correct remedy. It does not alter existing data.

A v2 backup imported into v3 needs no special case. `migrateBackup` starts at version 2, applies `migrations[2]` to each copied set at [backup.js:50](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/backup.js:50), changes the envelope to v3, and only then validates it. A v1 backup similarly receives steps 1 and 2 in order.

The service-worker update structure is sound: installation precaches the complete cache atomically at [sw.js:38](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/sw.js:38), and an existing database connection is closed and blocked by the update overlay on `versionchange` at [db.js:107](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/db.js:107). The cache version must still be bumped in the same release.

## Open-question recommendations

1. **Shape:** ship `null | 'easy' | 'ok' | 'hard'`. An integer 1–3 adds no useful extensibility; changing to RPE later still changes meaning and requires a migration. A future v4 transform can convert or preserve the enum without difficulty.

2. **Carry-over:** do not pre-fill from the previous set. D7 is not literally the same data type, but its epistemic rule applies: do not record something the owner did not state. `addOn` persists because it describes machine setup; perceived difficulty does not.

3. **Display:** use `fmtSet` everywhere an individual set is shown, including Last time. Map `'hard'` to “Struggled”. Do not fork the formatter unless real phone testing demonstrates a problem.

4. **Quick entry:** leave every batch-created set at `null`. The store may support per-row values, but the existing sentence grammar provides none.

5. **Existing v1→v3 test:** G4 remains a valid synthetic machinery test. The real v1→v2 test is the one that silently changes meaning when `openDb()` starts targeting v3. Add explicit production v2→v3 and v1→v3 tests.

6. **Recovery/version skew:** stale v2 code against v3 data and newer-backup rejection are correct. The missing protection is distinguishing an aborted upgrade from a generic failure so it can never expose reset.

## Completeness checklist

In addition to the brief’s ten entries, explicitly cover:

- `restoreSet` canonicalization and undo preservation.
- Repeat using today’s selected intensity, never the source set’s intensity.
- `snapshotForBackup`: it will work automatically once `normalizeSet` includes intensity because snapshots map through it at [store.js:436](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/store.js:436), but add a regression test.
- `replaceFromBackup`: it writes staged records directly at [store.js:457](/Users/mr/Desktop/AI/Test%20projects/Gym%20tracker/js/store.js:457), so strict post-migration validation and restore coverage are essential.
- Parser output can remain weight/reps-only; `buildSet` supplies canonical `null`.
- Statistics, plateau logic, e1RM and session summaries should deliberately ignore intensity.
- CSS and accessibility for the three-button control: real buttons, clear selected state, and `aria-pressed`.
- Update schema/API comments and HANDOFF after implementation.
- Unit/browser tests for labels, no carry-over, Repeat, editor correction and quick-entry null behavior.

## Scope

For this single-user iPhone app, do not add:

- an integer abstraction for hypothetical RPE;
- an intensity index or query API;
- averages, charts, readiness scores or dashboard logic;
- per-chip quick-entry intensity editing;
- separate display formatters before phone testing shows a genuine need;
- a schema-only production deployment.

The three-value enum, one migration, strict writers, tolerant reads, global individual-set display and strong migration/backup tests are the right-sized feature.