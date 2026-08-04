# Change set 5 — design brief: per-set intensity flag

Status: **draft for review**. Written 2026-08-04. Nothing implemented yet.

Baseline: `gt-v0.22.0`, `DB_VERSION = 2`, tree clean, Vitest 121 / Playwright 43 green.

**This is the first schema change since v2**, so the schema rules in `HANDOFF.md` are load-bearing
here in a way they were not for change sets 3 and 4.

## The request

> "I'd like to add an option to flag how intense an exercise was for me, so I know the next time if I
> struggled to finish the set or if I can go up in weights."

## Owner decisions taken up front

| Question | Decision |
|---|---|
| Scale | **Easy / OK / Struggled** — three buttons, in the owner's own words. Not RPE 6–10, not reps-in-reserve. |
| Granularity | **Per set**, not once per exercise per day. The within-session fade (set 1 easy, set 4 a fight) is precisely the signal that answers "can I add weight?". |
| Suggestions | **Show the flags only.** No "ready to go up?" nudge. The app does not make the judgement. |

The third decision keeps this change set small and keeps the app honest: it records what the owner
said and shows it back, and never infers a training recommendation from three data points.

## Storage

New optional field on `SetEntry`:

```
intensity: null | 'easy' | 'ok' | 'hard'
```

- **String enum, not a number.** It survives readably into the analysis export (`"intensity": "hard"`
  needs no legend), and it cannot be mistaken for something arithmetic. Nothing may ever average it:
  the three levels are ordered but not evenly spaced, exactly like RPE.
- **`null` means not recorded**, and is distinct from `'ok'` — the same distinction D8 makes between
  `Ungrouped` and a deliberate `Other`. Every set logged before this change set is `null` forever;
  none of them is retroactively "OK".
- Stored value `'hard'` rather than `'struggled'`: the label is owner-facing text and may be reworded,
  the stored token should not have to change with it.

**`DB_VERSION` 2 → 3**, with `migrations[2] = { records: { sets: s => ({ ...s, intensity: … }) } }`.
Records only — no new store and no new index, since nothing queries by intensity.

Per `HANDOFF.md` this must ship together with: the record transform, updated constructor/validators,
**a pure fixture test and a real database-upgrade test**, and backup-import coverage. `migrateBackup()`
replays the same transform — it must not be forked.

The multi-version path matters now for the first time in production: a device that somehow still holds
v1 data upgrades v1 → v2 → v3 in one transaction. Change set 1's review (G4) rewrote migrations to
walk each store once applying every version's transform in order, and there is already a v1→v3 test
using a fake table. That test now collides with a real `DB_VERSION = 3` and needs checking, not
blind updating.

## Where the field must reach

A new set field has to be handled everywhere a set is written, read, shown, edited or exported.
Checked against the code:

| Place | Change |
|---|---|
| `db.js` | `DB_VERSION = 3`; `migrations[2]` record transform for `sets`. |
| `store.js` `buildSet` | Accept and validate `intensity`; canonical on write. |
| `store.js` `normalizeSet` | Tolerant read: anything not in the enum becomes `null`. |
| `store.js` `editSet` | `patch.intensity` validated like the other fields (`store.js:326`). |
| `store.js` `addSets` | Quick-entry batch carries it like `addOn` does. |
| `backup.js` `validateBackup` | Reject an out-of-enum intensity **after** migration, as it already does for `muscleGroup` and `addOn`. |
| `analysis-export.js` | New `intensity` column plus a sentence in `guidance` — this is exactly the kind of thing the owner exports for analysis. |
| `entry-panel.js` | The three-button control, optional. |
| `set-editor.js` | Correctable after the fact, like the add-on toggle at `set-editor.js:43-55`. |
| `components.js` `fmtSet` | Show it wherever a set is shown. |

## The one real design tension: does the flag carry over between sets?

Weight, reps and `addOn` all pre-fill from the previous set (`entry-panel.js:44-56`). The obvious move
is for intensity to do the same.

**I think it must not, and this contradicts a parenthetical in the option text the owner chose**
("carried over from your last set so it is usually already right"), so it is flagged here rather than
changed quietly.

The argument against carrying over:

- The value of the feature is spotting the fade **within** a session — set 1 easy, set 4 a struggle.
  A carried-over flag actively works against that: it pre-fills "Easy" on set 4, and a set saved
  without touching it records "Easy" for a set that was a fight.
- That is inventing data the owner did not state. The project has a firm line on this (D7: the
  add-on's kilograms are unknown, so they are never guessed into `weightKg`). A carried-over
  intensity is the same category of error and is harder to notice, because it looks like a real answer.
- `addOn` is different in kind and the comparison does not transfer: it is a physical fact about how
  the machine is set up, which genuinely persists between sets of the same exercise. How hard a set
  felt genuinely changes between sets — that is the whole point.

Cost of not carrying over: one extra tap per set, on an optional control. Benefit: a recorded flag
always means the owner said so.

**Proposal: start unset on every set.** Put to the owner explicitly once implemented, since it
differs from what the chosen option's wording implied.

## Display

`fmtSet` gains the flag: `60 kg × 8 easy`, `60 kg × 8 hard`, and unchanged when `null`.

This one function feeds Home's session summary, the Last-time line, the Today card, History, the Day
overview, the superset panels and the quick-entry preview chips (`components.js`, imported in five
modules). Adding a word makes the "Last time" line longer — with five sets it becomes noticeably long
on a phone. **Open question below.** The middle value is shown, not omitted: hiding `ok` would make it
indistinguishable from "not recorded", which is the distinction the whole design rests on.

## What this change set does *not* do

- No "ready to go up in weight?" nudge (owner's decision).
- No averaging, scoring or charting of intensity; no dashboard changes. It is ordinal data, and a
  mean of Easy/OK/Hard would be meaningless.
- No interaction with the existing plateau nudge (D6) or with e1RM (D7) — both are about recorded
  kilograms and stay that way.
- No index on intensity; nothing queries by it.

## Proposed slices

1. **Schema**: `DB_VERSION = 3`, migration, `buildSet`/`normalizeSet`/`editSet`/`addSets`, backup
   validation, with the full test set the handoff mandates. No UI — the field exists and is `null`.
2. **Entry and editing**: the control in `entry-panel.js` and `set-editor.js`.
3. **Display and export**: `fmtSet`, and the analysis export column plus guidance.

Slice 1 alone is deployable and inert, which is the safest possible way to land a schema change.

## Open questions for review

1. Is `null | 'easy' | 'ok' | 'hard'` the right shape, or should it be an integer 1–3 for future
   extensibility (e.g. if the owner later wants RPE 6–10)? Is there a migration path from the enum to
   a finer scale that the enum forecloses?
2. Should the flag carry over between sets? See the tension above — I propose no.
3. Is putting the flag in `fmtSet` right, given it feeds seven display sites at once, or should the
   Last-time line stay terse and the flag appear only in History and the Today card?
4. `addSets` (quick entry) applies one `addOn` to a whole batch. Should it apply one intensity to the
   whole batch too, or leave a batch's sets unflagged? A sentence like "3x8 @ 60kg" says nothing about
   how any individual set felt.
5. Does the existing v1→v3 migration test (change set 1, G4) still test what it claims once
   `DB_VERSION` is genuinely 3, or does it silently become a different test?
6. Anything in the recovery/version-skew paths that a `DB_VERSION` bump disturbs — `DbTooOldError`
   handling, the "backup from a newer app version" rejection in `validateEnvelope`, the update
   overlay protocol?
