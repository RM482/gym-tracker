# Claude response to the Codex review of change set 3

Date: 2026-07-29. Reviewed document: `CHANGE_SET_3_BRIEF.md`. Review:
`CODEX_REVIEW_CHANGE_SET_3.md`.

Every load-bearing claim below was checked against the code before being accepted. Codex raised
3 blockers, 7 should-fixes and 2 considers. **All are accepted**, two of them with a refinement.
Two factual errors in my brief are corrected. Nothing is rejected.

## Verification of Codex's claims

Checked directly, not taken on trust:

| Claim | Verified |
|---|---|
| `addSet` re-checks existence **and** archive state inside the writing transaction | Yes — `store.js:278-287`. This is what makes the "panel goes stale mid-session" case fail safely rather than write an orphan set. |
| `setMuscleGroup` rejects missing records but permits archived ones | Yes — `store.js:195-206` has no archive check. |
| `fmtSet` is imported out of `log.js` by other modules | Yes — `day.js:5`, `history.js:4`, `tests/log.test.js:2`. This is what grounds its answer to open question 5. |
| The settings screen reads only known keys | Yes — `settings.js:27-47` reads `coarseIncrementKg` and `exerciseSort` only. A new key is ignored. |
| Analysis export never reads settings | Yes — `analysis-export.js:57-60` reads exercises and sets. |
| `promptSheet` has four call sites, not five | Yes — `home.js:196`, `manage.js:164`, `manage.js:182`, `exercise-actions.js:13`. **My brief was wrong**; corrected. Design unchanged (a dedicated sheet is still preferable to a mode flag). |
| Quick entry shares the entry block's guard and local state | Yes — `saveButtons`/`guard` at `log.js:335-336`, panel `addOn` at `337`, `readWeight()` fallback at `316`, draft map at `18`/`287`/`303`/`339`. |
| `showArchived` is module-level and survives `ctx.refresh()` | Yes — `manage.js:9`. |

## Findings — disposition

### BLOCKER 1 — extraction boundary omits quick-entry coupling · **ACCEPTED**

The strongest finding in the review, and my brief was wrong. I drew the boundary at `log.js:269`,
but quick entry at `271-344` pushes its confirm button into the same `saveButtons` array and calls
the same `guard`, reads the panel's live `addOn` and `readWeight()`, and clears its draft only after
a successful write. Extracting only the manual controls would either thread four callbacks across a
module boundary or give quick entry a second, independent guard — quietly downgrading today's
guarantee that *every* write button for one exercise is mutually exclusive.

**Revised boundary:** one panel controller owns weight, reps, add-on, e1RM, `pending`, **every**
write button, and quick-entry state. `compact: true` does not render quick entry but changes nothing
about ownership. The "Last time" / "Today" cards and the plateau banner stay outside the panel, in
the screen that composes it.

### BLOCKER 2 — superset invalid-route policy unspecified · **ACCEPTED**

Adopted as recommended:

- `parseRoute` rejects a malformed pair **and a pair with two identical ids** (see next finding).
- Both records load before either panel is built.
- Both invalid → one toast, go Home. Exactly one valid → toast, fall back to that exercise's normal
  logging screen (never a half-dead superset).
- Every render-time toast or redirect is gated on `ctx.isCurrent()`, matching `log.js:39-48`.
- An exercise archived or deleted *after* the panel rendered is already handled safely by the
  in-transaction check at `store.js:278-287`: the save is rejected with a message. The panel shows
  that error and re-validates the route rather than sitting dead.

### BLOCKER 3 — the new screen must honour the detached-render protocol · **ACCEPTED, refined**

Accepted, and made concrete — the review flags the risk but leaves the rule implicit. The rule the
superset screen follows, which is also what `log.js` already does today:

- **The post-write `ctx.refresh()` stays unconditional. Only toasts and navigation are gated on
  `ctx.isCurrent()`.**

Why that is safe, checked against `app.js:52-54` and `191-219`: `renderSeq` is monotonic, and
`shouldCommitRender` requires `seq === currentSeq`. A background refresh that started *before* the
write therefore holds a lower `seq` and can never commit over the post-write render, whatever order
they resolve in. Gating the refresh on `isCurrent()` — the intuitive-looking move — is the actual
hazard: it would skip the refresh precisely when a background render invalidated the token, letting
a pre-write snapshot be the last thing to commit. Recorded so the next person does not "tidy" it.

### SHOULD-FIX — per-panel guards are safe only for distinct ids · **ACCEPTED**

Correct, and it upgrades identical-id rejection from tidiness to a safety requirement: two panels
for one exercise means two independent guards and therefore two live Save buttons for the same
target — reintroducing the duplicate-write path the single guard exists to prevent (`log.js:224-238`,
plan §12). Rejected in `parseRoute`, with a unit test.

### SHOULD-FIX — staged mass grouping is fragile · **ACCEPTED, with a refinement**

The argument is sound and I had missed it: the app re-renders on `focus` and `visibilitychange`
(`app.js:225-231`), so a draft held in a render closure is silently discarded when the owner's phone
locks or they switch apps mid-way — losing a dozen taps with no error. Holding it in module state
instead just moves the problem to reconciling a stale draft against a re-read list.

**Switching to immediate save-per-tap.** Pick "Arms"; each row's checkbox means "is Arms"; ticking
assigns Arms, unticking assigns Ungrouped; "Done" leaves the mode. No Apply, no pretend-transactional
Cancel. This also matches the owner's own phrasing — "go through the list to select all arms
exercises, **thereby** grouping them" — where selecting *is* grouping.

**My refinement:** a tap must **not** call `ctx.refresh()`, or every tap would re-render the whole
Manage screen and throw away scroll position mid-list. Each tap writes and updates that one row in
place; a single `ctx.refresh()` runs on leaving the mode. This keeps the mode immune to the
background-refresh problem (there is no draft to lose) without making it feel jumpy.

Codex's related point that `setMuscleGroup` permits archived records is correct but marginal here:
grouping mode lists active exercises only, so it needs an exercise to be archived from elsewhere
mid-mode. Noted, not designed around.

### SHOULD-FIX — one canonical `normalizeSettings()` · **ACCEPTED**

`getSettings` currently spreads raw stored values over defaults (`store.js:398-401`), so a
hand-edited backup carrying `"collapsedGroups": "Legs"` would reach the Home renderer as a string.
Adding a `normalizeSettings()` applied by `getSettings`, `updateSettings`, `snapshotForBackup` and
`replaceFromBackup`: array only, unique, values restricted to `MUSCLE_GROUPS` plus the literal
`Ungrouped`. This is the project's existing "writes canonical, reads tolerant" rule, so it belongs
in the store rather than in `home.js`.

Backup validation stays tolerant — a bad preference must never block restoring real history — since
normalisation on read and re-export makes it harmless. Also accepted: a remembered group that
currently has no exercises is kept, not cleaned up, and **no cleanup writes happen during rendering**.

### SHOULD-FIX — folding and filtering must share one visibility calculation · **ACCEPTED**

Two handlers each writing `row.style.display` would overwrite each other, which is a fresh way to
reintroduce the exact class of bug that shipped in change set 2 (`PROGRESS.md`, 2026-07-25). One
`applyVisibility()` derives each row's state from (filter text, collapsed set, row group), called by
both handlers, operating on captured elements as `home.js:128-140` already does.

### SHOULD-FIX — superset navigation and edit semantics · **ACCEPTED**

Right that a panel heading linking to the full logging screen strands the owner: that screen's back
button always goes Home (`log.js:51-54`), so there is no route back to the superset. For v1: panel
headings are not links, no rename/archive inside the superset, top-level back returns to A's normal
screen. Avoids inventing return-route parameters for a rare action.

### SHOULD-FIX — D8 needs an explicit amendment · **ACCEPTED**

Recorded in `DECISIONS.md` **in the same slice** as the add-sheet change, not described as merely
touching D8's "spirit". The owner has deliberately changed the trade-off; the log should say so.

### CONSIDER — drop "2 of 6 done" on folded headings · **ACCEPTED**

Cut. The owner asked for a shorter list, not a second progress summary. Headings show
"Legs (6) ▾". Revisit only if real use shows folded sections hiding something needed.

### CONSIDER — do not change global scroll behaviour unless reproduced · **ACCEPTED**

Already the brief's position; now firmer. No `app.js` scroll change unless saving from the lower
panel actually jumps on WebKit and on the owner's iPhone.

## Corrections to my brief

1. `promptSheet` has **four** call sites, not five.
2. "No record shape changes" was imprecise: `collapsedGroups` **is** a new optional field on the
   settings record. It requires no `DB_VERSION` bump because settings is a free-form single record
   merged over defaults — but the accurate statement is "no `DB_VERSION` change and no migration",
   not "no record shape changes".

## Revised slice plan

1. **Add-exercise sheet + landing** (item 1) + the D8 amendment in `DECISIONS.md`.
2. **Fold groups** (item 4) — `normalizeSettings()` in the store, one `applyVisibility()` on Home.
3. **Mass grouping** (item 2) — save-per-tap, row updated in place, refresh on exit.
4. **Characterisation tests** for the entry block's current behaviour — added *before* the refactor
   so it has a real net (accepted from the review's closing section: today's tests cover the
   features but not the shared guard and local-state coupling).
5. **Entry-panel extraction** — behaviour-preserving, boundary now including quick entry.
6. **Superset screen** (item 3).

Six slices rather than five: the characterisation tests are separated so the refactor is measured
against a net that already exists, rather than one written alongside it.

**Success criterion for slice 5, restated** after the review's answer to open question 5: existing
*assertions and behaviour* must not change. Import-only edits are allowed where a helper genuinely
moves module (`fmtSet` is imported by `day.js`, `history.js` and `log.test.js`, so forcing a
re-export purely to avoid touching an import line would be worse structure). Any assertion change is
a behaviour change and must be justified, not absorbed.

## Test additions taken from the review

Adopted: add-sheet duplicate-name error keeps the sheet open; no group selected stores `null`;
Manage add stays on Manage; starter chips stay on Home; folding writes no backup-reminder timestamp;
`collapsedGroups` survives export → validate → restore and normalises from junk; fold state survives
a focus/visibility refresh; filter reveals rows inside a folded group and clearing re-folds;
`parseRoute` rejects malformed and identical-id superset routes; both panels save independently to
the right exercise; a stale superset render cannot redirect or toast over a newer route.

Adopted for the characterisation slice: quick draft survives navigation and a failed save and clears
only after success; quick confirm shares duplicate protection with manual and repeat saves; quick
parsing uses the current weight as fallback; the batch uses the current add-on; Repeat copies the
source set's add-on rather than the toggle's.

Not adopted as separate cases: the full cross-product of unknown/archived/deleted × A/B. The
route-validation logic is one function and is unit-tested directly; multiplying browser tests over it
buys coverage of the test harness, not of the app.
