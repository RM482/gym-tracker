// components.js — shared UI pieces: header, placeholder, toast, bottom sheets,
// muscle-group sectioning, and small formatting helpers used by several screens.
// Public API: header, placeholder, toast, sheet, promptSheet, confirmSheet,
//             menuSheet, groupExercises, groupToggleButton, fmtSet,
//             formatDayLabel, sessionSummary

import { MUSCLE_GROUPS, UNGROUPED_KEY } from '../store.js';
import { INTENSITIES } from '../db.js';

export function header({ title, back = null, actions = [] }) {
  const h = document.createElement('div');
  h.className = 'screen-header';
  if (back) {
    const b = document.createElement('button');
    b.className = 'icon-btn';
    b.setAttribute('aria-label', 'Back');
    b.textContent = '‹';
    b.addEventListener('click', () => { location.hash = back; });
    h.appendChild(b);
  }
  const t = document.createElement('h1');
  t.textContent = title;
  h.appendChild(t);
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.setAttribute('aria-label', a.label);
    btn.textContent = a.icon;
    btn.addEventListener('click', a.onTap);
    h.appendChild(btn);
  }
  return h;
}

export function placeholder(text) {
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = text;
  return p;
}

export function toast(message, { durationMs = 4000, actionLabel = null, onAction = null } = {}) {
  const region = document.getElementById('toast-region');
  const t = document.createElement('div');
  t.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  t.appendChild(text);
  let timer;
  if (actionLabel && onAction) {
    const action = document.createElement('button');
    action.className = 'toast-action';
    action.textContent = actionLabel;
    action.addEventListener('click', async () => {
      clearTimeout(timer);
      action.disabled = true;
      await onAction();
      t.remove();
    });
    t.appendChild(action);
  }
  region.appendChild(t);
  timer = setTimeout(() => t.remove(), durationMs);
  return () => { clearTimeout(timer); t.remove(); };
}

// ---------- bottom sheets ----------

export function sheet({ title, build }) {
  const returnFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  const card = document.createElement('div');
  card.className = 'sheet';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', title);
  card.setAttribute('aria-modal', 'true');
  if (title) {
    const h = document.createElement('h2');
    h.textContent = title;
    card.appendChild(h);
  }
  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
    returnFocus?.focus?.();
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...card.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKeydown);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  build(card, close);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  setTimeout(() => card.querySelector('input, select, button')?.focus(), 0);
  return close;
}

// Text input sheet. onSubmit(value) may throw ValidationError-like errors:
// the message is shown inline and the sheet stays open.
export function promptSheet({ title, label = null, value = '', submitLabel = 'Save', onSubmit }) {
  sheet({
    title,
    build(card, close) {
      const err = document.createElement('p');
      err.className = 'sheet-error';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      if (label) input.setAttribute('aria-label', label);
      const save = document.createElement('button');
      save.className = 'btn-primary';
      save.textContent = submitLabel;
      const cancel = document.createElement('button');
      cancel.className = 'btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', close);
      const submit = async () => {
        try {
          await onSubmit(input.value);
          close();
        } catch (e) {
          err.textContent = e.message;
        }
      };
      save.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      card.append(input, err, save, cancel);
      setTimeout(() => input.focus(), 50);
    },
  });
}

export function confirmSheet({ title, message, confirmLabel, danger = false, onConfirm }) {
  sheet({
    title,
    build(card, close) {
      const p = document.createElement('p');
      p.textContent = message;
      const ok = document.createElement('button');
      ok.className = danger ? 'btn-primary btn-danger' : 'btn-primary';
      ok.textContent = confirmLabel;
      ok.addEventListener('click', async () => { close(); await onConfirm(); });
      const cancel = document.createElement('button');
      cancel.className = 'btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', close);
      card.append(p, ok, cancel);
    },
  });
}

export function menuSheet({ title, items }) {
  sheet({
    title,
    build(card, close) {
      for (const item of items) {
        const b = document.createElement('button');
        b.className = item.danger ? 'menu-item menu-danger' : 'menu-item';
        b.textContent = item.label;
        b.addEventListener('click', async () => { close(); await item.onTap(); });
        card.appendChild(b);
      }
      const cancel = document.createElement('button');
      cancel.className = 'btn-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', close);
      card.appendChild(cancel);
    },
  });
}

// ---------- muscle-group sections ----------

// Fixed section order: the taxonomy, then never-assigned exercises last.
// "Other" is a deliberate choice and stays in the taxonomy; "Ungrouped" means
// the owner has not categorised it yet, which is a different thing (F5).
// Shared by Home and the superset picker so the two cannot order or label
// their sections differently.
export function groupExercises(exercises) {
  const sections = new Map([...MUSCLE_GROUPS, UNGROUPED_KEY].map((name) => [name, []]));
  for (const ex of exercises) sections.get(ex.muscleGroup ?? UNGROUPED_KEY).push(ex);
  return [...sections].filter(([, rows]) => rows.length > 0).map(([name, rows]) => ({ name, rows }));
}

// The fold control for one section: "▾ Legs (4)". The arrow is decorative and
// the state is carried by aria-expanded, so it is announced rather than only
// drawn. Returns paint() so a caller that forces sections open (Home does,
// while its filter has text) can repaint without rebuilding.
export function groupToggleButton({ name, count, expanded, onToggle }) {
  const btn = document.createElement('button');
  btn.className = 'group-toggle';
  btn.dataset.group = name;
  const arrow = document.createElement('span');
  arrow.className = 'group-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = `${name} (${count})`;
  btn.append(arrow, label);
  const paint = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    arrow.textContent = open ? '▾' : '▸';
  };
  paint(expanded);
  if (onToggle) btn.addEventListener('click', onToggle);
  return { btn, paint };
}

// ---------- intensity ----------

// Owner-facing wording for the stored tokens. The stored value is stable and
// the label is not: "Struggled" can be reworded without a migration.
export const INTENSITY_LABELS = { easy: 'Easy', ok: 'OK', hard: 'Struggled' };

// The three-way picker, shared by the entry panel and the set editor so the two
// cannot drift. Optional throughout: tapping the selected level clears it back
// to unrecorded, and `null` is a legitimate final answer — it means the owner
// did not say, never "it was fine".
export function intensityPicker({ value = null, onChange }) {
  let current = INTENSITIES.includes(value) ? value : null;
  const wrap = document.createElement('div');
  wrap.className = 'intensity-wrap';

  const label = document.createElement('span');
  label.className = 'stepper-label';
  label.id = `intensity-label-${Math.random().toString(36).slice(2, 9)}`;
  label.textContent = 'How did that feel? (optional)';

  const row = document.createElement('div');
  row.className = 'intensity-row';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-labelledby', label.id);

  const buttons = INTENSITIES.map((token) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'intensity-btn';
    btn.dataset.intensity = token;
    btn.textContent = INTENSITY_LABELS[token];
    btn.addEventListener('click', () => {
      current = current === token ? null : token;
      paint();
      onChange?.(current);
    });
    row.appendChild(btn);
    return btn;
  });

  const paint = () => {
    for (const btn of buttons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.intensity === current));
    }
  };
  paint();

  wrap.append(label, row);
  return { el: wrap, get: () => current };
}

// ---------- formatting ----------

const DAY_MS = 24 * 3600 * 1000;

// workoutDay strings ("YYYY-MM-DD") → "Today" / "Yesterday" / "Tue" / "15 Jul".
export function formatDayLabel(day, todayDay) {
  if (day === todayDay) return 'Today';
  const d = Date.parse(`${day}T00:00:00Z`);
  const t = Date.parse(`${todayDay}T00:00:00Z`);
  const diff = Math.round((t - d) / DAY_MS);
  if (diff === 1) return 'Yesterday';
  const date = new Date(d);
  if (diff > 1 && diff < 7) return date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// One set as text: "60 kg × 8", "bw × 12", with "+on" when the machine add-on
// was used. The add-on's kilograms are unknown, so it is shown, never added
// (D7). Lives here with the other formatters because four screens need it —
// it was in log.js until the entry panel was extracted out of that module.
export function fmtSet(s) {
  const base = s.weightKg > 0 ? `${s.weightKg} kg × ${s.reps}` : `bw × ${s.reps}`;
  const withAddOn = s.addOn ? `${base} +on` : base;
  // The owner's wording, not the stored token. An unrecorded set shows nothing
  // rather than a middle value — "not said" is not "OK".
  const felt = INTENSITY_LABELS[s.intensity];
  return felt ? `${withAddOn} ${felt}` : withAddOn;
}

// One-line session summary (plan §6.1): "3 sets · top 10 kg" / "3 sets · best 12 reps".
export function sessionSummary(sets) {
  const n = sets.length;
  const top = Math.max(...sets.map((s) => s.weightKg));
  if (top > 0) return `${n} set${n === 1 ? '' : 's'} · top ${top} kg`;
  const reps = Math.max(...sets.map((s) => s.reps));
  return `${n} set${n === 1 ? '' : 's'} · best ${reps} reps`;
}
