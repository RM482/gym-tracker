// app.js — bootstrap, hash router, screen mounting, SW registration (plan §5, §14).
// Public API (for tests): parseRoute(hash) -> { screen, params } | null.
// Routes (plan §5): #/ #/log/<id> #/history/<id> #/day/<YYYY-MM-DD> #/dashboard #/manage #/settings

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

function render() {
  const el = document.getElementById('app');
  const route = parseRoute(location.hash);
  if (!route) {
    // Unknown/stale route (plan §12): go home.
    location.hash = '#/';
    return;
  }
  el.innerHTML = '';
  SCREENS[route.screen].render(el, route.params);
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
