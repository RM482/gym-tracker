// home.js — exercise picker, the start screen (plan §6.1).
// MRU-first list with last-session summaries, empty state + starter chips (D2),
// filter box beyond 12 exercises, pinned add button.

import { header, promptSheet, formatDayLabel, sessionSummary } from './components.js';

const STARTERS = ['Bench press', 'Squat', 'Deadlift', 'Overhead press', 'Row', 'Lat pulldown', 'Leg press', 'Biceps curl'];

export async function render(el, params, ctx) {
  el.appendChild(header({
    title: 'Gym Tracker',
    actions: [
      { icon: '☀', label: 'Today', onTap: () => { location.hash = `#/day/${ctx.store.getTodayDay()}`; } },
      { icon: '📈', label: 'Dashboard', onTap: () => { location.hash = '#/dashboard'; } },
      { icon: '✎', label: 'Manage exercises', onTap: () => { location.hash = '#/manage'; } },
      { icon: '⚙', label: 'Settings', onTap: () => { location.hash = '#/settings'; } },
    ],
  }));

  const settings = await ctx.store.getSettings();
  const exercises = await ctx.store.listExercises({ order: settings.exerciseSort });

  if (exercises.length === 0) {
    renderEmptyState(el, ctx);
    return;
  }

  const sessions = await ctx.store.getLastSessionsByExercise();
  const today = ctx.store.getTodayDay();

  if (exercises.length > 12) {
    const filter = document.createElement('input');
    filter.className = 'filter-input';
    filter.type = 'search';
    filter.placeholder = 'Filter exercises';
    filter.setAttribute('aria-label', 'Filter exercises');
    filter.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase();
      for (const row of el.querySelectorAll('.list-row[data-name]')) {
        row.style.display = row.dataset.name.includes(q) ? '' : 'none';
      }
    });
    el.appendChild(filter);
  }

  for (const ex of exercises) {
    const row = document.createElement('button');
    row.className = 'list-row';
    row.dataset.name = ex.name.toLowerCase();
    const main = document.createElement('span');
    main.className = 'row-main';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = ex.name;
    main.appendChild(name);
    const last = sessions[ex.id];
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = last ? `${formatDayLabel(last.day, today)} · ${sessionSummary(last.sets)}` : 'Not logged yet';
    main.appendChild(sub);
    row.appendChild(main);
    row.addEventListener('click', () => { location.hash = `#/log/${ex.id}`; });
    el.appendChild(row);
  }

  el.appendChild(addButton(ctx));
}

function renderEmptyState(el, ctx) {
  const card = document.createElement('div');
  card.className = 'card';
  const h = document.createElement('h2');
  h.textContent = 'Add your first exercise';
  const p = document.createElement('p');
  p.className = 'sub';
  p.textContent = 'Tap a suggestion or add your own — the list is yours, no catalogue.';
  card.append(h, p);
  const chips = document.createElement('div');
  chips.className = 'chip-row';
  for (const name of STARTERS) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = name;
    chip.addEventListener('click', async () => {
      await ctx.store.addExercise(name);
      ctx.refresh();
    });
    chips.appendChild(chip);
  }
  card.appendChild(chips);
  el.appendChild(card);
  el.appendChild(addButton(ctx));
}

function addButton(ctx) {
  const btn = document.createElement('button');
  btn.className = 'btn-secondary';
  btn.textContent = '＋ Add exercise';
  btn.addEventListener('click', () => {
    promptSheet({
      title: 'New exercise',
      label: 'Exercise name',
      submitLabel: 'Add',
      async onSubmit(value) {
        await ctx.store.addExercise(value);
        ctx.refresh();
      },
    });
  });
  return btn;
}
