// history.js — per-exercise history (plan §6.3). Phase 5.

import { header, placeholder } from './components.js';

export function render(el, { exerciseId }) {
  el.appendChild(header({ title: 'History', back: '#/' }));
  el.appendChild(placeholder(`History for exercise ${exerciseId} (Phase 5).`));
}
