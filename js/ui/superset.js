// superset.js — two exercises logged on one screen (owner feedback: "I do
// supersets… now I have to go back and forward between exercises in between
// reps to record weight changes").
//
// Stacked panels rather than a side-by-side split: on an iPhone two columns
// would halve the stepper buttons, which are the controls most used mid-set.
// Each panel is the same entry-panel.js used by the normal logging screen, in
// compact mode (no quick-entry sentence box — that is a plan-several-sets tool,
// not what supersetting mid-round needs, and it is bulky twice over).
//
// The pair is ad-hoc and lives in the route (#/superset/<idA>/<idB>): the owner
// picks a partner fresh each session, so nothing is stored, no pairs need
// managing, and iOS restoring the app to its last hash restores the pair.
//
// Panel headings are NOT links to the full logging screen: that screen's back
// button always goes Home, so tapping through would strand the owner with no
// route back to the superset. Rename/archive stay out for the same reason —
// they are one tap away on the full screen.

import { header, placeholder, toast, formatDayLabel, fmtSet } from './components.js';
import { plateauNudge } from '../stats.js';
import { buildEntryPanel } from './entry-panel.js';

export async function render(el, { aId, bId }, ctx) {
  const [a, b] = await Promise.all([ctx.store.getExercise(aId), ctx.store.getExercise(bId)]);
  const usable = (x) => Boolean(x && !x.archivedAtMs);

  // Either exercise may have been archived or deleted since the route was made
  // — including from another screen in this same session. Never leave a
  // half-dead superset standing. Only the live render may redirect or toast; a
  // superseded one would yank the owner off whatever they actually opened.
  if (!usable(a) || !usable(b)) {
    if (ctx.isCurrent?.() !== false) {
      const survivor = usable(a) ? a : usable(b) ? b : null;
      if (survivor) {
        toast('The other exercise is archived or was deleted');
        location.hash = `#/log/${survivor.id}`;
      } else {
        toast('Those exercises are archived or were deleted');
        location.hash = '#/';
      }
    }
    return;
  }

  el.appendChild(header({
    title: 'Superset',
    back: `#/log/${a.id}`,
    actions: [
      { icon: '⇄', label: 'Swap which exercise is on top', onTap: () => { location.hash = `#/superset/${b.id}/${a.id}`; } },
    ],
  }));

  const today = ctx.store.getTodayDay();
  const settings = await ctx.store.getSettings();

  for (const ex of [a, b]) {
    el.appendChild(await panelFor(ex, today, settings, ctx));
  }
}

async function panelFor(ex, today, settings, ctx) {
  const section = document.createElement('section');
  section.className = 'card superset-panel';
  section.dataset.exercise = ex.name;

  const heading = document.createElement('h2');
  heading.textContent = ex.name;
  section.appendChild(heading);

  const sessions = await ctx.store.getRecentSessions(ex.id, 3);
  const todaySets = await ctx.store.getTodaySets(ex.id);
  const prev = sessions[0] ?? null;

  // The two cards of the full screen compress to two lines here; the point of
  // this screen is the controls, not the history.
  const last = document.createElement('p');
  last.className = 'sub sets-line';
  last.textContent = prev
    ? `Last (${formatDayLabel(prev.day, today)}): ${prev.sets.map(fmtSet).join(' · ')}`
    : 'First time — log your opening set.';
  section.appendChild(last);

  if (todaySets.length > 0) {
    const line = document.createElement('p');
    line.className = 'sets-line superset-today';
    line.textContent = `Today — ${todaySets.length} set${todaySets.length === 1 ? '' : 's'}: ${todaySets.map(fmtSet).join(' · ')}`;
    section.appendChild(line);
  } else {
    section.appendChild(placeholder('No sets today yet.'));
  }

  const nudge = plateauNudge([...sessions].reverse(), todaySets);
  if (nudge) {
    const banner = document.createElement('p');
    banner.className = 'nudge';
    banner.setAttribute('role', 'status');
    banner.textContent = `Top weight unchanged for ${nudge.sessions} sessions: ${nudge.weightKg} kg${nudge.addOn ? ' with the machine add-on' : ''}.`;
    section.appendChild(banner);
  }

  // Its own panel, and therefore its own write guard. Correct here: the two
  // panels write to different exercises, so they cannot duplicate each other,
  // and a shared guard would let saving one disable the other's Save button —
  // precisely the wrong coupling in a superset.
  section.appendChild(buildEntryPanel({ ex, prev, todaySets, settings, ctx, compact: true }));
  return section;
}
