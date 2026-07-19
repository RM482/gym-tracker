# Gym Tracker — Requirements

Status: confirmed with the product owner on 2026-07-19.
This document is the source of truth for *what* the app must do. `PROJECT_PLAN.md` describes *how*.

## 1. Product objective

A very simple phone app that lets the owner record gym exercises as quickly as possible while training.

Core workflow:

1. Select an exercise.
2. Immediately see the weight and reps recorded the previous time it was performed.
3. Enter the weight and reps for the current set.
4. Save with minimal taps.
5. Later, view a dashboard showing progress over time.

The owner rotates through roughly 10–20 self-added exercises. No large pre-populated exercise library. Primary device: iPhone. Must work offline and store data locally.

## 2. Product principles

Prioritise: extremely fast logging; minimal navigation; a clean interface usable between sets; local-first storage and offline operation; simple reliable functionality; a design that can grow later without overengineering v1.

Avoid: accounts/logins; cloud backends; large exercise catalogues; social features, feeds, coaching or gamification; complex workout programming; speculative features not approved by the owner.

## 3. Confirmed decisions (owner Q&A, 2026-07-19)

| # | Question | Decision |
|---|----------|----------|
| 1 | Delivery | **Installable home-screen web app (PWA)**. No App Store, no paid developer account. |
| 2 | Logging granularity | **Each individual set is recorded**, but entry must be very quick. The owner explicitly wants to be able to type or dictate a sentence such as *"I did 2 sets of 8 reps at 10kg, then one set of 8 reps at 9kg"* and have it recorded. → v1 includes a natural-language quick-entry field (iOS keyboard dictation covers voice) in addition to tap-based entry. |
| 3 | Sessions | **Automatic grouping by day.** No named workout sessions in v1. |
| 4 | Units | **Kilograms only.** (Store canonically in kg so other units could be added later.) |
| 5 | Bodyweight exercises | **Supported.** Weight field may be 0 (pure bodyweight) or a positive added weight. |
| 6 | Backup | **One-tap JSON export to Files/iCloud plus import/restore.** No accounts, no cloud sync in v1. Data loss should be guarded against but is not catastrophic. |
| 7 | Extras in v1 | **None.** Rest timer, workout templates and per-side (unilateral) logging are excluded from v1 and assessed only as optional future features. |
| 8 | Workout-day boundary (checkpoint D1) | **03:00 local time approved** (2026-07-19): a set logged at 00:30 belongs to the previous evening's workout. |
| 9 | Starter suggestions (checkpoint D2) | **Approved** (2026-07-19): 8 tappable example-exercise chips, first run only. |
| 10 | Day overview (owner request at checkpoint) | **In scope** (2026-07-19): one screen showing all exercises and sets of a chosen day, including derived workout duration (first set → last set). |
| 11 | Fitbit import (calories, duration) | **Rejected for v1** (2026-07-19, owner delegated: "don't do it if it is too much of a hassle"): requires a Fitbit/Google developer app, OAuth login and online-only API calls — conflicts with no-login/offline/local-first. Duration is derived from set timestamps instead (row 10); calories deliberately not shown rather than estimated dishonestly. |

## 4. Required core functionality

### Exercise management
- Add an exercise.
- Rename an exercise (history must be preserved).
- Archive or delete an exercise safely.
- Reorder exercises.
- Normal logging interface shows only the owner's exercises.
- Quick access via favourites, recents, custom order or another well-justified approach.

### Exercise logging
Each logged set records at minimum: exercise, weight (kg), repetitions, date and time.

When an exercise is selected, prominently display: the most recent weight and reps; the most recent workout date; enough recent history to decide what to attempt next, without clutter.

Common entries must need as few taps as reasonably possible (pre-filling previous values, large increment controls, repeat-previous-set, save-and-add-another, staying on the exercise across several sets, etc. — assessed, not all mandatory).

### History
- View previous entries for an exercise.
- Correct or delete an accidental entry.
- Clearly distinguish separate sets and workout sessions.
- Preserve historical data when an exercise is renamed.
- View all exercises and sets of a single day in one overview, with the day's duration (decision row 10).

### Progress dashboard
A useful but simple dashboard: the smallest set of metrics that gives a meaningful view of progress, each calculation clearly explained.

## 5. Acceptance standard (v1 complete only when…)

- Works reliably on the owner's iPhone via the agreed installation method (Add to Home Screen).
- Works without an internet connection.
- The owner can add and manage exercises.
- A set can be recorded quickly; the previous weight/reps are immediately visible.
- Multiple sets can be recorded without repeated menu navigation.
- Historical entries can be reviewed and corrected.
- Progress is shown clearly on a simple dashboard.
- Data survives closing and reopening the app.
- Core calculations are covered by automated tests.
- Installation and usage instructions are complete.
- The repository contains no secrets.
- The implementation matches the approved plan or documents justified deviations.

## 6. Process requirements

- Two-round independent Codex review of the plan before any implementation code (reviews in `docs/reviews/`).
- Owner approval of the final plan and feature scope before implementation.
- During implementation: small testable phases, tests after each meaningful change, regular git commits, documentation kept in sync (`README.md`, `docs/PROJECT_PLAN.md`, `docs/PROJECT_PLAN_FINAL.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TESTING.md`).
