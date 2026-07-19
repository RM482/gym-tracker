// dashboard.js — progress charts, PRs, consistency (plan §6.4). Phase 6.

import { header, placeholder } from './components.js';

export function render(el) {
  el.appendChild(header({ title: 'Progress', back: '#/' }));
  el.appendChild(placeholder('Charts and personal records (Phase 6).'));
}
