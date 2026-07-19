# Gym Tracker — Project Plan

Version: 1.4 — **approved by the owner on 2026-07-19** (Codex rounds 1–2 + capped verification complete; checkpoint decisions D1–D4 recorded in `DECISIONS.md`)
Date: 2026-07-19
Author: Claude (lead developer). Reviewer: Codex (independent).

---

## 1. Product goals and non-goals

### Goals
- Record a gym set (exercise, weight, reps, timestamp) in the fewest possible taps while standing in the gym.
- On selecting an exercise, instantly show what was lifted last time (per set), so the owner can decide what to attempt.
- Support a natural-language quick-entry line, typed or dictated, e.g. *"2 sets of 8 at 10kg, then 1 set of 8 at 9kg"*.
- Show simple, meaningful progress per exercise over time.
- Work fully offline, store all data on the device, install to the iPhone home screen for free.
- Be maintainable by a beginner with AI assistance: minimal dependencies, no build step for the app itself.

### Non-goals (v1)
- No accounts, login, cloud backend or sync.
- No exercise catalogue; only owner-added exercises (plus the approved 8-chip starter-suggestion list at first run — D2).
- No rest timers, workout templates, supersets, per-side logging, coaching, social features or gamification.
- No units other than kg (stored canonically so lbs could be added later).
- No Apple Health, widgets, or Watch integration (unreachable from a web app; see §21).

## 2. Confirmed user requirements and open owner decisions

See `docs/REQUIREMENTS.md` §3 for the owner Q&A. Binding decisions: (1) installable PWA; (2) individual sets with very fast entry incl. natural-language quick entry; (3) automatic grouping by day; (4) kg only; (5) bodyweight supported (weight 0 or added weight); (6) JSON export/import backup, no sync; (7) no timers/templates/unilateral in v1.

**Decisions resolved at the owner checkpoint (2026-07-19):**
- **D1 — workout-day boundary: 03:00 approved.** A "workout day" runs 03:00–03:00 local time (§11.1).
- **D2 — starter chips: approved.** 8 tappable example-exercise chips on first run only (§6.1).
- **D3 — day overview: added to core scope at owner request.** One screen showing all exercises and sets of a chosen day, with derived duration (§6.7).
- **D4 — Fitbit import (calories/duration): rejected.** Owner delegated the call ("don't do it if it is too much of a hassle") — it requires a developer-app registration, OAuth login and online-only API calls, conflicting with no-login/offline/local-first. Duration is derived from set timestamps instead (§6.7, §11.2); calories are deliberately absent rather than estimated without heart-rate data. Revisit only if account-linked features are ever wanted (Appendix A).

## 3. Assumptions and decisions

| ID | Assumption / decision | Rationale |
|----|----------------------|-----------|
| A1 | Target iOS 16 or later, Safari engine | `crypto.randomUUID`, ES2020 modules, IndexedDB, service workers, `navigator.storage.persist` all available. |
| A2 | Hosted on GitHub Pages over HTTPS in a dedicated public repository | Owner already uses GitHub Pages. HTTPS is required for service workers. App code is public; **data never leaves the device**. |
| A3 | The app has zero runtime dependencies and no build step | Beginner-maintainable; `git push` = deploy. Node is used only for tests. |
| A4 | One user, one device | No merge/sync logic. Backup covers phone replacement. Concurrent-tab policy: §12. |
| A5 | Weight = external load in kg; 0 allowed | Bodyweight work logs 0 (or the added weight). Bodyweight itself is not tracked in v1. |
| A6 | Workout-day boundary 03:00 local (approved — D1) | See §2 and §11.1. |
| A7 | Decimal weights: up to 2 decimals; `.` and `,` both accepted | Microplates; Dutch keyboards use comma. |
| A8 | Exercise names unique case-insensitively (trimmed) among non-archived exercises | Prevents accidental duplicates; archived names reusable; unarchive-conflict rule in §6.5. |
| A9 | Quick-entry parser is deterministic (regex/grammar), fully offline, no AI calls | Reliability, privacy, zero cost, testability. |
| A10 | Charts are hand-rolled inline SVG (~80 lines for a shared line-chart helper) | Two simple line charts don't justify a runtime dependency (would violate A3 harder). |
| A11 | All platform APIs go through one thin adapter module (`platform.js`) | Clock, UUID, share/download, persist, online status become injectable in tests. |
| A12 | All stored timestamps are epoch milliseconds (numbers), never ISO strings | Strings with mixed UTC offsets don't sort; ms are canonical and timezone-independent. Display formatting derives at render time. |

Deferred to implementation (not architectural): icon artwork, palette, microcopy.

## 4. Recommended technology stack

### Options considered

| Criterion | PWA (chosen) | Expo / React Native | Native SwiftUI |
|---|---|---|---|
| Dev speed & simplicity | High — HTML/CSS/JS, no toolchain | Medium — Expo tooling, dev builds | Medium-low — Xcode, Swift learning curve |
| iPhone experience | Good (standalone, full screen) | Very good | Best |
| Offline | Full (service worker + IndexedDB) | Full | Full |
| Local persistence | IndexedDB (+ best-effort persist) | SQLite | SwiftData/CoreData |
| Installation | Safari → Add to Home Screen; free | TestFlight or €99/yr | €99/yr, or 7-day free re-installs |
| Maintenance burden | Lowest — static files | Dependency churn | Xcode/OS upgrades |
| Testing | Vitest + fake-indexeddb + small Playwright (WebKit) smoke suite | Jest + native complications | XCTest |
| Backup/export | Web Share API / download to Files | Files APIs | Files APIs |
| Extensibility | Good for app features; no Health/Watch/widgets | Partial native APIs | Full native APIs |
| Recurring cost / external deps | **None** | Possible €99/yr | €99/yr |

### Recommendation

**Installable PWA, vanilla JavaScript (ES modules), no framework, no build step.**

- App: `index.html` + CSS + ES modules, IndexedDB, service worker, web app manifest.
- Dev-only tooling: `npm` with dev dependencies `vitest`, `fake-indexeddb`, `@playwright/test` (small browser smoke suite). None ship to the phone. `package-lock.json` is committed.
- Hosting: dedicated public GitHub repository + GitHub Pages (free, HTTPS). Deploy = `git push`.

Trade-off accepted: no Apple Health/widgets/Watch/App Store. None is in scope; the export format (§16) is the migration path if that ever changes.

## 5. Architecture

Single-page app, hash routing, strict layering: **UI never touches IndexedDB directly.**

```
┌─────────────────────────────────────────────────────┐
│ UI (js/ui/*.js): home, log, history, dashboard,     │
│ manage, settings + shared components — render and   │
│ event handlers only                                 │
├─────────────────────────────────────────────────────┤
│ Store (js/store.js): app-facing API + validation.   │
│ In-memory exercise cache; reloads from DB on        │
│ visibilitychange/focus (stale-tab policy §12).      │
├──────────┬───────────┬───────────┬──────────────────┤
│ db.js    │ parser.js │ stats.js  │ backup.js        │
│ IDB open │ text →    │ grouping, │ export/import    │
│ migrate, │ sets      │ metrics   │ validation       │
│ CRUD     │ (pure)    │ (pure)    │ (pure + injected)│
├──────────┴───────────┴───────────┴──────────────────┤
│ platform.js — clock, uuid, share/download, persist, │
│ online (thin adapters, faked in tests)              │
├─────────────────────────────────────────────────────┤
│ Platform: IndexedDB · sw.js · manifest.webmanifest  │
└─────────────────────────────────────────────────────┘
```

- Pure modules (`parser.js`, `stats.js`, migration record-transforms, backup validation) have no DOM/DB handles → trivially unit-testable.
- Routes: `#/` (home), `#/log/<id>`, `#/history/<id>`, `#/day/<YYYY-MM-DD>` (day overview, §6.7), `#/dashboard`, `#/manage`, `#/settings`. This is the complete inventory; every route has a module in §23. Hash routing keeps the back gesture working in standalone mode; every screen also renders an explicit back button. A route pointing at a missing/archived exercise redirects to `#/` with a toast (§12).
- State: explicit re-render of the current screen after each mutation. No framework.
- Every `js/` module starts with a header comment stating its public API and invariants (maintainability contract, see also `docs/MAINTENANCE.md`).

## 6. Screen-by-screen user experience

### 6.1 Home (exercise picker) — `#/`
- Vertical list of non-archived exercises, large tap targets (≥ 56 px, full width).
- Order: **most recently used first** (by each exercise's latest `performedAtMs`; never-used exercises follow in manual order). Settings can switch to "my order" (§6.6).
- Row: exercise name + last-session summary in a fixed unambiguous format — weight mode: "Tue · 3 sets · top 10 kg"; reps mode (§6.4): "Tue · 3 sets · best 12 reps".
- Header icons: today (day overview, §6.7), dashboard, manage, settings.
- Filter box appears only with > 12 exercises; typing filters instantly.
- **Backup banner**: if > 30 days since last export *and* data changed since, a one-line dismissible banner ("Backup recommended — Export") links to Settings. Dismissal snoozes it 7 days (§8.3).
- **Empty state** (first run): "Add your first exercise" card; plus starter chips if D2 approved (8 chips, tap = create; hidden once ≥ 1 exercise exists).
- "＋ Add exercise" pinned at the bottom.

### 6.2 Log screen — `#/log/<exerciseId>` (the heart of the app)

Definition used everywhere: **"previous session" = the most recent workout day for this exercise strictly before today's workout day.** Today's sets appear only in the Today card.

Top to bottom:

1. **Header**: back arrow, exercise name, history icon.
2. **"Last time" card**: previous session's date ("Tue 15 Jul · 4 days ago") and its sets in order: `10 kg × 8 · 10 kg × 8 · 9 kg × 8`. A collapsed "Earlier" line shows the two sessions before it; tapping opens History. First-time state: "First time — log your opening set below."
3. **Today card**: sets logged today (workout-day rule), in order, each tappable to edit.
4. **Entry controls**:
   - Weight row: `[−2.5] [−0.5] [ 10 ] [+0.5] [+2.5]`; centre value opens the decimal keypad (`inputmode="decimal"`). Coarse step configurable (§6.6).
   - Reps row: `[−1] [ 8 ] [+1]`; centre opens numeric keypad.
   - **Pre-fill**: first set of the day pre-fills from the previous session's *first* set; each save re-fills with the values just saved.
   - **"Save set"** (primary, full width, ≥ 56 px): saves and stays, values retained; brief "Saved ✓ · set 2" via `aria-live`. The button (and every other save path) is disabled while a write is pending — this is the only duplicate guard; identical values are always legal (normal in training).
   - **"↻ Same as last time"** (secondary): with *n* sets logged today, logs the previous session's set *n+1*; past its end, its last set. The label always shows the exact pending values ("↻ 10 kg × 8"). Hidden when no previous session exists. *n* recounts after any save, quick-add, edit or delete. Examples: previous session `10×8, 10×8, 9×8`; today empty → button reads `↻ 10 kg × 8`; after two saves of any kind → `↻ 9 kg × 8`; after a third → stays `↻ 9 kg × 8` (last set rule); deleting one of today's sets moves it back.
5. **Quick-entry field** (directly beneath the entry controls, not bottom-most): single-line input, placeholder *"e.g. 2x8 @ 10kg, then 8 @ 9kg"*. Typed or dictated via the iOS keyboard mic. On focus the app scrolls the field just above the keyboard. Submit (keyboard "done" or the field's ➜ button) parses and shows **preview chips** (`10 kg × 8` ×2, `9 kg × 8`) with one **"Add 3 sets"** confirm; unparseable input highlights the failing fragment with the reason and saves nothing (all-or-nothing). Draft text survives in-app navigation but not app termination. Batch save: one transaction; timestamps `now + i` ms preserve order (§8.2).

### 6.3 History — `#/history/<exerciseId>`
- Reverse-chronological, grouped by stored `workoutDay`. Day header: "Tue 15 Jul 2026 — 3 sets · top 10 kg".
- Set row: time (derived from `performedAtMs`), `weight × reps`. Tap → edit sheet: weight, reps, date-time (`datetime-local`). Validation = entry rules + timestamps more than 10 min in the future rejected. Timestamp semantics on edit are defined in §11.1; saving an edit recomputes `workoutDay` and the sheet shows the day it will move to when it changes.
- Delete: one confirm, then a 6-second **Undo** toast. Honest guarantee: the delete commits immediately; Undo re-inserts the identical record (same id); if the app terminates within the window, the deletion stands (§12).
- Each day header links to that date's day overview (§6.7).

### 6.7 Day overview — `#/day/<YYYY-MM-DD>` (added at the owner checkpoint, D3)
- Entry points: "today" icon in the Home header (opens today's workout day) and the day headers in History.
- Header: `‹` previous day · date label ("Today", "Yesterday", else "Tue 15 Jul") · `›` next day (disabled beyond today). Days are workout days (D1 rule), consistent with everything else.
- Summary line: **"3 exercises · 9 sets · 52 min"** — duration per §11.2 (last set − first set); "—" when the day has fewer than 2 sets.
- Body: one card per exercise, ordered by each exercise's first set that day; each card lists its sets in order (time · `weight × reps`). Tapping a set opens the §6.3 edit sheet (same component; edits reflect everywhere immediately).
- Empty state (rest day): "No sets on this day."
- Implementation note: reads the existing `byDay` index; introduces no new data-model concepts. (Numbered 6.7 to keep pre-review section numbering stable across documents.)

### 6.4 Dashboard — `#/dashboard`
- Exercise selector (MRU order) + period: **8 weeks / 6 months / All** (default 8 weeks).
- **Chart mode is data-driven per exercise** (no classification field):
  - Every recorded set has `weightKg = 0` (all-time) → **reps mode**: chart of max reps per workout day; e1RM hidden.
  - Any set has `weightKg > 0` → **weight mode**: chart 1 = top-set weight per workout day (day value = max `weightKg` that day; a day with only 0-weight sets plots 0 added kg — honest for weighted-calisthenics progressions); chart 2 = best Epley e1RM per day over sets with `weightKg > 0` and `reps ≤ 12`.
- **PR card**: heaviest weight ever + date (weight mode); best e1RM + date (weight mode); most reps in a single set + date (shown whenever the exercise has any 0-weight sets).
- **Consistency line**: "9 workouts in the last 4 weeks" (distinct workout days, any exercise, trailing 28 days).
- Empty states: no data → "Log your first set to see progress"; single session → the point plus "come back after your next workout". Never a broken chart.

### 6.5 Manage exercises — `#/manage`
- List with **▲▼ move buttons** per row (chosen over drag: simpler and keyboard/VoiceOver-accessible). A move swaps positions and rewrites `sortOrder` 0…n−1 for all active exercises in one transaction; a new exercise gets `max + 1`.
- Row ⋯ menu: **Rename** (uniqueness-checked, trimmed, case-insensitive), **Archive** (safe default, reversible), **Delete permanently** (two-step confirm stating "This deletes N logged sets forever", Archive offered first; deletion removes the exercise and all its sets in one transaction).
- "Show archived" toggle → **Unarchive** / **Delete permanently**. Unarchiving into a name now used by an active exercise prompts an inline rename with suggested suffix ("Bench press (2)") — unarchive completes only with a valid unique name.
- Add exercise (same as Home).

### 6.6 Settings — `#/settings`
- Coarse weight increment: 1 / 2 / 2.5 / 5 (default 2.5).
- Exercise sort: recent (default) / my order.
- **Backup**: "Export backup" (share sheet → Files/iCloud; fallback `<a download>`), "Import backup" (§16), last-export date.
- Storage: persistent-storage status (granted / not granted / unsupported — informational, best-effort per §9) and entry counts; "N unreadable entries" appears only when > 0 (§12).
- About: version, link to instructions.

## 7. Fast-logging interaction flow

**Tap-counting convention**: every discrete touch counts (taps on buttons, fields, keyboard "done"), except the keystrokes/speech of typing or dictating content itself. Counts below are design estimates; the acceptance numbers are measured on the owner's iPhone (§17.3, §19.2).

Repeat scenario — 3 sets identical to last week:

| Step | Action | Taps |
|------|--------|------|
| 1 | Open app (Home, MRU list) | 0 |
| 2 | Tap the exercise (near top) | 1 |
| 3 | Previous session visible; values pre-filled | 0 |
| 4–6 | Tap "↻ Same as last time" ×3 | 3 |
| | **Total** | **4** |

Progressive overload (+2.5 kg on 3 straight sets): tap `+2.5`, "Save set" ×3 → 4 taps. Dictated sentence ("two sets of eight at ten kilo, then eight at nine"): focus field (1) → mic key (1) → speak → keyboard done (1) → "Add 3 sets" (1) → **4 taps + speech**. Acceptance bounds: **≤ 5 taps** for the repeat scenario, **≤ 5 taps + dictation** for the sentence flow, measured on device.

## 8. Data model and field definitions

All persisted objects are plain JSON-serialisable dictionaries. All timestamps are **epoch milliseconds** (A12).

### 8.1 `Exercise`
| Field | Type | Constraints |
|-------|------|-------------|
| `id` | string | UUID v4 (`platform.uuid()`), immutable |
| `name` | string | 1–60 chars trimmed; unique case-insensitive among non-archived |
| `sortOrder` | number | integer ≥ 0; contiguous 0…n−1 across active exercises, rewritten on reorder |
| `archivedAtMs` | number \| null | null = active |
| `createdAtMs` | number | |
| `updatedAtMs` | number | bumped on any change |

### 8.2 `SetEntry`
| Field | Type | Constraints |
|-------|------|-------------|
| `id` | string | UUID v4 |
| `exerciseId` | string | must reference an existing Exercise — verified *inside the same readwrite transaction* (spanning `exercises` + `sets`) that inserts or edits the set; abort if missing |
| `weightKg` | number | 0 ≤ w ≤ 999, max 2 decimals, finite |
| `reps` | number | integer, 1 ≤ r ≤ 200 |
| `performedAtMs` | number | canonical chronology; editable; rejected if > now + 10 min |
| `tzOffsetMin` | number | minutes east of UTC captured per set at save; on a timestamp edit it is re-derived per §11.1; untouched when only weight/reps are edited |
| `workoutDay` | string | `"YYYY-MM-DD"`, **derived and stored** at save/edit via §11.1; never computed at query time |
| `createdAtMs` | number | never edited |
| `updatedAtMs` | number | bumped on edit |

**Ordering rule (used everywhere)**: sort by `performedAtMs`, tie-break `createdAtMs`, then `id` (lexicographic). Quick-entry batches stamp `performedAtMs = now + index` (0, 1, 2 … ms apart) so entry order is deterministic.

### 8.3 `Settings` (singleton, id `"app"`)
| Field | Type | Default |
|-------|------|---------|
| `id` | `"app"` | |
| `coarseIncrementKg` | number (1 \| 2 \| 2.5 \| 5) | 2.5 |
| `exerciseSort` | `"recent"` \| `"manual"` | `"recent"` |
| `lastExportAtMs` | number \| null | null |
| `lastDataChangeAtMs` | number \| null | null (drives the backup banner) |
| `backupBannerSnoozedAtMs` | number \| null | null (7-day snooze) |

Schema version is **not** stored here — the IndexedDB database version is the single authority (§10).

### 8.4 Quick-entry grammar (parser spec)

**Tokenization precedence (in order):** (0) rewrite every comma that sits *directly between two digits* to a dot (`22,5` → `22.5`) — this happens before anything else, so decimal commas never collide with segment splitting; (1) map number words `one`…`twelve` / `een`…`twaalf` to digits (dictation emits words); (2) split into segments on remaining `,`, `;`, newline and the words `then` / `and` / `en` / `daarna`; (3) match each segment against the pattern table. Documented limitation: `10,1x8` with no space after the comma reads as the decimal `10.1`; separating two digit-led segments requires comma + space (`10, 1x8`), which is what both typing and iOS dictation produce. Case-insensitive; `W` accepts `10`, `22.5`, `22,5`; unit words `kg`/`kilo`/`kilos` optional; noise words (`I did`, `sets`, `set`, `reps`, `rep`, `of`, `at`, `deed`, `keer`, spacing variants of `x8`) tolerated.

| Pattern | Example | Result |
|---------|---------|--------|
| `N x R @ W` / `N sets of R at W` | `2x8 @ 10kg`, `2 sets of 8 at 10` | N sets of R reps at W |
| `R @ W` / `R reps at W` | `8 @ 9kg` | 1 set |
| `W x R` (unit required on W) | `10kg x 8` | 1 set |
| `R` (bare reps) | `8` | 1 set at the last weight mentioned earlier in the same input, else the pre-filled weight |
| `bw x R` / `bodyweight x R` | `bw x 12` | 1 set at weight 0 |

Ambiguity rule: unit-less `A x B` is `sets × reps` only when A ≤ 6; otherwise the segment is rejected with *"add kg or @ to make this unambiguous"* (so `10 x 8` never silently means 10 sets or 10 kg). Limits: N ≤ 20 per segment, ≤ 30 sets per submission. All-or-nothing: any bad segment → nothing saved, fragment + reason highlighted. Returns `{sets: [{weightKg, reps}…], errors: [{fragment, reason}…]}`; never throws. The grammar is a data table (pattern → extractor), so future patterns are new rows + tests.

## 9. Local persistence strategy

- **IndexedDB**, database `gym-tracker`, `DB_VERSION` = schema version (§10).
  - `exercises` (keyPath `id`)
  - `sets` (keyPath `id`), indexes: `byExercise` (`exerciseId`), `byExerciseDay` (`[exerciseId, workoutDay]`), `byDay` (`workoutDay`)
  - `settings` (keyPath `id`)
- Why IndexedDB over localStorage: transactional, indexed queries, larger quota, async (no jank).
- Typical queries: previous session = cursor on `byExerciseDay` from today's key backwards; history = same index forwards; dashboard = range over `byExerciseDay`; consistency = distinct keys on `byDay`.
- `navigator.storage.persist()` is requested after the first successful save — **best-effort**: capability-detected, denial or absence changes nothing except the Settings status line. The backup feature (§16) is the real safety net; known loss cases (user clears Safari data, uninstall) are documented in the README.
- Volume: ~12k sets in 5 years (< 3 MB). No pagination needed.

## 10. Data migration and schema-versioning strategy

**Authoritative version**: the IndexedDB database version (`DB_VERSION` constant in `db.js`). No mirror copies. Export files stamp `schemaVersion: DB_VERSION` at export time. **v1 ships with `DB_VERSION = 1` and an empty migrations table** — no invented history; supported import versions are `1 … DB_VERSION`.

**Migration step shape** (in `db.js`; illustrative — the v1 table is empty):

```js
// migrations[k] upgrades version k → k+1
const migrations = {
  1: {
    structural(db, tx) { /* createObjectStore / createIndex / deleteIndex */ },
    records: { sets: (r) => ({ ...r, newField: default }) }  // pure per-record fns, or omit
  }
};
```

**Upgrade protocol**: `indexedDB.open('gym-tracker', DB_VERSION)`; in `onupgradeneeded` with `oldVersion = e.oldVersion`: for each `k` from `oldVersion` to `DB_VERSION − 1`, run `migrations[k].structural(db, tx)` then, for each store in `migrations[k].records`, iterate that store with a cursor inside the same upgrade transaction and `cursor.update(fn(record))` (delete on `null`). Everything happens inside the one upgrade transaction IndexedDB provides — **atomic**: any thrown error aborts it, the DB stays at `oldVersion` intact, and the app shows the recovery view (§12) offering retry (next launch re-attempts) and export-via-import instructions. Fresh install (`oldVersion === 0`): create current structure directly, no migrations, seed default settings.

**Import path reuses the record functions**: importing a backup with `schemaVersion s < DB_VERSION` applies `migrations[s..DB_VERSION−1].records` to the staged JSON before insertion (structural steps are meaningless for plain JSON; when a structural change implies a data change, the migration must express it in `records`). Files with `schemaVersion > DB_VERSION` are refused: "This backup comes from a newer app version — open the app once while online to update, then retry."

**Connection protocol (enforced, not assumed)**: every successful open registers `db.onversionchange` → immediately `close()` and show a full-screen "App updated in another tab — Reload" overlay (no further writes possible from stale code). `indexedDB.open()`'s `onblocked` shows a plain-language "Close other tabs/windows of this app, then Retry" view. Combined with shipping app code, `DB_VERSION` and the SW cache version together in one commit, this protocol — not wishful ordering — is what prevents stale code from writing to a newer schema (§14). Two-tab upgrade behaviour is browser scenario B7 (§17.0).

**Tests**: v1 covers the machinery via fresh-bootstrap-at-v1 and newer-version-refusal tests. Every future migration must add (a) a pure `records` fixture test and (b) a DB-level test opening a version-k fixture database and asserting the upgraded result (`fake-indexeddb` supports upgrade transactions) — recorded as a hard rule in `docs/MAINTENANCE.md`.

## 11. Dashboard metrics and formulas

### 11.1 Workout-day grouping (D1: 03:00 approved)
`workoutDay(performedAtMs, tzOffsetMin) = utcDateString(performedAtMs + tzOffsetMin·60000 − 3·3600000)` — i.e. take the set's *local wall-clock* moment, shift back 3 h, take the date. Stored on the record at save/edit (§8.2); grouping never shifts retroactively when the phone travels or DST changes, because the offset is captured per set. If the owner picks calendar-day at D1, the `− 3·3600000` term is dropped; nothing else changes.

**Timestamp edits (exact semantics)**: the `datetime-local` value chosen in the edit sheet is interpreted in the phone's *current* timezone rules for that date — `new Date(y, m, d, h, min)` — giving the new `performedAtMs`, and `tzOffsetMin` is re-derived from that same Date (`-getTimezoneOffset()`). DST gap times roll forward and fold times resolve to the first occurrence (standard JS engine behaviour — accepted). An edit that changes only weight/reps leaves `performedAtMs` and `tzOffsetMin` untouched. `workoutDay` is recomputed on every timestamp edit and the sheet shows the resulting day before saving, so travel/DST day-shifts are always visible.

### 11.2 Metrics (deliberately minimal)
| Metric | Definition |
|--------|-----------|
| Top-set weight (weight-mode chart) | per workout day: `max(weightKg)` over that exercise's sets that day |
| Best e1RM (weight-mode chart) | per workout day: `max(weightKg × (1 + reps/30))` over sets with `weightKg > 0` and `reps ≤ 12` (Epley; unreliable at high reps) |
| Max reps (reps-mode chart) | per workout day: `max(reps)` |
| PRs | heaviest `weightKg` + date; best e1RM + date; most reps in one set + date (§6.4 rules for which appear) |
| Consistency | distinct `workoutDay` values (any exercise) in the trailing 28 days |
| Day duration (§6.7 only) | `max(performedAtMs) − min(performedAtMs)` over one workout day's sets (all exercises), rendered in minutes; "—" with fewer than 2 sets. Approximate by design: excludes time before the first and after the last set |

Chart-mode selection is defined in §6.4. Total volume (weight×reps) and period comparisons are deliberately excluded from v1 (§22) — no dead computation ships.

### 11.3 Chart rendering
One shared SVG line-chart helper (~80 lines): time-scaled x (workout days), y with ≤ 3 labelled gridlines, points + polyline, last point labelled. Single-point periods render the point + explanatory text.

## 12. Error handling

| Situation | Behaviour |
|-----------|-----------|
| Invalid manual input (weight > 999, reps 0, non-numeric, > 2 decimals) | Inline message; Save disabled until fixed. Comma decimals normalised, never rejected. |
| Edited timestamp > now + 10 min | Rejected inline ("time is in the future"). |
| Quick-entry parse failure | Failing fragment + reason shown; nothing saved. |
| Double-tap on any save path | All save paths disable while a write is pending; no value-based duplicate prompts (identical sets are normal training data). |
| IndexedDB transient open failure | Full-screen recovery view in plain language: Retry, and Import-backup guidance. App never white-screens. |
| DB open `onblocked` (another tab holds an old connection) | "Close other tabs/windows of this app, then Retry" view (§10 protocol). |
| App upgraded in another tab (`versionchange` fires) | Connection closes immediately; full-screen "App updated — Reload" overlay; no further writes from stale code (§10). |
| Migration failure | Upgrade transaction aborts atomically → DB intact at old version; recovery view explains, offers Retry (next launch re-attempts) and restore guidance. |
| DB repeatedly unopenable (irrecoverable corruption) | Guided **"Reset app storage"**: prompts the owner to locate a backup file first, then requires typing a confirmation phrase acknowledging all local data will be erased, then `indexedDB.deleteDatabase` → recreate fresh → import backup. Never offered as a first resort. |
| Write failure mid-save | Each mutation = one IDB transaction; on abort the entered values stay on screen + "Couldn't save — try again". |
| Malformed record encountered on read | Excluded from queries; never modified or deleted in the DB; exported into the separate `unreadable` array (§16) so good data always round-trips and corrupt blobs stay inspectable in the file. Settings shows "N unreadable entries". |
| Deleting a set | One confirm + 6 s Undo toast. Delete commits immediately; Undo re-inserts the same record (same id). App termination within the window → deletion stands (documented, deliberate simplicity). |
| Deleting an exercise with history | Two-step confirm naming the exact set count; Archive offered first; cascade delete is one transaction (§6.5). |
| Import | Full validation before any write; §16. |
| Route to missing/archived exercise | Redirect `#/` + toast ("That exercise is archived/was deleted"). |
| Stale in-memory cache (backgrounding, rare second tab) | Store reloads from DB on `visibilitychange`/`focus`; last-writer-wins. |
| Unsaved quick-entry draft | Survives in-app navigation; lost on termination (documented). |
| Clock set backwards | No special handling; ordering follows stored `performedAtMs`. |

## 13. Accessibility considerations

- Tap targets ≥ 44×44 px; primary actions ≥ 56 px tall, bottom half of screen for one-handed reach.
- Reorder via ▲▼ buttons — fully keyboard/VoiceOver-accessible (no drag gestures anywhere).
- Text in `rem`; layout tolerates 200 % zoom without loss of function.
- WCAG AA contrast; no colour-only signals (PR ★ icon, error text).
- Semantic HTML; labels tied to inputs; `aria-live="polite"` for save confirmations; VoiceOver-sensible ordering.
- `prefers-color-scheme` dark mode; `prefers-reduced-motion` respected.
- `inputmode="decimal"` / `"numeric"` for the right iOS keypads.

## 14. Offline behaviour

- **Precache manifest**: an explicit `PRECACHE` array in `sw.js` listing every shell file (HTML, CSS, JS modules, icons, manifest). An automated node script (`npm run check:precache`) fails CI when the list and the files on disk diverge.
- **Install**: `cache.addAll(PRECACHE)` into cache `gt-<version>` — atomic; any missing file fails installation and the previous SW keeps serving.
- **Activate**: delete all caches except `gt-<version>`; `clients.claim()`.
- **Fetch**: same-origin GET → cache-first with network fallback; navigation requests → cached `index.html` (SPA fallback). Nothing else is ever requested (§15 CSP enforces this).
- **Update flow**: new `sw.js` detected → waiting worker → toast "Update available — Restart" → `skipWaiting()` → one reload on `controllerchange` (guard flag prevents loops). No silent mid-session swaps.
- **Version coordination**: app code, `DB_VERSION`, SW cache version ship together; DB upgrades run at boot of the new code, and the §10 connection protocol (`versionchange` close + reload overlay, `onblocked` view) is what *enforces* that stale code never writes to a newer schema — it is a protocol, not an assumption.
- After the first online visit the app is fully functional in airplane mode: logging, history, dashboard, export.

## 15. Privacy and security considerations

- All workout data stays on the device. No transmission, analytics, third-party requests or cookies. The only network use is fetching the app's own static files.
- **CSP** (meta tag): `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; manifest-src 'self'; worker-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'`. Verified on the deployed site during the device pass (§17.2). (`frame-ancestors` can't be set via meta — accepted, nothing sensitive is served.)
- XSS: exercise names are the only user text rendered; rendering uses `textContent` exclusively; no `innerHTML` with user data.
- Import is untrusted input: 10 MB size cap, record-count caps and full schema validation before any write (§16).
- Repository hygiene: public repo contains only code; `package-lock.json` committed (pinned dev deps); `.gitignore` covers `node_modules`, OS cruft; no secrets exist by design. README documents: enable GitHub 2FA, protect `main` (deploy branch = app integrity).
- Backups are plain unencrypted JSON containing health-adjacent data — README tells the owner to store them like personal documents (iCloud Files is fine). Encrypted backup: v2 candidate (§21).

## 16. Backup, export and recovery options

- **Export** (`backup.js`): `gym-tracker-backup-YYYY-MM-DD.json`:
  ```json
  { "app": "gym-tracker", "schemaVersion": 1, "exportedAtMs": 1789000000000,
    "exercises": [...], "sets": [...], "settings": {...}, "unreadable": [] }
  ```
  Schema-valid records go in the normal arrays; malformed raw records go untouched into `unreadable` (so good data always round-trips and corrupt blobs remain inspectable in the file). Web Share API → Files/iCloud, `<a download>` fallback. Updates `lastExportAtMs`.
- **Import validation** (all on staged JSON, before any write, **in this order** — migrate first, validate the result):
  1. Envelope: file ≤ 10 MB; parses as JSON; `app === "gym-tracker"`; `schemaVersion` integer ≥ 1; `> DB_VERSION` → refuse (§10 message); `exercises` ≤ 500, `sets` ≤ 200 000.
  2. Coarse structure: `exercises`/`sets` are arrays of objects; `settings` is an object.
  3. Older `schemaVersion` → run the §10 migration record-functions to bring records to the current shape.
  4. Full current-schema validation **on the migrated result**: §8 types/ranges, finite numbers, string caps, unknown fields dropped; `id` uniqueness within each store; every `sets.exerciseId` resolves; no duplicate active names (violations refused with the offending values listed).
  5. Settings normalised to §8.3 (missing → defaults).
  6. `unreadable` entries are **never inserted**; if present, the preview states "N unreadable entries stay in the backup file and won't be restored".
- **Preview + safety copy**: "Backup from 12 Jul: 14 exercises, 1 240 sets — replaces current data (9 exercises, 800 sets)". Before replacing, the app performs an automatic safety export of current data; if that fails or is declined, the import proceeds only after an explicit "Replace without a safety copy" confirmation.
- **Replace**: one readwrite transaction over all three stores: clear + insert everything. Abort (quota, crash) → IndexedDB rolls back, old data intact. Merge-import is out of scope v1 (§22).
- **Recovery paths**: DB unreadable → follow the §12 recovery matrix exactly (transient → Retry; repeatedly unopenable → locate backup → confirmed reset/delete → recreate database → import backup — import always needs a writable, freshly created DB). New phone → install PWA → import from iCloud Files. Backup banner on Home after 30 days of unexported changes (§6.1).

## 17. Testing strategy

### 17.0 Test levels
| Level | Tooling | Carries |
|-------|---------|---------|
| Unit (bulk) | Vitest + fake-indexeddb | All logic: parser, stats, store, db/migrations, backup validation |
| Browser smoke | Playwright (WebKit), local static server | Wiring truth: routing, DOM events, persistence across reload, offline reload |
| Device (manual, scripted) | Owner's iPhone, `docs/TESTING.md` scripts | Safari/PWA truth: install, dictation, share sheet, airplane mode, CSP, update toast, VoiceOver |

**Minimum browser suite (grown per phase, §18; all run in CI):**
- B1 app loads; every route renders and back-navigates (Phase 0)
- B2 add exercise → appears on Home (Phase 2)
- B3 log a set via steppers → survives page reload (Phase 3)
- B4 quick-entry canonical sentence → 3 preview chips → 3 sets saved (Phase 4)
- B5 edit a set; delete a set; Undo restores it; after expiry it is permanently gone (Phase 5)
- B6 offline reload: page served from SW cache with network disabled (Phase 8)
- B7 two tabs, DB version bump → stale tab shows the reload overlay, no writes (Phase 8)
- B8 day overview shows the sets of two different exercises logged today, with the summary line (Phase 5)

### 17.1 Unit suites
| Suite | Covers |
|-------|--------|
| `parser.test.js` | every §8.4 pattern; decimal comma incl. the **mixed decimal-comma/multi-segment fixture** (`8 @ 22,5kg, then 8 @ 20` → exactly 2 sets); EN+NL number words; the canonical dictated sentence; ambiguity rule (`10 x 8` rejected, `2 x 8` accepted); segment/batch limits; garbage; empty |
| `stats.test.js` | top-set ties; Epley incl. decimals; reps > 12 and weight-0 exclusions; reps-mode day values; workout-day boundary (23:59 / 00:30 / 03:01, DST change, offset travel); consistency; day duration incl. single-set "—" case; day-overview grouping/ordering fixture (§6.7); empty data |
| `store.test.js` | exercise CRUD; duplicate-name rule (case/trim); unarchive-conflict; sortOrder rewrite on move; cascade delete (exercise + sets, one transaction); set CRUD; ordering rule incl. identical `performedAtMs`; previous-session query (excludes today); MRU; FK-inside-transaction (delete-vs-save race with two store instances); future-timestamp rejection; workoutDay + tzOffset recompute on timestamp edit only |
| `db.test.js` | open/bootstrap at `DB_VERSION = 1`; round-trip; upgrade-failure atomicity; malformed-record exclusion-but-retention; injected recovery states (transient failure → retry path, repeated failure → reset path reachable) |
| `backup.test.js` | export → wipe → import → deep-equal; §16 order proven by a **synthetic migration-harness test** (a test-only, non-shipped migration step + fixture missing the field it adds — demonstrates migrate-then-validate without inventing a historical version; v1 ships no real migrations per §10); every validation rule rejects with no writes; newer refused; corrupt-export round-trip (`unreadable` carried in file, never inserted); injected failure mid-replace rolls back; caps enforced |

Parser, stats, migrations, backup validation: ~100 % branch coverage (pure and cheap). Store/db: every public function.

### 17.2 Device script (each release)
Add to Home Screen; standalone launch; airplane-mode full workflow; dictation into quick entry; share-sheet export to Files; import round-trip; force-quit persistence; storage-persist status; dark mode; update toast on a real deploy → reload lands on the new version; CSP check (no console violations, no external requests in Web Inspector); accessibility gates: VoiceOver walkthrough of the full log flow, 200 % zoom usability, contrast spot-check.

### 17.3 Manual E2E of the primary workflow
The 8-step flow (REQUIREMENTS §5) on the owner's iPhone, **counting taps** per the §7 convention; results recorded in `docs/TESTING.md` per release and gated by §19.2.

## 18. Detailed implementation phases

> **Phase gate — satisfied 2026-07-19:** Codex rounds 1–2 + capped verification complete, `PROJECT_PLAN_FINAL.md` matches this document, and the owner approved the plan and scope with amendments D1–D4 (recorded in `docs/DECISIONS.md`). Implementation may begin.

Each phase ends with: tests green, app runnable, `docs/PROGRESS.md` updated, git commit(s).

| Phase | Scope | Exit criteria |
|-------|-------|---------------|
| 0 | Repo scaffold: structure (§23), `index.html` shell + CSP, CSS theme, hash router with empty screens, manifest, icons, basic SW, GitHub Pages live, Vitest + Playwright wired (B1 passing), `check:precache` script, CI running all of it | Installs to home screen; navigates; offline after first load; CI green |
| 1 | Data layer: `platform.js`, `db.js` (open/bootstrap/migration machinery), `store.js` (validation, queries, ordering), fixtures | `store/db` suites green incl. upgrade + atomicity tests |
| 2 | Exercise management: Home list, empty state (+ chips if D2), Manage (add/rename/archive/unarchive-with-conflict/delete-cascade/▲▼ reorder), MRU + manual sort | §19.1 demonstrable; suites + B2 green |
| 3 | Logging core: Log screen — last-time & Today cards, steppers, pre-fill, Save set, ↻ button with full §6.2 semantics, write-pending guard | §19.2 functional criteria verified in browser (+ B3); **numeric tap bounds are measured only at the Phase 9 device gate** |
| 4 | Quick entry: `parser.js` test-first; input UI, preview chips, batch transaction | parser suite + B4 green; dictation works on device |
| 5 | History & editing + day overview: day grouping, edit sheet (incl. day-move display), delete + Undo, `ui/day.js` (§6.7) | §19.3 + §19.7 (+ B5, B8) |
| 6 | Dashboard: `stats.js` test-first; SVG helper; charts + PR card + consistency; period selector; empty states | §19.4 |
| 7 | Backup & settings: `backup.js` export/import with §16 validation + safety copy; settings screen; persist request; backup banner | §19.5; export→wipe→import verified on device |
| 8 | Offline & polish: versioned SW + update toast, recovery views (§12 matrix), B6 + B7, a11y pass, dark mode, README + `MAINTENANCE.md` | §17.2 device script fully green; full browser suite green |
| 9 | Acceptance: §17.3 E2E with measured taps; docs sync (PROGRESS, TESTING, DECISIONS); §25 checklist | All bounds met → owner sign-off (gate, not a task) |

Sequencing: data layer before UI; parser and stats test-first as pure modules; backup before polish so the safety net exists before real gym use.

## 19. Acceptance criteria per core feature

### 19.1 Exercise management
- Add: appears immediately; empty/duplicate names (case-insensitive, trimmed) rejected with a message.
- Rename: history/dashboard unchanged except the label.
- Archive: leaves Home and dashboard picker; sets retained; unarchive restores; unarchive into a conflict forces a rename first.
- Delete with history: two-step confirm naming set count; exercise and sets gone everywhere afterwards.
- Reorder: ▲▼ persists across restarts; "my order" respects it.

### 19.2 Logging
- Selecting an exercise shows the previous session's sets + date with zero further taps.
- Pre-fill: previous session's first set; after a save, the saved values.
- **Measured on device**: 3 repeat sets ≤ 5 taps from app open; dictated sentence flow ≤ 5 taps + dictation.
- ↻ follows the §6.2 n+1/last-set/label rules exactly (worked examples are the test cases).
- The canonical sentence parses to exactly 3 correct pending sets; saved only on confirm.
- A saved set appears in Today immediately and survives force-quit relaunch.
- Weight 0 and comma/dot decimals save correctly.

### 19.3 History
- Grouped by stored `workoutDay` (D1 rule); sessions visually separated.
- An edit changes exactly that set everywhere; timestamp edits move the set to the correct day (per §11.1 semantics) and the sheet showed it.
- Undo within 6 s restores the identical record (same id); after the window expires the record is permanently gone (browser-tested, B5).

### 19.4 Dashboard
- Charts match hand-computed fixtures (same fixtures as unit tests).
- Chart-mode selection is data-driven per §6.4; e1RM exclusions hold; PR card correct incl. dates.
- Empty/single-point states render as specified; never a broken chart.

### 19.5 Backup
- Export → wipe → import reproduces all data (deep-equal modulo `lastExportAtMs`).
- Every §16 validation failure changes nothing and explains why.
- A failed *or* declined automatic safety copy blocks the import until the explicit "Replace without a safety copy" confirmation (unit-tested with an injected export failure).
- A backup containing `unreadable` entries imports its valid data and reports the skipped count.

### 19.6 Offline & install
- After one online visit: full functionality in airplane mode.
- Add to Home Screen yields a standalone app with icon and name.
- Data survives force-quit and restart; persistence request made (best-effort) and status visible in Settings.
- A new deploy produces the update toast and the reload runs the new version (device-tested, §17.2); a stale tab during an upgrade shows the reload overlay and cannot write (B7).

### 19.7 Day overview
- Shows every set of the selected workout day across all exercises, grouped by exercise in first-set order (fixture-tested; B8 in browser).
- Summary line: exercise count, set count, duration per §11.2; "—" on days with < 2 sets.
- `‹`/`›` navigate between days; future days unreachable; rest days show the empty state.
- An edit made from the day view is identical in effect to one made from History.

## 20. Risks, edge cases and mitigations

### 20.1 Required edge cases
| Edge case | Handling |
|-----------|----------|
| Decimal weights | ≤ 2 decimals; `.` and `,` (§3 A7, §8.2; tests) |
| Zero-weight / bodyweight | weight 0 valid; data-driven chart modes (§6.4); `bw` token (§8.4) |
| Duplicate exercise names | blocked among active (case/trim); archived reusable; unarchive-conflict rename (§6.5) |
| Accidental duplicate entries | write-pending guard only; identical sets always legal; fix = tap-delete + Undo (§12) |
| Editing historical entries | edit sheet incl. timestamp; `workoutDay` recomputed and shown; future times rejected (§6.3) |
| Deleting/archiving with history | archive default; typed two-step delete with set count; transactional cascade (§6.5) |
| Changing units | out of scope; kg canonical → display-layer conversion later, no migration (§21) |
| Missing/corrupted data | recovery view; malformed records excluded-but-retained and always exported (§12, §16) |
| Schema changes | §10 protocol; atomic upgrade; import shares record-functions; per-migration tests |
| Sessions crossing midnight | 03:00 boundary (D1) via stored `workoutDay` (§11.1) |
| Identical sets | normal; deterministic ordering rule (§8.2) |
| Long gap | relative date on Last-time card; MRU resurfaces on use |
| Empty dashboard | dedicated states (§6.4, §19.4) |

### 20.2 Top risks
| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| iOS evicts site data / user clears Safari data | Low-medium | best-effort persist; installed PWA; Home backup banner; easy restore |
| Parser misreads mixed Dutch/English dictation | Medium | conservative all-or-nothing + preview; ambiguity rejection; test corpus grows with real phrases |
| Scope creep during build | Medium | §22 list; owner approval required for any addition |
| SW serves stale app | Medium | versioned cache, explicit update toast, `check:precache` in CI, README cache-bust recipe |
| Playwright WebKit ≠ real Safari | Low | device script (§17.2) is the Safari authority; Playwright only guards wiring regressions |
| Owner maintenance overwhelm | Low | zero deps, `MAINTENANCE.md` recipes, module API headers |

## 21. Future-extension points

Designed-in seams (no extra v1 work): kg stored canonically → units display layer; nullable fields via §10 migrations (e.g. `notes`); parser grammar table → new patterns as rows; export format doubles as hand-off to a future native app; `platform.js` isolates every browser API a wrapper (e.g. Capacitor) would replace; SW versioning supports adding encrypted backup later.

Candidate v2+ features (owner approval each; Appendix A): rest timer, templates, notes, plate calculator, volume/comparison charts, encrypted backup, unilateral tracking, PR celebration, configurable metrics.

## 22. Features deliberately excluded from v1

Accounts/login; cloud sync; exercise catalogue; rest timer; templates; supersets; per-side logging; RPE; body-weight tracking; Apple Health/widgets/Watch/Siri; push notifications; social features; AI features (parser is deterministic); volume and comparison charts; lbs display; CSV export; merge-import; drag-and-drop reorder; haptics (unsupported in iOS Safari anyway); in-app speech recognition (keyboard dictation covers it); Fitbit/Google account integrations incl. calorie import (D4 — see Appendix A; day duration is derived locally instead). *(The cross-exercise day overview, excluded pre-checkpoint, re-entered scope as §6.7 at the owner's request — D3.)*

## 23. Proposed folder and file structure

```
gym-tracker/                  (dedicated GitHub repo)
├── index.html                app shell, CSP meta, screen containers
├── manifest.webmanifest      name, icons, standalone display
├── sw.js                     PRECACHE list + versioned cache logic (§14)
├── css/style.css             theme (light/dark), components, screens
├── js/
│   ├── app.js                bootstrap, hash router, screen mounting, update toast
│   ├── platform.js           clock/uuid/share/persist/online adapters (§5 A11)
│   ├── db.js                 IDB open, DB_VERSION, migrations, CRUD
│   ├── store.js              validation + app-facing data API (no DOM)
│   ├── parser.js             quick-entry grammar (pure)
│   ├── stats.js              workoutDay fn, metrics (pure)
│   ├── backup.js             export/import + §16 validation
│   └── ui/
│       ├── home.js  log.js  history.js  day.js  dashboard.js  manage.js  settings.js
│       └── components.js     toast, confirm sheet, undo, svg line chart
├── icons/                    192/512/180 PNGs
├── tests/
│   ├── parser.test.js  stats.test.js  store.test.js  db.test.js  backup.test.js
│   ├── fixtures/             seeded datasets, version-fixture DBs, old backups
│   └── browser/smoke.spec.js Playwright (§17.0)
├── scripts/check-precache.mjs
├── docs/                     REQUIREMENTS, PROJECT_PLAN, PROJECT_PLAN_FINAL,
│   │                         DECISIONS, PROGRESS, TESTING, MAINTENANCE
│   └── reviews/              CODEX_/CLAUDE_ round documents
├── package.json              devDeps: vitest, fake-indexeddb, @playwright/test
├── package-lock.json         committed (pinned dev deps)
├── .gitignore                node_modules, .DS_Store, playwright artefacts
└── README.md                 what/why, iPhone install guide, dev guide, data-safety notes
```

## 24. Development, build and installation instructions

- **Run locally**: `python3 -m http.server 8000` (or `npx serve`) in the repo root → `http://localhost:8000`. No build step ever.
- **Tests**: `npm install` once; `npm test` (Vitest); `npm run test:browser` (Playwright smoke; `npx playwright install webkit` once); `npm run check:precache`.
- **CI**: one GitHub Action on push: `npm test` + `npm run check:precache` + `npm run test:browser` (WebKit installed in the Action; adds ~1–2 min and keeps the wiring suite honest on every push).
- **Deploy**: push to `main` of the dedicated public repo, GitHub Pages from root. Site: `https://<user>.github.io/gym-tracker/`. All paths relative so the subpath works.
- **Install on iPhone**: Safari → open URL → Share → **Add to Home Screen** → launch from icon. README documents it with screenshots.
- **Update**: reopen while online → "Update available — Restart" toast.
- **Maintenance recipes** (in `docs/MAINTENANCE.md`): add a field (migration walkthrough), bump SW cache version, restore a backup, deploy + roll back, run tests.

## 25. Definition of done

v1 is done when every REQUIREMENTS §5 item is verified: all §17.1 suites green; Playwright smoke green; §17.2 device script green on the owner's iPhone; §17.3 E2E measured within §19.2 bounds; docs current (README, MAINTENANCE, PROGRESS, TESTING, DECISIONS, final plan); no secrets (none exist by design); the owner has logged a real gym session and performed a backup export, and signed off.

---

## Appendix A — Optional feature analysis (owner approval required per feature)

| Feature | User benefit | Complexity | Architectural implication | Design-now? | Verdict |
|---------|--------------|-----------|---------------------------|-------------|---------|
| Rest timer | Consistent rest | Low | UI-only; timestamp-based (no background execution in PWAs) | No | **Later (v1.1 candidate)** |
| Workout templates | Faster routine start | Medium | New entity + picker; additive migration | No | **Later** |
| Notes on set/exercise | Cues, injuries | Low | One nullable field via migration | No | **Later** |
| Plate calculator | No bar-loading math | Low | Pure UI helper | No | **Later** |
| Volume & comparison charts | Deeper insight | Low-medium | `stats.js` extension | No | **Later** |
| Encrypted backup | Safer off-device copies | Medium | WebCrypto around existing export | No | **Later** |
| Unilateral per-side logging | Single-arm/leg accuracy | Medium | `side` field + hot-path UI cost | No | **Later — keep hot path clean** |
| PR celebration toast | Motivation | Trivial | None (PR data exists) | No | **Later (v1.1 nice touch)** |
| Apple Health / widgets / Watch / Siri | Ecosystem | High | **Impossible from a PWA** — requires native | No | **Rejected while a PWA** |
| In-app speech engine | Marginal vs dictation key | High | Web Speech is online-dependent on iOS | No | **Rejected** |
| Superset support | Alternating logging | Medium | Session-model complexity | No | **Rejected for now** |
| Cloud sync / multi-device | Convenience | High | Violates local-first; merge conflicts | No | **Rejected** |
| Fitbit import: calories + duration (D4) | Auto-filled effort data | High | Fitbit/Google developer-app registration, OAuth login, token refresh, online-only API — adds an account + cloud dependency to a local-first app | No | **Rejected for v1** (owner delegated the call). Duration ships anyway, derived locally from set timestamps (§6.7); calories deliberately absent rather than estimated without heart-rate data. Revisit only if account-linked features are ever wanted. |
