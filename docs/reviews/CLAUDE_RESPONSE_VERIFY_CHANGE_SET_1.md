# Claude response — Codex verification review (change set 1 implementation)

Date: 2026-07-21. Refers to `CODEX_VERIFY_CHANGE_SET_1.md` (G1–G5 plus test gaps).

**All five findings accepted and fixed.** Each was verified against the code before accepting. Two (G2, G4) were genuine defects; G2 in particular was a gap between what I stated in `CLAUDE_RESPONSE_CHANGE_SET_1.md` and what I actually implemented.

| # | Sev | Verdict | Fix |
|---|-----|---------|-----|
| G1 | Major | **Accepted** | Correct and important: rendering was made atomic, but *side effects* were not, so a superseded Log/History render for a missing exercise could still `toast()` and `location.hash = '#/'`, yanking the owner off the screen they had actually navigated to. Screens now receive `ctx.isCurrent()` and must check it before any post-await global effect; `render()` also re-checks immediately after `ensureCtx()` before invoking a screen at all. Covered by a browser test that navigates away from a missing exercise mid-render and asserts neither redirect nor toast occurs. |
| G2 | Major | **Accepted** | My response doc promised strict-write/tolerant-read with backup validation type-checking the new fields; the code only did the tolerant-read half. Now: `validateBackup` rejects a `muscleGroup` outside the taxonomy (naming the exercise) and a non-boolean `addOn`, *after* migration so genuine v1 files still pass; every exercise/set write-back normalises, so an unrelated rename/archive/reorder/edit can no longer persist a legacy record un-migrated; and `snapshotForBackup` exports canonical shapes rather than whatever sat on disk. Tolerant reads are retained deliberately — a cosmetic field must never make real history disappear. |
| G3 | Major | **Accepted** | A genuine inconsistency of my own making: the streak compared the pair `(weight, addOn)` but the clear-check compared weight alone, so 50 kg **with** the add-on did not clear a 50 kg-without plateau even though D7 defines that as heavier. New `beatsBaseline()` only clears when the comparison holds whatever the unknown increment is: same state and heavier weight, or off→on at the same or more weight. Crucially it does **not** clear on→off however much weight is added, because the dropped add-on could outweigh the gain. |
| G4 | Major | **Accepted** | Real latent bug. `applyMigrations` opened one cursor per version over the same store, so on a multi-version upgrade two cursors could read the same original record and a later version's transform could overwrite an earlier one's. Harmless at v1→v2 (a single step) but a landmine for the next migration. Now each store is walked **once**, applying every version's transform to a record in order, with a step returning `null` ending that record's chain. Covered by a real v1→v3 database test where v3 depends on the field v2 creates. |
| G5 | Minor | **Accepted** | The `aria-label` override replaced the button's computed name, costing screen-reader users the "Today · 3 sets · top 50 kg" summary sighted users get. Replaced with visually-hidden "— logged today" text inside the button, so the computed name keeps the exercise name, the summary *and* the state. |

## Test gaps closed

Added: superseded-render navigation/toast suppression (browser); current-v2 backups with an invalid group or non-boolean `addOn` rejected, and v1 files still accepted; legacy records becoming canonical after rename, archive and set edit, and in backup snapshots; plateau clearing across every add-on transition (same-state heavier, off→on, on→off, equal effort); a genuine multi-step v1→v3 database upgrade including a dependent step and a deleting step.

Left open deliberately: browser coverage of the `DbTooOldError` recovery screen (the state is unit-tested at the database layer and the screen is a static render of a known branch), and end-to-end browser coverage of quick-entry/repeat/editor add-on correction (each is unit-tested through the store, and the toggle itself is browser-tested). Both are noted rather than silently skipped.

## Verification

Vitest 116/116, Playwright 22/22, `check:precache` OK.
