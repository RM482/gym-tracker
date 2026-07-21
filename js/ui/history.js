// history.js — reverse-chronological per-exercise sessions (plan §6.3).

import { header, placeholder, sessionSummary, toast } from './components.js';
import { fmtSet } from './log.js';
import { openSetEditor } from './set-editor.js';

function fullDate(day) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function timeLabel(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export async function render(el, { exerciseId }, ctx) {
  const exercise = await ctx.store.getExercise(exerciseId);
  if (!exercise) {
    if (ctx.isCurrent?.() !== false) {
      toast('That exercise was deleted');
      location.hash = '#/';
    }
    return;
  }
  el.appendChild(header({ title: exercise.name, back: exercise.archivedAtMs ? '#/' : `#/log/${exercise.id}` }));
  const sets = await ctx.store.getSetsForExercise(exercise.id);
  if (sets.length === 0) {
    el.appendChild(placeholder('No sets logged yet.'));
    return;
  }

  const byDay = new Map();
  for (const set of sets) {
    if (!byDay.has(set.workoutDay)) byDay.set(set.workoutDay, []);
    byDay.get(set.workoutDay).push(set);
  }
  for (const [day, daySets] of [...byDay].sort(([a], [b]) => b.localeCompare(a))) {
    const card = document.createElement('section');
    card.className = 'card history-card';
    const dayLink = document.createElement('button');
    dayLink.className = 'history-day-link';
    dayLink.textContent = `${fullDate(day)} — ${sessionSummary(daySets)}`;
    dayLink.addEventListener('click', () => { location.hash = `#/day/${day}`; });
    card.appendChild(dayLink);
    for (const set of [...daySets].reverse()) {
      const row = document.createElement('button');
      row.className = 'set-row';
      row.setAttribute('aria-label', `Edit ${fmtSet(set)} at ${timeLabel(set.performedAtMs)}`);
      row.innerHTML = `<span>${timeLabel(set.performedAtMs)}</span><strong>${fmtSet(set)}</strong>`;
      row.addEventListener('click', () => openSetEditor(set, ctx));
      card.appendChild(row);
    }
    el.appendChild(card);
  }
}
