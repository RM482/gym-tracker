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

## 2026-07-19 — LLM-friendly analysis export added
Owner requested an export suitable for later LLM analysis. Added a separate readable JSON export rather than overloading the restorable backup schema: exercises are named and each set is denormalised with local/UTC time, stored workout day, kg, reps, bodyweight meaning, archive state, and a concise schema guide. The app never uploads the file; the owner explicitly chooses a Files/share destination. Restorable backup/import remains Phase 7 and retains its stricter recovery schema.

## 2026-07-21 — Change set 1: owner feedback after real iPhone use
Owner used the shipped app and raised six items (duplicate lists, muscle groups, done-today highlight, machine add-on switch, same-weight nudge, zoom-on-tap). Design brief → independent Codex review (14 findings, all accepted) → owner decisions. Documents: `reviews/CHANGE_SET_1_BRIEF.md`, `reviews/CODEX_REVIEW_CHANGE_SET_1.md`, `reviews/CLAUDE_RESPONSE_CHANGE_SET_1.md`.

- **D5 — Zoom: stop accidental zoom only.** `touch-action: manipulation` (kills double-tap zoom) plus a computed ≥16px font on every editable control (kills iOS focus zoom). Deliberate pinch-zoom is preserved, honouring the plan's §13 200%-zoom accessibility commitment. Rejected: hard viewport lock (accessibility regression and unreliable on iOS).
- **D6 — Same-weight nudge fires after 3 consecutive prior sessions** at an identical top set, evaluated over completed workout-days strictly before today, and stays visible through today until beaten. Delivered as an **in-app** nudge, not an OS push notification: iOS web push would require notification permission and a push delivery service, contradicting the no-backend/offline/no-login principles the plan is built on.
- **D7 — Machine add-on switch is recorded as on/off metadata only** (`SetEntry.addOn`, boolean, default false), never converted into an invented kg value, and excluded from weight arithmetic. Because a set at 50 kg with the add-on is genuinely a different load from 50 kg without, the nudge compares the pair `(top weightKg, addOn)`, and dashboards disclose that weights/e1RM are recorded base kg excluding the unknown increment. A future measured `addOnKg` can fold in without a further set-schema change.
- **D8 — Muscle-group taxonomy: Chest, Back, Legs, Shoulders, Arms, Core, Full body, Other**, with `Ungrouped` (never assigned) kept distinct from a deliberate `Other`. Existing exercises start Ungrouped and are tagged incrementally. Grouping applies to **Home only**; Manage stays a flat list showing the group as secondary text, because grouped sections conflict with its single global ▲▼ ordering. No enable/disable setting (unrequested scope).

Two pre-existing latent defects in shipped code were found during review and become prerequisites of the schema change rather than landmines under it: backup restore never replayed record migrations (`backup.js`), and `VersionError` (old cached code meeting a newer database) was unhandled and could route the owner toward the destructive reset screen.

## 2026-07-25 — Change set 2: owner feedback (second round)

Owner reported the Home search had stopped working and asked for three additions. Implemented directly and deployed (`gt-v0.17.0`); no schema change. Unlike change set 1 this round had no separate design brief or Codex review — noted as a deviation in `HANDOFF.md`. Detail in `PROGRESS.md` (2026-07-25).

- **Progress is surfaced as estimated 1-rep max (Epley), not a new metric.** The owner asked how to tell whether "higher weight, fewer reps" is progress. Rather than invent a bespoke score, the entry screen now shows a live e1RM for the set being entered and compares it to the previous session's best. This reuses the exact formula and eligibility the dashboard already applies (work sets, reps ≤ 12, recorded kg), so one strength number is defined consistently everywhere. Add-on sets are flagged and **not** compared, honouring **D7** (the add-on's kg is unknown, so no ordering may be claimed across a change in add-on state).
- **Rename and muscle-group assignment are now reachable from inside an exercise**, not only from Manage. Both flows moved into a shared `js/ui/exercise-actions.js` so the two entry points cannot drift; behaviour is identical to Manage. No change to **D8** (grouping stays Home-only for display; Manage remains the flat, reorderable list).
- **Home filter retains its >12-exercise threshold**; change set 2 fixed the regression rather than changing when the box appears. Progress-tab search is shown once there is more than one exercise.
