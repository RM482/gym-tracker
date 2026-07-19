# Decisions log

Newest last. Format: date — decision — context/consequence.

## 2026-07-19 — Product Q&A (pre-planning)
Owner confirmed: installable PWA; individual sets with fast entry incl. typed/dictated sentences; automatic day grouping; kg only; bodyweight supported; JSON export/import backup, no sync; no timers/templates/unilateral in v1. Recorded in `REQUIREMENTS.md` §3 rows 1–7.

## 2026-07-19 — Review process completed
Codex round 1 (20 recommendations) → plan v1.1; Codex round 2 (12 findings) → v1.2; capped Codex verification pass (2 blockers + 1 fixture gap) → v1.3. All reviews and responses in `reviews/`. Verification pass was one round beyond the mandated two — accepted by the lead developer because the round-2 fixes touched data-loss boundaries; capped at one pass.

## 2026-07-19 — Owner checkpoint approval (plan v1.4)
Owner approved the plan and core scope with four amendments:

- **D1 — Workout-day boundary: 03:00.** A set at 00:30 belongs to the previous evening's workout (`PROJECT_PLAN.md` §11.1).
- **D2 — Starter chips: yes.** 8 example-exercise chips, first run only (§6.1).
- **D3 — Day overview: added to core scope** at the owner's request — one screen with all exercises/sets of a chosen day + derived duration (§6.7, §19.7). Re-entered scope after being cut in round 1 (then unrequested; now an owner requirement).
- **D4 — Fitbit import (calories/duration): rejected.** Owner delegated ("don't do it if it is too much of a hassle"); it demands a developer-app registration, OAuth login, and online-only APIs — incompatible with no-login/offline/local-first. Duration ships anyway (derived from set timestamps, §11.2); calories deliberately absent rather than estimated without heart-rate data.

Consequence: implementation phase gate (§18) satisfied; Phase 0 may begin.
