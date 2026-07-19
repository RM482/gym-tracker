// log.js — the logging screen, heart of the app (plan §6.2).
// Last-time card + collapsed Earlier line, Today card, steppers with pre-fill,
// "Save set" (saves and stays), "↻ Same as last time" with the n+1 rule.
// Includes the Phase 4 typed/dictated quick-entry preview and batch-save flow.
// Editing today's sets arrives in Phase 5.
//
// Exported for unit tests: pickRepeatSet(prevSets, todayCount).

import { header, toast, formatDayLabel } from './components.js';
import { parseQuickEntry } from '../parser.js';
import { openSetEditor } from './set-editor.js';

// Kept in module memory so a sentence survives in-app navigation, but not app
// termination/reload, as specified in §12.
const quickDrafts = new Map();

// §6.2 rule: with n sets logged today, ↻ logs the previous session's set n+1;
// past its end, its last set; no previous session → no button.
export function pickRepeatSet(prevSets, todayCount) {
  if (!prevSets || prevSets.length === 0) return null;
  return prevSets[Math.min(todayCount, prevSets.length - 1)];
}

export function fmtSet(s) {
  return s.weightKg > 0 ? `${s.weightKg} kg × ${s.reps}` : `bw × ${s.reps}`;
}

function lastTimeLabel(day, today) {
  const label = formatDayLabel(day, today);
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  return diff >= 7 ? `${label} · ${diff} days ago` : label;
}

export async function render(el, { exerciseId }, ctx) {
  const ex = await ctx.store.getExercise(exerciseId);
  if (!ex || ex.archivedAtMs) {
    toast('That exercise is archived or was deleted');
    location.hash = '#/';
    return;
  }

  el.appendChild(header({
    title: ex.name,
    back: '#/',
    actions: [{ icon: '🕐', label: 'History', onTap: () => { location.hash = `#/history/${ex.id}`; } }],
  }));

  const today = ctx.store.getTodayDay();
  const sessions = await ctx.store.getRecentSessions(ex.id, 3);
  const todaySets = await ctx.store.getTodaySets(ex.id);
  const settings = await ctx.store.getSettings();
  const prev = sessions[0] ?? null;

  // ---- Last time card ----
  const lastCard = document.createElement('div');
  lastCard.className = 'card';
  if (prev) {
    const h = document.createElement('h2');
    h.textContent = `Last time — ${lastTimeLabel(prev.day, today)}`;
    const line = document.createElement('p');
    line.className = 'sets-line';
    line.textContent = prev.sets.map(fmtSet).join(' · ');
    lastCard.append(h, line);
    if (sessions.length > 1) {
      const earlier = document.createElement('button');
      earlier.className = 'earlier-line';
      earlier.textContent = 'Earlier: ' + sessions.slice(1)
        .map((s) => `${formatDayLabel(s.day, today)} ${s.sets.map(fmtSet).join(', ')}`)
        .join(' · ') + ' ›';
      earlier.addEventListener('click', () => { location.hash = `#/history/${ex.id}`; });
      lastCard.appendChild(earlier);
    }
  } else {
    const p = document.createElement('p');
    p.textContent = 'First time — log your opening set below.';
    lastCard.appendChild(p);
  }
  el.appendChild(lastCard);

  // ---- Today card ----
  if (todaySets.length > 0) {
    const todayCard = document.createElement('div');
    todayCard.className = 'card';
    const h = document.createElement('h2');
    h.textContent = `Today — ${todaySets.length} set${todaySets.length === 1 ? '' : 's'}`;
    todayCard.appendChild(h);
    for (const s of todaySets) {
      const row = document.createElement('button');
      row.className = 'set-row';
      const time = new Date(s.performedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      row.setAttribute('aria-label', `Edit ${fmtSet(s)} at ${time}`);
      row.innerHTML = `<span>${time}</span><strong>${fmtSet(s)}</strong>`;
      row.addEventListener('click', () => openSetEditor(s, ctx));
      todayCard.appendChild(row);
    }
    el.appendChild(todayCard);
  }

  // ---- Entry controls ----
  // Pre-fill (§6.2): today's last set if any; else previous session's FIRST set;
  // else weight empty + reps 8 (Save enables once a weight is entered).
  let prefillW = null;
  let prefillR = 8;
  if (todaySets.length > 0) {
    const last = todaySets[todaySets.length - 1];
    prefillW = last.weightKg; prefillR = last.reps;
  } else if (prev) {
    prefillW = prev.sets[0].weightKg; prefillR = prev.sets[0].reps;
  }

  const coarse = settings.coarseIncrementKg;
  const err = document.createElement('p');
  err.className = 'sheet-error';

  const weightInput = valueInput('decimal', prefillW === null ? '' : String(prefillW), 'Weight in kilograms');
  const repsInput = valueInput('numeric', String(prefillR), 'Repetitions');

  const readWeight = () => parseFloat(String(weightInput.value).replace(',', '.'));
  const readReps = () => parseInt(String(repsInput.value), 10);
  const bump = (input, delta, read, min, max) => {
    const cur = read();
    const next = Math.min(max, Math.max(min, (Number.isFinite(cur) ? cur : 0) + delta));
    input.value = String(Math.round(next * 100) / 100);
    err.textContent = '';
  };

  el.appendChild(stepperRow('Weight (kg)', [
    stepBtn(`−${coarse}`, () => bump(weightInput, -coarse, readWeight, 0, 999)),
    stepBtn('−0.5', () => bump(weightInput, -0.5, readWeight, 0, 999)),
    weightInput,
    stepBtn('+0.5', () => bump(weightInput, 0.5, readWeight, 0, 999)),
    stepBtn(`+${coarse}`, () => bump(weightInput, coarse, readWeight, 0, 999)),
  ]));
  el.appendChild(stepperRow('Reps', [
    stepBtn('−1', () => bump(repsInput, -1, readReps, 1, 200)),
    repsInput,
    stepBtn('+1', () => bump(repsInput, 1, readReps, 1, 200)),
  ]));
  el.appendChild(err);

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

  const save = document.createElement('button');
  save.className = 'btn-primary';
  save.textContent = 'Save set';
  save.addEventListener('click', () => guard(async () => {
    const w = readWeight();
    const r = readReps();
    if (!Number.isFinite(w)) throw new Error('Enter a weight (0 is fine for bodyweight)');
    if (!Number.isFinite(r)) throw new Error('Enter the reps');
    await ctx.store.addSet({ exerciseId: ex.id, weightKg: w, reps: r });
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
      await ctx.store.addSet({ exerciseId: ex.id, weightKg: repeat.weightKg, reps: repeat.reps });
      toast(`Saved ✓ · set ${todaySets.length + 1}`);
      ctx.refresh();
    }));
    saveButtons.push(btn);
    el.appendChild(btn);
  }

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
      await ctx.store.addSets(ex.id, result.sets);
      quickDrafts.delete(ex.id);
      toast(`Saved ✓ · ${result.sets.length} set${result.sets.length === 1 ? '' : 's'}`);
      ctx.refresh();
    }));
    preview.append(chips, confirm);
  });
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
