// home.js — exercise picker, the start screen (plan §6.1).
// Grouped by muscle group (D8), most-recently-used first within each group,
// with exercises already logged today marked so the owner can see what is left
// (D-item 3). Empty state offers starter chips (D2); a filter box appears past
// 12 exercises; the backup reminder follows plan §6.1 timing.

import { header, promptSheet, formatDayLabel, sessionSummary } from './components.js';
import { MUSCLE_GROUPS, isBackupOverdue } from '../store.js';

const STARTERS = ['Bench press', 'Squat', 'Deadlift', 'Overhead press', 'Row', 'Lat pulldown', 'Leg press', 'Biceps curl'];
const UNGROUPED = 'Ungrouped';

// Fixed section order: the taxonomy, then never-assigned exercises last.
// "Other" is a deliberate choice and stays in the taxonomy; "Ungrouped" means
// the owner has not categorised it yet, which is a different thing (F5).
export function groupExercises(exercises) {
  const sections = new Map([...MUSCLE_GROUPS, UNGROUPED].map((name) => [name, []]));
  for (const ex of exercises) sections.get(ex.muscleGroup ?? UNGROUPED).push(ex);
  return [...sections].filter(([, rows]) => rows.length > 0).map(([name, rows]) => ({ name, rows }));
}

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

  if (isBackupOverdue(settings, Date.now())) el.appendChild(backupBanner(ctx));

  if (exercises.length === 0) {
    renderEmptyState(el, ctx);
    return;
  }

  const sessions = await ctx.store.getLastSessionsByExercise();
  const today = ctx.store.getTodayDay();

  if (exercises.length > 12) el.appendChild(filterBox(el));

  for (const section of groupExercises(exercises)) {
    const heading = document.createElement('h2');
    heading.className = 'section-label group-heading';
    heading.dataset.group = section.name;
    heading.textContent = section.name;
    el.appendChild(heading);
    for (const ex of section.rows) el.appendChild(exerciseRow(ex, sessions[ex.id], today, section.name));
  }

  el.appendChild(addButton(ctx));
}

function exerciseRow(ex, last, today, groupName) {
  const row = document.createElement('button');
  row.className = 'list-row';
  row.dataset.name = ex.name.toLowerCase();
  row.dataset.group = groupName;

  const main = document.createElement('span');
  main.className = 'row-main';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = ex.name;
  main.appendChild(name);

  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.textContent = last ? `${formatDayLabel(last.day, today)} · ${sessionSummary(last.sets)}` : 'Not logged yet';
  main.appendChild(sub);
  row.appendChild(main);

  // Already trained today: mark it and recede it, but never reorder mid-workout
  // — rows moving under your thumb between sets is worse than scanning for them.
  const doneToday = Boolean(last && last.day === today);
  if (doneToday) {
    row.classList.add('done-today');
    row.dataset.done = 'true';
    // Stated as text inside the button rather than as an aria-label override:
    // overriding would replace the computed name and cost screen-reader users
    // the session summary that sighted users can read (F6, plan §13).
    const state = document.createElement('span');
    state.className = 'visually-hidden';
    state.textContent = ' — logged today';
    main.appendChild(state);
    const tick = document.createElement('span');
    tick.className = 'done-tick';
    tick.textContent = '✓';
    tick.setAttribute('aria-hidden', 'true');
    row.appendChild(tick);
  }
  row.addEventListener('click', () => { location.hash = `#/log/${ex.id}`; });
  return row;
}

// Filtering searches across every group and hides headings left with no
// visible rows, so an empty section never lingers above nothing (F5).
function filterBox(root) {
  const filter = document.createElement('input');
  filter.className = 'filter-input';
  filter.type = 'search';
  filter.placeholder = 'Filter exercises';
  filter.setAttribute('aria-label', 'Filter exercises');
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    const visibleByGroup = new Map();
    for (const row of root.querySelectorAll('.list-row[data-name]')) {
      const match = row.dataset.name.includes(q);
      row.style.display = match ? '' : 'none';
      if (match) visibleByGroup.set(row.dataset.group, true);
    }
    for (const heading of root.querySelectorAll('.group-heading')) {
      heading.style.display = visibleByGroup.has(heading.dataset.group) ? '' : 'none';
    }
  });
  return filter;
}

function backupBanner(ctx) {
  const banner = document.createElement('div');
  banner.className = 'backup-banner';
  const link = document.createElement('button');
  link.textContent = 'Backup recommended — Export';
  link.addEventListener('click', () => { location.hash = '#/settings'; });
  const dismiss = document.createElement('button');
  dismiss.setAttribute('aria-label', 'Dismiss backup reminder');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', async () => {
    await ctx.store.updateSettings({ backupBannerSnoozedAtMs: Date.now() });
    banner.remove();
  });
  banner.append(link, dismiss);
  return banner;
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

// New exercises are named first, then optionally categorised — keeping the
// common path one field long.
function addButton(ctx) {
  const btn = document.createElement('button');
  btn.className = 'btn-secondary';
  btn.textContent = '＋ Add exercise';
  btn.addEventListener('click', () => {
    // Mobile Safari does not consistently focus tapped buttons. Establish the
    // return point explicitly so the modal can restore keyboard/VoiceOver focus.
    btn.focus();
    promptSheet({
      title: 'New exercise',
      label: 'Exercise name',
      submitLabel: 'Add',
      async onSubmit(value) {
        // New exercises land Ungrouped; the group is assigned from Manage when
        // convenient. Prompting for it here would put a second modal in front of
        // the owner every time they add something.
        await ctx.store.addExercise(value);
        ctx.refresh();
      },
    });
  });
  return btn;
}
