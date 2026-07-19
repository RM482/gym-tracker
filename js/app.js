// app.js — bootstrap, hash router, screen mounting, SW registration (plan §5, §14).
// Public API (for tests): parseRoute(hash) -> { screen, params } | null.
// Routes (plan §5): #/ #/log/<id> #/history/<id> #/day/<YYYY-MM-DD> #/dashboard #/manage #/settings
//
// Screens receive (el, params, ctx) where ctx = { store, refresh }.
// The database opens once at boot; open failure renders a plain-language
// error screen instead of a white page (plan §12; full recovery matrix in Phase 8).

import { openDb, DbBlockedError } from './db.js';
import { createStore } from './store.js';
import * as platform from './platform.js';
import * as home from './ui/home.js';
import * as log from './ui/log.js';
import * as history from './ui/history.js';
import * as day from './ui/day.js';
import * as dashboard from './ui/dashboard.js';
import * as manage from './ui/manage.js';
import * as settings from './ui/settings.js';

const SCREENS = { home, log, history, day, dashboard, manage, settings };

export function parseRoute(hash) {
  const path = (hash || '#/').replace(/^#/, '');
  if (path === '/' || path === '') return { screen: 'home', params: {} };
  let m;
  if ((m = path.match(/^\/log\/([\w-]+)$/))) return { screen: 'log', params: { exerciseId: m[1] } };
  if ((m = path.match(/^\/history\/([\w-]+)$/))) return { screen: 'history', params: { exerciseId: m[1] } };
  if ((m = path.match(/^\/day\/(\d{4}-\d{2}-\d{2})$/))) return { screen: 'day', params: { date: m[1] } };
  if (path === '/dashboard') return { screen: 'dashboard', params: {} };
  if (path === '/manage') return { screen: 'manage', params: {} };
  if (path === '/settings') return { screen: 'settings', params: {} };
  return null;
}

let ctx = null;
let renderSeq = 0;

// §10 protocol: another tab upgraded the app → this page must stop and reload.
function showUpdateOverlay() {
  const el = document.getElementById('app');
  el.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card placeholder';
  card.textContent = 'The app was updated in another tab. ';
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = 'Reload';
  btn.addEventListener('click', () => location.reload());
  el.append(card, btn);
}

function renderDbError(el, err) {
  el.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  const h = document.createElement('h1');
  h.textContent = 'Can’t open your data';
  const p = document.createElement('p');
  p.textContent = err instanceof DbBlockedError
    ? 'Another tab or window of this app is in the way. Close other tabs of Gym Tracker, then try again.'
    : 'Your workout data couldn’t be opened. This is usually temporary — try again. Your data has not been changed.';
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = 'Try again';
  btn.addEventListener('click', () => location.reload());
  card.append(h, p);
  el.append(card, btn);
}

async function ensureCtx() {
  if (ctx) return ctx;
  const dbHandle = await openDb({ onVersionChange: showUpdateOverlay });
  ctx = { store: createStore({ dbHandle, platform }), refresh: render };
  return ctx;
}

async function render() {
  const el = document.getElementById('app');
  const route = parseRoute(location.hash);
  if (!route) {
    location.hash = '#/'; // unknown/stale route (plan §12)
    return;
  }
  const seq = ++renderSeq;
  try {
    await ensureCtx();
  } catch (err) {
    renderDbError(el, err);
    return;
  }
  if (seq !== renderSeq) return; // a newer navigation superseded this render
  el.innerHTML = '';
  await SCREENS[route.screen].render(el, route.params, ctx);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Skip SW during local development so edits show up immediately;
  // append ?sw=on to test SW behaviour locally (plan §14, browser test B6).
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocal && !location.search.includes('sw=on')) return;
  navigator.serviceWorker.register('sw.js');
}

// Bootstrap only in a real page (unit tests import parseRoute without a DOM).
if (typeof document !== 'undefined' && document.getElementById('app')) {
  window.addEventListener('hashchange', render);
  render();
  registerServiceWorker();
}
