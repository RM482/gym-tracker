// home.js — exercise picker, the start screen (plan §6.1).
// Grouped by muscle group (D8), most-recently-used first within each group,
// with exercises already logged today marked so the owner can see what is left
// (D-item 3). Empty state offers starter chips (D2); a filter box appears past
// 12 exercises; the backup reminder follows plan §6.1 timing. Sections fold
// away with a ▸/▾ arrow, remembered between visits (change set 3).

import { header, formatDayLabel, sessionSummary } from './components.js';
import { exerciseAddSheet } from './exercise-actions.js';
import { MUSCLE_GROUPS, UNGROUPED_KEY as UNGROUPED, isBackupOverdue } from '../store.js';

const STARTERS = ['Bench press', 'Squat', 'Deadlift', 'Overhead press', 'Row', 'Lat pulldown', 'Leg press', 'Biceps curl'];

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

  // The filter input must sit above the sections, but it is wired to the row and
  // heading elements themselves (not a DOM query): app.js builds each screen in a
  // detached container and then MOVES its children into #app, so any element the
  // handler looked up by re-querying that container would come back empty.
  const filterInput = exercises.length > 12 ? filterBox() : null;
  if (filterInput) el.appendChild(filterInput);

  // Folding (owner feedback: "so I don't have a massive list"). The collapsed
  // set is a local copy of the stored preference so a tap paints instantly and
  // the write happens behind it.
  const collapsed = new Set(settings.collapsedGroups);

  const rows = [];
  const headings = [];
  for (const section of groupExercises(exercises)) {
    const heading = groupHeading(section, collapsed, ctx, () => applyVisibility());
    el.appendChild(heading.el);
    headings.push(heading);
    for (const ex of section.rows) {
      const row = exerciseRow(ex, sessions[ex.id], today, section.name);
      el.appendChild(row);
      rows.push(row);
    }
  }

  // ONE calculation owns every row's visibility. Folding and filtering both
  // write row.style.display, so giving each its own handler would let them
  // overwrite each other — a fresh way to reintroduce the change-set-2 filter
  // regression. Both call this instead.
  const applyVisibility = () => {
    const q = filterInput ? filterInput.value.trim().toLowerCase() : '';
    const filtering = q.length > 0;
    const groupsWithMatches = new Set();
    for (const row of rows) {
      const matches = row.dataset.name.includes(q);
      if (matches) groupsWithMatches.add(row.dataset.group);
      // While filtering, a match shows even inside a folded section: a search
      // that silently skipped folded groups would be worse than no search.
      const hidden = !matches || (!filtering && collapsed.has(row.dataset.group));
      row.style.display = hidden ? 'none' : '';
    }
    for (const heading of headings) {
      heading.el.style.display = !filtering || groupsWithMatches.has(heading.group) ? '' : 'none';
      heading.paint(filtering);
    }
  };

  if (filterInput) filterInput.addEventListener('input', applyVisibility);
  applyVisibility();
  el.appendChild(addButton(ctx));
}

// A group heading that folds its rows away. The arrow is decorative; the state
// is carried by aria-expanded so it is announced rather than only drawn (the
// same reasoning as the F6 fix, where an aria-label override was removed
// because it destroyed the computed name).
function groupHeading(section, collapsed, ctx, onToggle) {
  const el = document.createElement('h2');
  el.className = 'section-label group-heading';
  el.dataset.group = section.name;

  const btn = document.createElement('button');
  btn.className = 'group-toggle';
  btn.dataset.group = section.name;
  const arrow = document.createElement('span');
  arrow.className = 'group-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = `${section.name} (${section.rows.length})`;
  btn.append(arrow, label);
  el.appendChild(btn);

  // While a filter is active every section is forced open, so the control
  // reports the state the owner can actually see, not the stored one.
  const paint = (filtering = false) => {
    const open = filtering || !collapsed.has(section.name);
    btn.setAttribute('aria-expanded', String(open));
    arrow.textContent = open ? '▾' : '▸';
  };
  paint();

  btn.addEventListener('click', () => {
    if (collapsed.has(section.name)) collapsed.delete(section.name);
    else collapsed.add(section.name);
    onToggle();
    // Persisted so the list stays as short as the owner left it. updateSettings
    // does not touch lastDataChangeAtMs, so folding correctly does not count as
    // a data change and cannot trigger the backup reminder.
    ctx.store.updateSettings({ collapsedGroups: [...collapsed] }).catch(() => {});
  });

  return { el, group: section.name, paint };
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

function filterBox() {
  const filter = document.createElement('input');
  filter.className = 'filter-input';
  filter.type = 'search';
  filter.placeholder = 'Filter exercises';
  filter.setAttribute('aria-label', 'Filter exercises');
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

// Adding from Home goes straight into the new exercise's logging screen: the
// owner adds an exercise at the gym in order to log it, and being returned to
// this list meant finding it again first. The group is set in the same sheet.
// (Manage's add deliberately stays put — see manage.js.)
function addButton(ctx) {
  const btn = document.createElement('button');
  btn.className = 'btn-secondary';
  btn.textContent = '＋ Add exercise';
  btn.addEventListener('click', () => {
    // Mobile Safari does not consistently focus tapped buttons. Establish the
    // return point explicitly so the modal can restore keyboard/VoiceOver focus.
    btn.focus();
    exerciseAddSheet(ctx, {
      // The hash change re-renders on its own; no ctx.refresh() needed here.
      onAdded(ex) { location.hash = `#/log/${ex.id}`; },
    });
  });
  return btn;
}
