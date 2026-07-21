# Change set 1 — design brief for Codex review

Date: 2026-07-21. Author: Claude (lead developer). Reviewer: Codex (independent).

Context: v1 (phases 0–8) is built, deployed to GitHub Pages, and the owner has now used it on their iPhone. `DB_VERSION = 1`, `migrations = {}` (no migration has ever shipped). Tests currently green: Vitest 59, Playwright 13. This brief proposes how to address six pieces of owner feedback. Codex should review each item's approach, flag risks, and challenge the recommendations. After Codex, the plan + owner-decisions go to the owner for approval before any implementation.

The app's founding principles still bind: local-first, offline, no login, no cloud/push backend, fast one-handed logging, kg-only, beginner-maintainable vanilla JS, no runtime dependencies, accessibility (the plan valued pinch-zoom to 200%). Several of these items are in tension with those principles; that tension is the point of the review.

---

## Item 1 — Home list sometimes renders 2–3 stacked copies (BUG)

**Diagnosis (confirmed in code).** `render()` in `js/app.js` is bound to `hashchange`, `focus`, and `visibilitychange`, plus the initial call and `ctx.refresh`. Returning to the PWA fires `focus` and `visibilitychange` together, so two `render()` calls overlap. Each call does `el.innerHTML = ''` once at its start, then `await SCREENS[route].render(el, …)`; the screen module (`home.js`) itself `await`s `getSettings()`, `listExercises()`, `getLastSessionsByExercise()` before/while appending rows. The supersession guard `if (seq !== renderSeq) return` is checked **only once**, right after `ensureCtx()`, and never again during the screen's own async work. Result: both overlapping renders clear `#app` once, then interleave their row appends → 2 (or 3) stacked lists. Intermittent because it depends on event/microtask timing. Home is worst-hit because it is the return-to-app landing screen and does the most awaiting.

**Options.**
- A. Re-check `seq !== renderSeq` inside a render token passed to each screen (screens abort their own appends if superseded). Touches every screen module.
- B. Render each screen into a **detached container**, then, only if `seq === renderSeq` after the screen resolves, swap it into `#app` in one `replaceChildren`. Screens keep appending to "their" element; app.js owns the swap. One catch: `home.js`'s filter handler uses `el.querySelectorAll('.list-row')` — with a detached root passed as `el`, that still works because it queries within the container.
- C. Serialize renders: keep a module-level in-flight promise; a new render awaits/cancels the previous. Also coalesce `focus`+`visibilitychange`.
- D. Minimal: drop the `focus` listener (keep `visibilitychange`), and re-check `seq` immediately after the screen render resolves, clearing if stale.

**Recommendation: B (detached container + guarded swap), plus coalescing the redundant `focus`/`visibilitychange` into one debounced "app became visible" trigger.** B is robust against *all* overlap sources, not just today's two events, and keeps the fix in one file (app.js) rather than sprinkling tokens through every screen. Add a Playwright regression that dispatches overlapping `visibilitychange`+`focus`+`hashchange` and asserts exactly one `.list-row` per exercise.

**Open question for Codex:** is there any screen that appends asynchronously *after* its exported `render()` resolves (e.g. a late `.then()` that would land after the swap)? If so, B needs those made await-complete first.

---

## Item 2 — Group exercises by muscle group

**Why:** the owner names exercises informally ("how I call them"), so an alphabetical/flat list is hard to scan; grouping by muscle group aids findability.

**Data model.** Add `muscleGroup: string | null` to `Exercise`. This is the **first real migration**: bump `DB_VERSION` to 2, add `migrations[1] = { records: { exercises: (x) => ({ ...x, muscleGroup: x.muscleGroup ?? null }) } }`, and — per `docs/MAINTENANCE.md` — add both a pure record-fn fixture test and a DB-level upgrade test. Backup/export schema and the analysis export gain the field; import migrates older backups (the import path already replays `migrations[].records`).

**Taxonomy.** A curated pick-list keeps grouping consistent despite informal names: **Chest, Back, Legs, Shoulders, Arms, Core, Full body, Other** (Other/null = "Ungrouped"). Free-text would fragment ("legs" vs "Legs" vs "quads"). Recommend curated list, no custom values in v1 (revisit if the owner wants more).

**UI.**
- Add/rename exercise sheet gains a muscle-group selector (defaults to Ungrouped).
- Home: a setting `groupByMuscle` (default on). When on, exercises render under group headings in a fixed group order, MRU within each group; Ungrouped last. When off, today's flat MRU list. Interacts with the existing `exerciseSort` (recent/manual): grouping is orthogonal — it sets the section, `exerciseSort` orders within a section.
- Manage: same grouping, and the group is editable from the row's ⋯ menu.

**Recommendation:** curated taxonomy + `groupByMuscle` setting (default on) + one migration to v2 carrying this field **and** item 4's field together (one migration, not two).

**Open questions for Codex:** (a) curated vs free-text — agree? (b) should the Home filter box (appears >12 exercises) also filter across group headers? (c) is default-on grouping right, or should first-run stay flat until the owner assigns groups?

---

## Item 3 — Highlight what's already logged this session

**Why:** mid-workout, the owner wants to see at a glance which exercises they've *not yet* done today, to pick the next one.

**Approach.** On Home, mark each exercise that has ≥1 set on today's workout-day (D1 rule): a ✓ + muted styling, and (with grouping) a per-group "2/5 done" count. Sort could keep done items but visually recede them; do **not** reorder aggressively mid-workout (jumping rows are disorienting). Data: add `getTodayCountsByExercise()` to the store (one pass over today's sets), or extend `getLastSessionsByExercise` to include a `todayCount`. Purely a Home concern; no data-model change.

**Recommendation:** ✓ + muted style + per-group done-count; no reordering. Accessible: the ✓ carries an `aria-label` ("logged today"), not colour alone.

**Open question for Codex:** should "done today" also surface on the Log screen header when navigating between exercises, or is Home sufficient? (Recommend Home-only for v1 to stay minimal.)

---

## Item 4 — "Machine on" add-on weight toggle

**The physical thing:** many selectorised machines have a small add-on weight (a pin/lever adding a fixed small increment) the owner flips on; the owner does **not** know how many kg it adds.

**Tension:** weight math (PRs, e1RM, "same weight" nudge) needs numbers, but the owner can't supply the add-on's kg. Options:

- A. **Per-set boolean `addOn`** (metadata only). Log screen shows a toggle near the weight stepper; saved sets show a small "+on" badge; history/day/export preserve it. It does **not** change `weightKg` or any calculation (amount unknown → honest). Prefill remembers the last toggle state per exercise.
- B. **Per-exercise configurable `addOnKg`** (owner sets once, e.g. 2.5) + per-set boolean; when on, effective weight = `weightKg + addOnKg` for display and PRs. Quantified, but contradicts "I don't know how much."
- C. Free-text note per set (already not in v1; heavier UI).

**Recommendation: A now, with the data shaped so B is a clean future add.** Store `addOn: boolean` on `SetEntry` (part of the v2 migration, default false). Keep it out of all weight math in v1; render it as a badge so the owner can *see* which sessions used it. If the owner later measures the add-on, we can introduce optional `addOnKg` per exercise and fold it into calculations without another schema change to sets. This is the honest, minimal, reversible choice.

**Open questions for Codex / owner:** (a) is metadata-only (no effect on PRs) acceptable, or does the owner expect it to count toward weight? (b) toggle placement — beside the weight stepper vs a small checkbox under it — which stays one-handed and doesn't slow the hot path? (c) does the "same weight ≥3 sessions" nudge (item 5) treat two sessions as "same weight" only if the add-on state also matches? (Recommend: compare `weightKg` only; ignore add-on for the nudge to keep it simple.)

---

## Item 5 — Nudge when the same weight has been used for >3 sessions

**Why:** a progressive-overload reminder.

**Critical constraint:** the word "notification" — iOS PWAs cannot deliver reliable OS push notifications without a push service and, on iOS, an installed-to-Home-Screen web-push setup that is fragile and violates the no-backend/offline principle. The plan explicitly excluded push. **Recommendation: an in-app nudge, not an OS notification.**

**Definition of "same weight."** Compute per exercise from history: the **top-set weight** (max `weightKg` on a workout-day) for each of the last N distinct sessions. If the last **3** sessions share an identical top-set weight (and there are ≥3 sessions), show the nudge. Top-set is the least noisy signal; "every set identical" is too strict, "any set" too loose. Weight-0 (bodyweight) exercises: use top **reps** instead, or skip the nudge (recommend skip in v1 to avoid false signals). Put the calc in `stats.js` (pure, testable).

**Surface.** An in-app hint on the exercise's Home row and at the top of its Log screen: "Same top weight 3 sessions — ready to add?" Dismissible? Recommend non-dismissible but non-blocking (it self-clears once a heavier top set is logged). No badge counts, no history of nudges.

**Open questions for Codex / owner:** (a) confirm in-app (not phone push) is acceptable — I believe it must be, given the constraints. (b) threshold: exactly 3 sessions, or ">3" i.e. 4? Owner wrote "more than 3 sessions" → literally the 4th session onward; recommend firing when the **last 3 sessions** match (simpler, fires on the 3rd repeat) and confirm with owner. (c) top-set vs all-sets definition — agree top-set?

---

## Item 6 — Screen should not zoom in on tap ("locked")

**Diagnosis:** viewport is `width=device-width, initial-scale=1, viewport-fit=cover` (no zoom lock); no `touch-action` in CSS. Inputs inherit ≥16px so iOS input-focus-zoom is not the trigger; the culprit is **double-tap-to-zoom** firing on rapid button taps (steppers, chips).

**Options.**
- A. `touch-action: manipulation` on interactive elements / `body` — removes double-tap zoom and the 300ms tap delay, **keeps** pinch-to-zoom (accessibility preserved). Standards-based, recommended.
- B. Add `maximum-scale=1, user-scalable=no` to the viewport — a harder "lock," but disables intentional pinch-zoom (accessibility regression; modern iOS Safari also historically ignored `user-scalable=no`, so it's both harmful and unreliable).
- C. Both A and B.

**Recommendation: A.** It fixes the actual annoyance (zoom on tap) while preserving the pinch-zoom the plan deliberately supported for accessibility. Keep all inputs ≥16px (already true) to avoid focus-zoom. If the owner truly wants pinch disabled too, add `maximum-scale=1` as an explicit, owner-approved accessibility trade-off — but default to A.

**Open question for owner:** do you want *all* zoom disabled (including deliberate pinch), or just the accidental zoom-on-tap? (Recommend the latter.)

---

## Proposed sequencing (after approval)

1. **Item 1 bug fix** (isolated, no schema change) — ship first.
2. **Item 6 zoom** (CSS/viewport only) — ship with 1.
3. **v2 migration** carrying `muscleGroup` (item 2) + `addOn` (item 4) fields, with the mandated fixture + DB-upgrade tests — the one schema change, done once.
4. **Item 2 grouping UI**, **item 3 done-today highlight**, **item 4 toggle UI**, **item 5 nudge** — each in its own tested slice, each ending green with a cache bump.

Each slice: unit tests + a Playwright scenario where it has UI, `check:precache`, PROGRESS/DECISIONS updated, commit. Backup/analysis-export schema updated alongside the migration; `docs/reviews/` keeps this brief and Codex's review.

**Overall questions for Codex:** Is batching two nullable fields into one v2 migration sound, or should they be separate versions? Any ordering risk between the migration and the offline SW update (a client on old code opening a v2 DB)? Is the in-app reinterpretation of "notification" (item 5) and the honest metadata-only machine toggle (item 4) the right call, or is there a materially better approach I'm missing? Does any of this violate the local-first / accessibility / minimal-scope principles?
