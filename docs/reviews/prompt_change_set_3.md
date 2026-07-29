You are an independent reviewer of a design brief for a small, zero-dependency, no-build,
local-first PWA (vanilla JS ES modules, IndexedDB, service worker, Vitest + Playwright).
You have read-only access to the whole repository. Review the brief AGAINST THE REAL CODE,
not on its own terms.

Read first:
- docs/reviews/CHANGE_SET_3_BRIEF.md  (the brief under review)
- docs/HANDOFF.md, docs/DECISIONS.md  (binding decisions D1-D8, schema and deploy rules)
- js/ui/home.js, js/ui/manage.js, js/ui/log.js, js/ui/exercise-actions.js,
  js/ui/components.js, js/app.js, js/store.js, js/backup.js, js/stats.js
- tests/ (what is actually covered today)

The brief proposes four changes: (1) an add-exercise sheet taking name + optional muscle group
that then navigates into the new exercise; (2) a batch muscle-group assignment mode on Manage;
(3) a new #/superset/<idA>/<idB> screen showing two stacked entry panels, preceded by extracting
the shared entry block out of log.js into js/ui/entry-panel.js; (4) collapsible muscle-group
sections on Home, persisted in settings as collapsedGroups.

What I need from you, in priority order:

1. CORRECTNESS AGAINST THE CODE. Every claim the brief makes about existing behaviour, cite the
   file and line and say whether it holds. I care most about these five:
   - that store.addExercise already accepts a muscle group and returns the created record with its id;
   - that updateSettings does NOT call touchDataChange, so persisting collapsedGroups cannot
     trigger the backup-overdue banner (isBackupOverdue in store.js);
   - that a new settings key needs no DB_VERSION bump and survives backup export/import
     (snapshotForBackup, replaceFromBackup, backup.js validation);
   - that the entry block in log.js can be extracted behaviour-preservingly, and specifically what
     hidden coupling exists between the write guard, ctx.refresh(), the quick-entry draft map,
     ctx.isCurrent() and the add-on/e1RM local state;
   - that per-panel (rather than shared) write guards are safe when two panels write to two
     different exercises on one screen.

2. WHAT THE BRIEF HAS MISSED. Failure modes, not style. In particular: the superset route where an
   id is unknown, archived, deleted mid-session, or identical in both slots; renaming or archiving
   an exercise from inside a superset; the interaction between folding and the Home filter box
   (a regression in this exact area shipped once already — see docs/PROGRESS.md 2026-07-25);
   grouping mode racing against ctx.refresh() or a returning-from-background refresh
   (app.js scheduleRefresh); stale collapsedGroups naming a group that no longer has exercises;
   and anything about the detached-render/commit protocol in app.js that a new screen must honour.

3. WHERE THE BRIEF IS OVERBUILT. This is a single-user app on one iPhone. Say plainly which parts
   are unnecessary complexity and what the simpler version is. The brief's own open question 4
   (a "2 of 6 done" count on folded headings) is a candidate; there may be others.

4. THE FIVE OPEN QUESTIONS at the end of the brief. Answer each directly with a recommendation.

5. SLICING AND TESTABILITY. Is the slice order right? Is "no existing test may be edited" a sound
   success criterion for the refactor slice, or does it force worse structure? What tests would you
   add that the brief's test plan does not have?

Ground rules:
- Do not write or modify any file. Read-only review.
- Anchor findings to file:line. Mark each finding BLOCKER / SHOULD-FIX / CONSIDER.
- If the brief is right about something, say so briefly and move on; do not manufacture findings.
- Respect the recorded decisions D1-D8 and the schema rules in HANDOFF.md; if the brief violates
  one, say which and why that matters.
- The owner is a beginner developer. Where you recommend something, state the reasoning plainly.
