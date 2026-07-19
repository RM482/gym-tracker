// manage.js — add/rename/archive/delete/reorder exercises (plan §6.5). Phase 2.

import { header, placeholder } from './components.js';

export function render(el) {
  el.appendChild(header({ title: 'Manage exercises', back: '#/' }));
  el.appendChild(placeholder('Add and organise exercises (Phase 2).'));
}
