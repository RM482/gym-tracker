// day.js — cross-exercise day overview (plan §6.7, owner decision D3). Phase 5.

import { header, placeholder } from './components.js';

export function render(el, { date }) {
  el.appendChild(header({ title: 'Day overview', back: '#/' }));
  el.appendChild(placeholder(`Everything you trained on ${date} (Phase 5).`));
}
