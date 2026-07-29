// entry-panel.js — everything needed to enter sets for ONE exercise: the
// steppers, the machine add-on toggle, the live estimated-1RM readout, "Save
// set", "↻ Same as last time", and the typed/dictated quick entry.
//
// Extracted verbatim from log.js so the superset screen (which shows two of
// these at once) cannot fork the logic. The boundary deliberately INCLUDES
// quick entry: its confirm button joins the same saveButtons list and calls the
// same guard, it reads the panel's live weight and add-on, and it clears its
// draft only after a successful write. Splitting it out would have meant either
// callbacks threaded across a module boundary or a second, independent guard —
// quietly downgrading the rule that every write button for one exercise is
// mutually exclusive (plan §12: this is the ONLY duplicate-write protection).
//
// One panel owns one exercise. Two panels on a superset screen therefore get
// one guard each, which is correct: they write to different exercises, and a
// shared guard would let a save on Bench disable the Save button on Row.
//
// Exported for unit tests: pickRepeatSet(prevSets, todayCount).

import { fmtSet, toast } from './components.js';
import { epley, bestE1rm } from '../stats.js';
import { parseQuickEntry } from '../parser.js';
import * as platform from '../platform.js';

// Kept in module memory so a sentence survives in-app navigation, but not app
// termination/reload, as specified in §12.
const quickDrafts = new Map();

// §6.2 rule: with n sets logged today, ↻ logs the previous session's set n+1;
// past its end, its last set; no previous session → no button.
export function pickRepeatSet(prevSets, todayCount) {
  if (!prevSets || prevSets.length === 0) return null;
  return prevSets[Math.min(todayCount, prevSets.length - 1)];
}

// `compact` omits the quick-entry section — it is a plan-several-sets-at-once
// tool, which is not what supersetting mid-round needs, and it is bulky when
// two panels share a screen. Ownership is identical either way.
export function buildEntryPanel({ ex, prev, todaySets, settings, ctx, compact = false }) {
  const el = document.createElement('div');
  el.className = 'entry-panel';

  // Pre-fill (§6.2): today's last set if any; else previous session's FIRST set;
  // else weight empty + reps 8 (Save enables once a weight is entered).
  let prefillW = null;
  let prefillR = 8;
  let addOn = false;
  if (todaySets.length > 0) {
    const last = todaySets[todaySets.length - 1];
    prefillW = last.weightKg; prefillR = last.reps; addOn = last.addOn === true;
  } else if (prev) {
    prefillW = prev.sets[0].weightKg; prefillR = prev.sets[0].reps; addOn = prev.sets[0].addOn === true;
  }

  const coarse = settings.coarseIncrementKg;
  const err = document.createElement('p');
  err.className = 'sheet-error';

  const weightInput = valueInput('decimal', prefillW === null ? '' : String(prefillW), 'Weight in kilograms');
  const repsInput = valueInput('numeric', String(prefillR), 'Repetitions');

  const readWeight = () => parseFloat(String(weightInput.value).replace(',', '.'));
  const readReps = () => parseInt(String(repsInput.value), 10);

  // Live estimated 1-rep max (Epley) for the set being entered. It turns
  // "heavier but fewer reps" into one comparable number, so the owner can see
  // whether such a set is actually stronger than last time (owner feedback).
  // Recorded kg only: the machine add-on's weight is unknown (D7), so an add-on
  // set is flagged and not compared. Epley is unreliable past ~12 reps, so the
  // readout is shown only up to 12 — matching the dashboard's PR eligibility.
  const prevBest = prev ? bestE1rm(prev.sets) : null;
  const round1 = (n) => Number(n.toFixed(1));
  const e1rmLine = document.createElement('p');
  e1rmLine.className = 'e1rm-readout';
  e1rmLine.setAttribute('role', 'status');
  const paintE1rm = () => {
    const w = readWeight();
    const r = readReps();
    if (!(w > 0) || !Number.isInteger(r) || r < 1 || r > 12) { e1rmLine.textContent = ''; return; }
    const est = epley(w, r);
    if (addOn) { e1rmLine.textContent = `Est. 1-rep max ≈ ${round1(est)} kg · add-on weight not counted`; return; }
    let text = `Est. 1-rep max ≈ ${round1(est)} kg`;
    if (prevBest != null) {
      const diff = est - prevBest;
      if (Math.abs(diff) < 0.05) text += ' · same as last time';
      else if (diff > 0) text += ` · ▲ stronger than last time (${round1(prevBest)} kg)`;
      else text += ` · ▼ below last time (${round1(prevBest)} kg)`;
    }
    e1rmLine.textContent = text;
  };
  weightInput.addEventListener('input', paintE1rm);
  repsInput.addEventListener('input', paintE1rm);

  const bump = (input, delta, read, min, max) => {
    const cur = read();
    const next = Math.min(max, Math.max(min, (Number.isFinite(cur) ? cur : 0) + delta));
    input.value = String(Math.round(next * 100) / 100);
    err.textContent = '';
    paintE1rm();
  };

  el.appendChild(stepperRow('Weight (kg)', [
    stepBtn(`−${coarse}`, () => bump(weightInput, -coarse, readWeight, 0, 999)),
    stepBtn('−0.5', () => bump(weightInput, -0.5, readWeight, 0, 999)),
    weightInput,
    stepBtn('+0.5', () => bump(weightInput, 0.5, readWeight, 0, 999)),
    stepBtn(`+${coarse}`, () => bump(weightInput, coarse, readWeight, 0, 999)),
  ]));
  const addOnToggle = document.createElement('button');
  addOnToggle.type = 'button';
  addOnToggle.className = 'addon-toggle';
  const paintAddOn = () => {
    addOnToggle.textContent = addOn ? 'Machine add-on: ON' : 'Machine add-on: off';
    addOnToggle.classList.toggle('addon-on', addOn);
    addOnToggle.setAttribute('aria-pressed', String(addOn));
  };
  addOnToggle.addEventListener('click', () => { addOn = !addOn; paintAddOn(); paintE1rm(); });
  paintAddOn();
  el.appendChild(addOnToggle);

  el.appendChild(stepperRow('Reps', [
    stepBtn('−1', () => bump(repsInput, -1, readReps, 1, 200)),
    repsInput,
    stepBtn('+1', () => bump(repsInput, 1, readReps, 1, 200)),
  ]));
  el.appendChild(err);
  el.appendChild(e1rmLine);
  paintE1rm();

  // Shared write-pending guard: the ONLY duplicate protection (§12).
  let pending = false;
  const saveButtons = [];
  const guard = async (fn) => {
    if (pending) return;
    pending = true;
    saveButtons.forEach((b) => { b.disabled = true; });
    try {
      await fn();
    } catch (e) {
      err.textContent = e.message;
      pending = false;
      saveButtons.forEach((b) => { b.disabled = false; });
    }
  };

  // ctx.refresh() after a write is deliberately NOT gated on ctx.isCurrent().
  // renderSeq is monotonic and shouldCommitRender requires seq === currentSeq,
  // so a background render that started before the write can never commit over
  // this one. Gating the refresh is the actual hazard: it would skip precisely
  // when a background render had invalidated the token, letting a pre-write
  // snapshot be the last thing committed.
  const save = document.createElement('button');
  save.className = 'btn-primary';
  save.textContent = 'Save set';
  save.addEventListener('click', () => guard(async () => {
    const w = readWeight();
    const r = readReps();
    if (!Number.isFinite(w)) throw new Error('Enter a weight (0 is fine for bodyweight)');
    if (!Number.isFinite(r)) throw new Error('Enter the reps');
    await ctx.store.addSet({ exerciseId: ex.id, weightKg: w, reps: r, addOn });
    platform.requestPersist().catch(() => {});
    toast(`Saved ✓ · set ${todaySets.length + 1}`);
    ctx.refresh();
  }));
  saveButtons.push(save);
  el.appendChild(save);

  const repeat = pickRepeatSet(prev?.sets, todaySets.length);
  if (repeat) {
    const btn = document.createElement('button');
    btn.className = 'btn-secondary';
    btn.textContent = `↻ Same as last time — ${fmtSet(repeat)}`;
    btn.addEventListener('click', () => guard(async () => {
      await ctx.store.addSet({ exerciseId: ex.id, weightKg: repeat.weightKg, reps: repeat.reps, addOn: repeat.addOn === true });
      platform.requestPersist().catch(() => {});
      toast(`Saved ✓ · set ${todaySets.length + 1}`);
      ctx.refresh();
    }));
    saveButtons.push(btn);
    el.appendChild(btn);
  }

  if (compact) return el;

  // ---- Typed / dictated quick entry ----
  const quick = document.createElement('section');
  quick.className = 'quick-entry card';
  const quickTitle = document.createElement('h2');
  quickTitle.textContent = 'Add several sets';
  const quickHint = document.createElement('p');
  quickHint.className = 'quick-hint';
  quickHint.textContent = 'Type or dictate a sentence, then check it before saving.';
  const quickForm = document.createElement('form');
  quickForm.className = 'quick-form';
  const quickInput = document.createElement('input');
  quickInput.type = 'text';
  quickInput.enterKeyHint = 'done';
  quickInput.autocomplete = 'off';
  quickInput.setAttribute('aria-label', 'Quick entry sentence');
  quickInput.placeholder = 'e.g. 2x8 @ 10kg, then 8 @ 9kg';
  quickInput.value = quickDrafts.get(ex.id) ?? '';
  const parseBtn = document.createElement('button');
  parseBtn.type = 'submit';
  parseBtn.className = 'quick-submit';
  parseBtn.setAttribute('aria-label', 'Preview sets');
  parseBtn.textContent = '➜';
  quickForm.append(quickInput, parseBtn);
  const quickError = document.createElement('p');
  quickError.className = 'sheet-error';
  quickError.setAttribute('aria-live', 'polite');
  const preview = document.createElement('div');
  preview.className = 'quick-preview';
  quick.append(quickTitle, quickHint, quickForm, quickError, preview);
  el.appendChild(quick);

  quickInput.addEventListener('input', () => {
    quickDrafts.set(ex.id, quickInput.value);
    quickError.textContent = '';
    preview.replaceChildren();
  });
  quickInput.addEventListener('focus', () => {
    setTimeout(() => quick.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  });

  quickForm.addEventListener('submit', (event) => {
    event.preventDefault();
    quickDrafts.set(ex.id, quickInput.value);
    quickError.textContent = '';
    preview.replaceChildren();
    const result = parseQuickEntry(quickInput.value, { fallbackWeightKg: readWeight() });
    if (result.errors.length) {
      quickError.textContent = result.errors
        .map((item) => `${item.fragment ? `“${item.fragment}”: ` : ''}${item.reason}`)
        .join(' · ');
      return;
    }

    const chips = document.createElement('div');
    chips.className = 'preview-chips';
    for (const set of result.sets) {
      const chip = document.createElement('span');
      chip.className = 'preview-chip';
      chip.textContent = fmtSet(set);
      chips.appendChild(chip);
    }
    const confirm = document.createElement('button');
    confirm.className = 'btn-primary';
    confirm.textContent = `Add ${result.sets.length} set${result.sets.length === 1 ? '' : 's'}`;
    saveButtons.push(confirm);
    confirm.addEventListener('click', () => guard(async () => {
      await ctx.store.addSets(ex.id, result.sets.map((set) => ({ ...set, addOn })));
      platform.requestPersist().catch(() => {});
      quickDrafts.delete(ex.id);
      toast(`Saved ✓ · ${result.sets.length} set${result.sets.length === 1 ? '' : 's'}`);
      ctx.refresh();
    }));
    preview.append(chips, confirm);
  });

  return el;
}

function valueInput(mode, value, label) {
  const input = document.createElement('input');
  input.className = 'value-input';
  input.type = 'text';
  input.inputMode = mode;
  input.value = value;
  input.setAttribute('aria-label', label);
  return input;
}

function stepBtn(label, onTap) {
  const b = document.createElement('button');
  b.className = 'stepper-btn';
  b.textContent = label;
  b.addEventListener('click', onTap);
  return b;
}

function stepperRow(labelText, children) {
  const wrap = document.createElement('div');
  wrap.className = 'stepper-wrap';
  const label = document.createElement('span');
  label.className = 'stepper-label';
  label.textContent = labelText;
  const row = document.createElement('div');
  row.className = 'stepper-row';
  for (const c of children) row.appendChild(c);
  wrap.append(label, row);
  return wrap;
}
