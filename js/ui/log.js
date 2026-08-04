// log.js — the logging screen, heart of the app (plan §6.2).
// Composes the screen: header, Last-time card + collapsed Earlier line, Today
// card, the plateau nudge, and then the entry panel.
//
// The write controls themselves — steppers with pre-fill, the add-on toggle,
// the e1RM readout, "Save set", "↻ Same as last time" with the n+1 rule, and
// the typed/dictated quick entry — live in entry-panel.js, because the superset
// screen shows two of them at once and they must not be forked.

import { header, toast, formatDayLabel, menuSheet, fmtSet } from './components.js';
import { plateauNudge } from '../stats.js';
import { openSetEditor } from './set-editor.js';
import { renameExerciseFlow, muscleGroupSheet } from './exercise-actions.js';
import { buildEntryPanel } from './entry-panel.js';
import { pickExerciseSheet } from './exercise-picker.js';

function lastTimeLabel(day, today) {
  const label = formatDayLabel(day, today);
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  return diff >= 7 ? `${label} · ${diff} days ago` : label;
}

export async function render(el, { exerciseId }, ctx) {
  const ex = await ctx.store.getExercise(exerciseId);
  if (!ex || ex.archivedAtMs) {
    // Only the live render may redirect; a superseded one would yank the owner
    // off whichever screen they actually navigated to.
    if (ctx.isCurrent?.() !== false) {
      toast('That exercise is archived or was deleted');
      location.hash = '#/';
    }
    return;
  }

  el.appendChild(header({
    title: ex.name,
    back: '#/',
    actions: [
      // Rename and re-group without walking back to the main menu (owner
      // feedback). Shares one implementation with Manage via exercise-actions.
      {
        icon: '✎',
        label: 'Rename or group this exercise',
        onTap: () => menuSheet({
          title: ex.name,
          items: [
            { label: 'Rename', onTap: () => renameExerciseFlow(ex, ctx) },
            { label: `Muscle group: ${ex.muscleGroup ?? 'Ungrouped'}`, onTap: () => muscleGroupSheet(ex, ctx) },
          ],
        }),
      },
      { icon: '🕐', label: 'History', onTap: () => { location.hash = `#/history/${ex.id}`; } },
    ],
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

  // ---- Plateau nudge (D6) ----
  // Computed over completed sessions strictly before today, so a warm-up set
  // cannot hide it before today's real top set exists; it clears once beaten.
  // getRecentSessions returns newest-first; the streak walks chronologically.
  const nudge = plateauNudge([...sessions].reverse(), todaySets);
  if (nudge) {
    const banner = document.createElement('p');
    banner.className = 'nudge';
    banner.setAttribute('role', 'status');
    banner.textContent = `Top weight unchanged for ${nudge.sessions} sessions: ${nudge.weightKg} kg${nudge.addOn ? ' with the machine add-on' : ''}.`;
    el.appendChild(banner);
  }

  // ---- Entry controls ----
  // Every write control for this exercise lives in one panel, which owns the
  // steppers, the add-on toggle, the e1RM readout, quick entry and the single
  // duplicate-write guard shared by all of them. The superset screen builds two
  // of these, so the logic must not be duplicated here.
  el.appendChild(buildEntryPanel({ ex, prev, todaySets, settings, ctx }));

  // Supersets are started from inside one of the two exercises, because that is
  // where the owner is when they decide to pair it with something.
  const others = (await ctx.store.listExercises()).filter((x) => x.id !== ex.id);
  if (others.length > 0) el.appendChild(supersetButton(ex, others, settings, ctx));
}

// The partner list is grouped and foldable rather than a flat menu: with a real
// exercise list a flat sheet outgrew the screen and could not be scrolled
// (owner feedback, change set 4).
function supersetButton(ex, others, settings, ctx) {
  const btn = document.createElement('button');
  btn.className = 'btn-secondary';
  btn.textContent = '⇄ Superset with…';
  btn.addEventListener('click', () => {
    btn.focus();
    pickExerciseSheet({
      title: `Superset ${ex.name} with…`,
      exercises: others,
      collapsedGroups: settings.collapsedGroups,
      onPick: (other) => { location.hash = `#/superset/${ex.id}/${other.id}`; },
      onFoldChange: (groups) => { ctx.store.updateSettings({ collapsedGroups: groups }).catch(() => {}); },
    });
  });
  return btn;
}
