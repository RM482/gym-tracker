// day.js — cross-exercise workout-day overview (plan §6.7, owner decision D3).

import { placeholder } from './components.js';
import { dayDurationMs, groupDaySets } from '../stats.js';
import { fmtSet } from './log.js';
import { openSetEditor } from './set-editor.js';

function shiftDay(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function dayLabel(day, today) {
  if (day === today) return 'Today';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

function timeLabel(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function plural(value, word) { return `${value} ${word}${value === 1 ? '' : 's'}`; }

function isValidDay(day) {
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

export async function render(el, { date }, ctx) {
  const today = ctx.store.getTodayDay();
  const selected = isValidDay(date) ? date : today;
  if (selected > today || selected !== date) {
    location.hash = `#/day/${today}`;
    return;
  }

  const nav = document.createElement('div');
  nav.className = 'screen-header day-nav';
  const back = document.createElement('button');
  back.className = 'icon-btn';
  back.setAttribute('aria-label', 'Back');
  back.textContent = '⌂';
  back.addEventListener('click', () => { location.hash = '#/'; });
  const previous = document.createElement('button');
  previous.className = 'icon-btn';
  previous.setAttribute('aria-label', 'Previous day');
  previous.textContent = '‹';
  previous.addEventListener('click', () => { location.hash = `#/day/${shiftDay(selected, -1)}`; });
  const title = document.createElement('h1');
  title.textContent = dayLabel(selected, today);
  const next = document.createElement('button');
  next.className = 'icon-btn';
  next.setAttribute('aria-label', 'Next day');
  next.textContent = '›';
  next.disabled = selected >= today;
  next.addEventListener('click', () => { location.hash = `#/day/${shiftDay(selected, 1)}`; });
  nav.append(back, previous, title, next);
  el.appendChild(nav);

  const sets = await ctx.store.getDaySets(selected);
  const groups = groupDaySets(sets);
  const duration = dayDurationMs(sets);
  const summary = document.createElement('p');
  summary.className = 'day-summary';
  summary.textContent = `${plural(groups.length, 'exercise')} · ${plural(sets.length, 'set')} · ${duration === null ? '—' : `${Math.round(duration / 60000)} min`}`;
  el.appendChild(summary);
  if (sets.length === 0) {
    el.appendChild(placeholder('No sets on this day.'));
    return;
  }

  const exercises = await ctx.store.listExercises({ includeArchived: true, order: 'manual' });
  const names = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));
  for (const group of groups) {
    const card = document.createElement('section');
    card.className = 'card day-card';
    const heading = document.createElement('h2');
    heading.textContent = names.get(group.exerciseId) ?? 'Unknown exercise';
    card.appendChild(heading);
    for (const set of group.sets) {
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
