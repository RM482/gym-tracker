// components.js — shared UI pieces: header, placeholder, toast, bottom sheets,
// and small formatting helpers used by several screens.
// Public API: header, placeholder, toast, sheet, promptSheet, confirmSheet,
//             menuSheet, formatDayLabel, sessionSummary

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
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  const card = document.createElement('div');
  card.className = 'sheet';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', title);
  if (title) {
    const h = document.createElement('h2');
    h.textContent = title;
    card.appendChild(h);
  }
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  build(card, close);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
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

// One-line session summary (plan §6.1): "3 sets · top 10 kg" / "3 sets · best 12 reps".
export function sessionSummary(sets) {
  const n = sets.length;
  const top = Math.max(...sets.map((s) => s.weightKg));
  if (top > 0) return `${n} set${n === 1 ? '' : 's'} · top ${top} kg`;
  const reps = Math.max(...sets.map((s) => s.reps));
  return `${n} set${n === 1 ? '' : 's'} · best ${reps} reps`;
}
