// home.js — exercise picker, the start screen (plan §6.1).
// Phase 0: header + placeholder. Exercise list arrives in Phase 2.

import { header, placeholder } from './components.js';

export function render(el) {
  el.appendChild(header({
    title: 'Gym Tracker',
    actions: [
      { icon: '☀', label: 'Today', onTap: () => { location.hash = `#/day/${new Date().toISOString().slice(0, 10)}`; } },
      { icon: '📈', label: 'Dashboard', onTap: () => { location.hash = '#/dashboard'; } },
      { icon: '✎', label: 'Manage exercises', onTap: () => { location.hash = '#/manage'; } },
      { icon: '⚙', label: 'Settings', onTap: () => { location.hash = '#/settings'; } },
    ],
  }));
  el.appendChild(placeholder('Your exercises will appear here (Phase 2).'));
}
