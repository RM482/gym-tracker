// components.js — shared UI pieces: screen header, placeholder, toast.
// Public API: header(opts), placeholder(text), toast(message).

export function header({ title, back = null, actions = [] }) {
  const h = document.createElement('div');
  h.className = 'screen-header';
  if (back) {
    const b = document.createElement('button');
    b.className = 'icon-btn';
    b.setAttribute('aria-label', 'Back');
    b.textContent = '‹';
    b.addEventListener('click', () => { location.hash = back; });
    h.appendChild(b);
  }
  const t = document.createElement('h1');
  t.textContent = title;
  h.appendChild(t);
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.setAttribute('aria-label', a.label);
    btn.textContent = a.icon;
    btn.addEventListener('click', a.onTap);
    h.appendChild(btn);
  }
  return h;
}

export function placeholder(text) {
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = text;
  return p;
}

export function toast(message) {
  const region = document.getElementById('toast-region');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  region.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
