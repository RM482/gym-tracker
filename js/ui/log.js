// log.js — the logging screen, heart of the app (plan §6.2).
// Phase 0: header + placeholder. Real logging UI arrives in Phase 3.

import { header, placeholder } from './components.js';

export function render(el, { exerciseId }) {
  el.appendChild(header({ title: 'Log', back: '#/' }));
  el.appendChild(placeholder(`Logging for exercise ${exerciseId} (Phase 3).`));
}
