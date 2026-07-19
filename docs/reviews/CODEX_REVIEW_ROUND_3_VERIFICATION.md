## Verification table

| Finding | Status | Note |
|---|---|---|
| S1 | Not verified | Tokenization precedence is fixed, but the claimed mixed decimal-comma/multi-segment parser fixture is not explicitly required in §17.1. |
| S2 | Not verified | Import ordering is corrected, but §17.1 requires an older-version fixture that cannot exist under the declared v1-only version model; see T2. |
| S3 | Verified | Valid records round-trip while malformed entries remain preserved only in the backup’s `unreadable` array. |
| S4 | Verified | Timestamp edits now have explicit timezone, DST, offset, and workout-day recomputation semantics consistent with §§6.3 and 8.2. |
| S5 | Verified | The `versionchange` close protocol, `onblocked` recovery view, and B7 coverage are present and consistent. |
| S6 | Verified | B1–B7 are enumerated, assigned to implementation phases, and included in CI. |
| S7 | Not verified | §12 defines reset-and-recreate before import, but §16 still directs an unreadable database straight to import; see T1. |
| S8 | Verified | Foreign-key validation is inside the same cross-store write transaction, with the race test specified. |
| S9 | Verified | The claimed Undo-expiry, safety-copy, update, blocked-upgrade, and accessibility acceptance gates are present. |
| S10 | Not verified | `DB_VERSION = 1`, supported versions, and the empty migration table are declared, but §17.1 contradicts them with an older-version migration fixture. |
| S11 | Verified | Home summaries now use the unambiguous set-count plus top-weight/best-reps formats. |
| S12 | Verified | Phase 3 is explicitly browser-functional, with numerical tap measurement reserved for Phase 9. |

## Blockers

### T1

**Issue:** The new §12 corruption flow requires resetting and recreating an repeatedly unopenable database before importing, while §16 still states “DB unreadable → recovery view → import latest backup.” Direct import requires a writable database, so these instructions contradict each other at a data-loss-sensitive boundary.

**Recommendation:** Make §16 follow §12 explicitly: locate backup → confirmed reset/delete → recreate database → import backup.

### T2

**Issue:** §§10 and 16 declare `DB_VERSION = 1`, no migrations, and supported imports beginning at version 1, while §17.1 mandates an “older-version fixture” that migrates a missing future field. No such supported version exists, making the required v1 test impossible as written and contradicting the no-invented-history rule.

**Recommendation:** Remove that v1 fixture requirement or define it explicitly as an isolated synthetic migration-harness test that does not create a shipped historical version.

## Final statement

The plan is not yet ready to be finalised as `PROJECT_PLAN_FINAL.md`; T1 and T2 require narrow consistency corrections, and the S1 mixed-input fixture should be stated explicitly. D1 and D2 may remain open for the owner checkpoint.