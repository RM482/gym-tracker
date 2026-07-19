## Summary

Overall verdict: **not yet implementation-ready**. Most Round 1 findings were addressed well, and the revised plan is substantially clearer. However, several important claims are not fully honoured: decimal-comma parsing contradicts the tokenizer, old-backup validation is ordered incorrectly, malformed-record exports are not necessarily restorable, service-worker/database version safety is overstated, and historical timestamp editing remains timezone-ambiguous.

Claude’s rationales for R2, R8, R13, R17, and most of R18 are proportionate. R15 should be escalated: simplifying Undo is sound, but the malformed-record recovery design does not provide the claimed recoverability.

## Round 1 resolution check

| Rec | Status | Note |
|---|---|---|
| R1 | Resolved | §18 now has the required pre-implementation review, final-plan, owner-approval, and D1/D2 gates. |
| R2 | Partially resolved | D1 is correctly escalated, but §8.2/§11.1 still do not define which offset is used when editing a historical timestamp. |
| R3 | Resolved | §8.2 uses epoch milliseconds, stored offset/day, and deterministic tie-breaks; batch ordering is explicit. |
| R4 | Resolved | `workoutDay` is persisted, indexed, and recomputed only on save/edit (§8.2, §9, §11.1). |
| R5 | Resolved | §6.4 and §11.2 define data-driven mixed bodyweight/added-weight behaviour and daily aggregation. |
| R6 | Resolved | §6.2/§12 remove value-based duplicate warnings and consistently use a pending-write guard. |
| R7 | Resolved | §6.2 specifies the n+1 rule, exhaustion behaviour, visible label, recounting, and examples. |
| R8 | Resolved | §7 defines counting, keyboard positioning, estimates versus device gates, and realistic acceptance bounds. The rationale for keeping steppers primary is sound. |
| R9 | Partially resolved | The upgrade transaction is now concrete, but old-backup migration/validation ordering and blocked upgrades remain underspecified. |
| R10 | Partially resolved | Atomic replacement and most checks are defined, but §16 validates old records against the current schema before migrating them. |
| R11 | Resolved | Persistence is best-effort, status is visible, loss cases are documented, and the Home banner is specified. |
| R12 | Partially resolved | §14 is much stronger, but “old code never opens a newer DB” is not guaranteed with stale tabs or open IDB connections. |
| R13 | Partially resolved | Test levels are defined, but Claude’s claimed six browser scenarios are not enumerated, browser tests arrive only in Phase 8, and CI omits them. |
| R14 | Resolved | §6.5 and §12 cover conflicts, contiguous ordering, transactional cascade deletion, and stale routes. |
| R15 | Partially resolved | Undo is honestly simplified, but “always exported” does not make malformed records inspectable or restorable under §16 validation. |
| R16 | Resolved | §15 adds appropriate CSP directives, import caps, dependency/repository hygiene, and backup-sensitivity guidance. |
| R17 | Resolved | Speculative features were removed; retained safety UI is justified, and starter chips are gated by D2. The rationale is sound. |
| R18 | Partially resolved | Accessible reorder and maintenance documentation help, but custom migration, corruption, restore, and SW coordination remain demanding for a beginner. |
| R19 | Resolved | §5 and §23 now align on routes, modules, backup ownership, and platform adapters. |
| R20 | Partially resolved | Most rules are present, but historical edit timezone semantics, atomic FK checking, manual-entry navigation state, and stale-tab DB upgrades remain guess-points. |

## New findings

### S1

- **Severity:** Major
- **Issue:** §8.4 splits input on commas while also claiming that decimal commas such as `22,5` are accepted. A naïve implementation will split `8 @ 22,5kg` into two segments, contradicting §3 A7, §12, §17.1, and §19.2.
- **Recommendation:** Define tokenization precedence explicitly: protect decimal commas before segment splitting, or remove comma as a segment separator. Add end-to-end parser fixtures containing decimal-comma weights alongside multiple segments.

### S2

- **Severity:** Major
- **Issue:** §16 schema-checks every imported record against current §8 fields before applying older-version migrations. An authentic older backup missing a newly introduced field would therefore be rejected before the migration that supplies it. This does not honour the R9/R10 claim that older backups are migrated reliably.
- **Recommendation:** Validate the envelope and source-version schema first, apply migrations, then validate the complete result against the current schema, including uniqueness and foreign-key checks after migration.

### S3

- **Severity:** Major
- **Issue:** §12 says malformed records remain in raw exports, while §16 refuses records that fail strict schema validation. Consequently, an export containing an unreadable record may be impossible to re-import. The R15 response’s statement that recovery is “always possible” is unsupported.
- **Recommendation:** Choose an explicit policy: either refuse normal export with actionable corruption guidance, provide a separate diagnostic/raw export, or define an import quarantine path that restores valid records while preserving rejected raw records separately. Add a corrupt-export round-trip acceptance test.

### S4

- **Severity:** Major
- **Issue:** §8.2 defines `tzOffsetMin` as captured “at save/edit time,” but §6.3 allows editing arbitrary historical local date-times. It is unclear whether the offset comes from the current instant, the selected date in the phone’s current timezone, or the original location. Therefore Claude’s R2/R20 claim that edit, DST, and travel behaviour is fully defined is not honoured.
- **Recommendation:** Define the exact conversion algorithm for `datetime-local`, including DST folds/gaps and travel. State whether an edit preserves the original offset unless the date/time changes, or derives the offset for the selected wall time in the phone’s current timezone.

### S5

- **Severity:** Major
- **Issue:** The version-skew guarantee in §10 and §14 is too strong. An already-open tab can retain old JavaScript and an old IndexedDB connection while another tab activates new code. No `db.onversionchange` close behaviour, `open()` blocked handler, user message, or timeout/retry policy is specified. Focus reloads in §12 do not solve a blocked database upgrade.
- **Recommendation:** Require old connections to close on `versionchange`; specify `onblocked` recovery UI and stale-tab reload behaviour. Add a browser/device test with two tabs during a schema/SW upgrade. Reword the guarantee as an enforced protocol rather than an assumed outcome.

### S6

- **Severity:** Major
- **Issue:** §17.0 describes browser coverage only by broad responsibility, while Claude’s response claims approximately six concrete scenarios including edit/delete/Undo. §23 provides a single smoke file but no required scenario inventory. §18 delays all browser wiring tests until Phase 8, and §24 excludes them from CI, weakening the requirement for tests after meaningful changes.
- **Recommendation:** Enumerate the minimum browser scenarios and introduce them incrementally with Phases 2–7. Run the small smoke suite in CI, or document a mandatory, recorded local gate on every relevant phase if CI exclusion is retained.

### S7

- **Severity:** Major
- **Issue:** The recovery path is incomplete. §12 handles IndexedDB open/upgrade failure with Retry and import guidance, while §16 says “DB unreadable → import latest backup”; importing still requires a writable database. There is no defined path for closing, deleting, or recreating a database that repeatedly cannot open.
- **Recommendation:** Define separate recovery paths for transient open failure, blocked upgrade, failed migration, and irrecoverable local database corruption. Any database deletion must display its consequence and require a verified backup or explicit data-loss confirmation. Add acceptance tests for each reachable recovery state.

### S8

- **Severity:** Minor
- **Issue:** Cross-store referential integrity is described only as “checked in store” (§8.2). With the stale-tab policy in §12, an exercise could be deleted in one tab after another tab’s cached validation but before its set write, producing a dangling reference.
- **Recommendation:** Require exercise existence to be checked inside the same readwrite transaction that inserts or edits a set. Test deletion-versus-save ordering with two store instances.

### S9

- **Severity:** Minor
- **Issue:** Several acceptance claims remain incomplete: §19.5 does not cover a failed automatic safety export; §19.6 does not cover SW update/rollback or blocked upgrades; §19.3 does not verify permanent deletion after Undo expiry; and accessibility requirements in §13 have no explicit acceptance gate beyond a generic Phase 8 pass.
- **Recommendation:** Add concise, observable acceptance cases for these behaviours and identify whether each is unit-, browser-, or device-tested.

### S10

- **Severity:** Minor
- **Issue:** §10 shows `schemaVersion: 3` in §16 but does not define the actual initial `DB_VERSION`, supported backup versions, or concrete v1 migration table. “No-op chain test” is too abstract for a beginner maintainer and could encourage invented historical versions.
- **Recommendation:** Declare the v1 database/export version explicitly, list the supported source versions, and avoid placeholder migration steps unless real historical schemas exist.

### S11

- **Severity:** Minor
- **Issue:** The Home summary format in §6.1, `"3×8 @ 10 kg"`, is undefined for heterogeneous sessions such as the canonical `10×8, 10×8, 9×8`. Different implementers may display misleading or inconsistent summaries.
- **Recommendation:** Define the summary aggregation or use an unambiguous compact form such as set count plus top weight.

### S12

- **Severity:** Minor
- **Issue:** §18 Phase 3 exits with “§19.2 except quick entry,” although §19.2 contains a device-measured repeat-flow gate while Phase 3 verifies only a browser estimate. Phase 9 is the first actual device tap gate.
- **Recommendation:** Make the Phase 3 exit criterion explicitly provisional, with functional browser verification only; reserve the numerical acceptance claim for the Phase 9 device test.

## Final verdict

- **Implementability by a less capable model: no.** Remaining consequential guess-points are decimal-comma tokenization, old-backup validation order, malformed-record recovery, historical timezone edits, stale-tab/database upgrades, recovery from an unopenable database, and transactional foreign-key enforcement.
- **A targeted third review is warranted** after these findings are addressed, because the required changes affect the highest-risk boundaries: migration, restore, corruption recovery, and SW/IndexedDB coordination. D1 and D2 must also be recorded before implementation begins.