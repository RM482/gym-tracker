You are an independent reviewer of a design brief for a small, zero-dependency, no-build,
local-first PWA (vanilla JS ES modules, IndexedDB, service worker, Vitest + Playwright).
You have read-only access to the whole repository. Review the brief AGAINST THE REAL CODE,
not on its own terms.

Read first:
- docs/reviews/CHANGE_SET_5_BRIEF.md   (the brief under review)
- docs/HANDOFF.md                      (binding schema and deploy rules; D1-D11)
- docs/DECISIONS.md                    (esp. D7 add-on, D8 muscle groups)
- js/db.js, js/store.js, js/backup.js, js/analysis-export.js
- js/ui/entry-panel.js, js/ui/set-editor.js, js/ui/components.js
- tests/db.test.js, tests/store.test.js, tests/backup.test.js

The brief proposes ONE feature: an optional per-set intensity flag with three levels
(Easy / OK / Struggled), stored as SetEntry.intensity = null | 'easy' | 'ok' | 'hard'.
This requires DB_VERSION 2 -> 3, the first schema change since v2.

THIS IS A SCHEMA CHANGE ON A DEVICE HOLDING THE OWNER'S ONLY COPY OF THEIR TRAINING HISTORY.
There is no server and no sync. A migration bug loses real data permanently. Weight your review
accordingly: correctness of the upgrade path matters more than anything else in the brief.

What I need from you, in priority order:

1. THE MIGRATION PATH. Trace it against the real code and say whether it is safe.
   - applyMigrations in db.js: does adding migrations[2] compose correctly with migrations[1] for a
     device at v1, at v2, and at v3 already? Cite the code.
   - The change-set-1 fix (G4) made each store walk once applying every version's transform in order.
     Does that still hold with two record steps for the same 'sets' store?
   - What happens to a device mid-upgrade if the transaction aborts?
   - DbTooOldError / VersionError: a device that has run v3 and then loads a CACHED v2 shell. Is that
     path still correct with the bump? Is there any window where the owner is routed toward the
     destructive reset screen?
   - validateEnvelope rejects backups with schemaVersion > DB_VERSION. What happens to a v3 backup
     restored into a v2 shell, and is the error message honest?
   - Does anything need to happen for a v2 backup restored into a v3 app? Trace migrateBackup.

2. COMPLETENESS. A new set field must be handled everywhere a set is written, read, shown, edited,
   exported or restored. The brief lists ten places. Find the ones it MISSED - check every writer and
   reader of a set record, including restoreSet/undo, snapshotForBackup, the quick-entry batch path,
   and anything that reconstructs or copies a set (e.g. the Repeat button copying a previous set:
   should it copy the intensity, and what does it mean if it does?).

3. THE CARRY-OVER QUESTION (brief's open question 2). The brief argues intensity must NOT pre-fill
   from the previous set, contradicting what the owner's chosen option implied. Judge that argument
   on the merits against D7's precedent. Say plainly which you would ship.

4. THE OTHER FIVE OPEN QUESTIONS at the end of the brief. Answer each with a recommendation.
   Question 5 (does the existing v1->v3 test still test what it claims once DB_VERSION is really 3)
   is the one I am least sure about - check tests/db.test.js carefully.

5. SCOPE. This is a single-user app on one iPhone. Say plainly what in the brief is unnecessary.

Ground rules:
- Do not write or modify any file. Read-only review.
- Anchor findings to file:line. Mark each BLOCKER / SHOULD-FIX / CONSIDER.
- If the brief is right about something, say so briefly; do not manufacture findings.
- Respect D1-D11 and the schema rules in HANDOFF.md; if the brief violates one, say which.
- The owner is a beginner developer. State reasoning plainly.
