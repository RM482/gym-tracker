// app.js — bootstrap, hash router, screen mounting, SW registration (plan §5, §14).
// Public API (for tests): parseRoute(hash) -> { screen, params } | null.
// Routes (plan §5): #/ #/log/<id> #/history/<id> #/day/<YYYY-MM-DD> #/dashboard #/manage #/settings
//
// Screens receive (el, params, ctx) where ctx = { store, refresh }.
// The database opens once at boot; open failure renders a plain-language
// error screen instead of a white page (plan §12; full recovery matrix in Phase 8).

import { openDb, deleteDb, DbBlockedError } from './db.js';
import { createStore } from './store.js';
import * as platform from './platform.js';
import * as home from './ui/home.js';
import * as log from './ui/log.js';
import * as history from './ui/history.js';
import * as day from './ui/day.js';
import * as dashboard from './ui/dashboard.js';
import * as manage from './ui/manage.js';
import * as settings from './ui/settings.js';
import { toast } from './ui/components.js';

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
let ctxPromise = null;
let renderSeq = 0;
let updateRequired = false;
let thisLoadFailureCount = null;

// Identifies "which screen, with which params" so a render that finished after
// the route moved on can be discarded rather than committed over the new screen.
export function routeKey(route) {
  return route ? `${route.screen}:${JSON.stringify(route.params)}` : '';
}

// A render may only commit its DOM if it is still the newest one, no blocking
// update has arrived, and the route has not changed underneath it. Screens are
// built detached and committed atomically, so a superseded render simply drops
// its work instead of appending a second copy over the live screen.
export function shouldCommitRender({ seq, currentSeq, updateRequired: blocked, key, currentKey }) {
  return seq === currentSeq && !blocked && key === currentKey;
}

// §10 protocol: another tab upgraded the app → this page must stop and reload.
function showUpdateOverlay() {
  updateRequired = true;
  renderSeq += 1; // cancel any screen that was still loading
  const el = document.getElementById('app');
  el.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  const heading = document.createElement('h1');
  heading.textContent = 'Update required';
  const message = document.createElement('p');
  message.textContent = 'The app was updated in another tab. Reload before logging anything else.';
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = 'Reload';
  btn.addEventListener('click', () => location.reload());
  card.append(heading, message);
  el.append(card, btn);
  btn.focus();
}

const OPEN_FAILURE_KEY = 'gym-tracker-open-failures';
export const RESET_PHRASE = 'RESET MY DATA';

export function canResetData(value) {
  return value.trim() === RESET_PHRASE;
}

function recordOpenFailure() {
  try {
    const count = Number.parseInt(sessionStorage.getItem(OPEN_FAILURE_KEY) ?? '0', 10) || 0;
    const next = count + 1;
    sessionStorage.setItem(OPEN_FAILURE_KEY, String(next));
    return next;
  } catch { return 1; }
}

function clearOpenFailures() {
  try { sessionStorage.removeItem(OPEN_FAILURE_KEY); } catch { /* unavailable storage is harmless */ }
}

function renderDbError(el, err, failureCount) {
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

  // A blocked upgrade has a known non-destructive fix. Only expose reset after
  // a different open failure has happened repeatedly in this browser session.
  if (!(err instanceof DbBlockedError) && failureCount >= 2) {
    const reveal = document.createElement('button');
    reveal.className = 'btn-secondary';
    reveal.textContent = 'Still can’t open it?';
    reveal.addEventListener('click', () => {
      reveal.remove();
      const reset = document.createElement('section');
      reset.className = 'card recovery-card';
      const resetHeading = document.createElement('h2');
      resetHeading.textContent = 'Last resort: reset local data';
      const warning = document.createElement('p');
      warning.textContent = 'First, locate your latest Gym Tracker backup in Files. Resetting permanently erases the workout data stored in this browser; you can import that backup after the app restarts.';
      const label = document.createElement('label');
      label.className = 'recovery-label';
      label.textContent = `Type ${RESET_PHRASE} to confirm`;
      const input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      const erase = document.createElement('button');
      erase.className = 'btn-primary btn-danger';
      erase.textContent = 'Erase local data and restart';
      erase.disabled = true;
      input.addEventListener('input', () => { erase.disabled = !canResetData(input.value); });
      erase.addEventListener('click', async () => {
        if (!canResetData(input.value)) return;
        erase.disabled = true;
        erase.textContent = 'Resetting…';
        try {
          await deleteDb();
          clearOpenFailures();
          location.reload();
        } catch {
          erase.textContent = 'Couldn’t reset — close other tabs and try again';
        }
      });
      label.appendChild(input);
      reset.append(resetHeading, warning, label, erase);
      el.appendChild(reset);
      input.focus();
    });
    el.appendChild(reveal);
  }
}

async function ensureCtx() {
  if (ctx) return ctx;
  if (!ctxPromise) {
    ctxPromise = openDb({ onVersionChange: showUpdateOverlay }).then((dbHandle) => {
      clearOpenFailures();
      ctx = { store: createStore({ dbHandle, platform }), refresh: render };
      return ctx;
    });
  }
  return ctxPromise;
}

async function render() {
  const el = document.getElementById('app');
  if (updateRequired) {
    showUpdateOverlay();
    return;
  }
  const route = parseRoute(location.hash);
  if (!route) {
    location.hash = '#/'; // unknown/stale route (plan §12)
    return;
  }
  const seq = ++renderSeq;
  const key = routeKey(route);
  try {
    await ensureCtx();
  } catch (err) {
    thisLoadFailureCount ??= recordOpenFailure();
    renderDbError(el, err, thisLoadFailureCount);
    return;
  }
  // Build detached. The live screen is never cleared until a render is ready to
  // commit, so overlapping renders cannot interleave their appends into #app.
  const container = document.createElement('div');
  await SCREENS[route.screen].render(container, route.params, ctx);
  if (!shouldCommitRender({
    seq, currentSeq: renderSeq, updateRequired, key, currentKey: routeKey(parseRoute(location.hash)),
  })) return;
  // Move the children rather than the container itself: #app > .btn-primary and
  // friends are direct-child selectors that a wrapper element would break.
  el.replaceChildren(...container.childNodes);
  // A version change can arrive while a screen is awaiting data. Keep the
  // blocking reload message authoritative even if that render then completes.
  if (updateRequired) showUpdateOverlay();
}

// Returning to the app fires focus and visibilitychange together; collapse the
// burst into one refresh. hashchange stays immediate so navigation feels instant.
let refreshScheduled = false;
function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  setTimeout(() => { refreshScheduled = false; render(); }, 0);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Skip SW during local development so edits show up immediately;
  // append ?sw=on to test SW behaviour locally (plan §14, browser test B6).
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocal && !location.search.includes('sw=on')) return;
  let reloading = false;
  let updateOffered = false;
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // clients.claim() also fires this on the very first install. There is no
    // newer shell to load in that case, and reloading can interrupt the page.
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((registration) => {
    const offerUpdate = (worker) => {
      if (updateOffered) return;
      updateOffered = true;
      toast('Update available', {
        durationMs: 60000,
        actionLabel: 'Restart',
        onAction: () => worker.postMessage('skip-waiting'),
      });
    };
    if (registration.waiting) offerUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
  }).catch(() => { /* offline/unsupported registration failure is non-fatal */ });
}

// Bootstrap only in a real page (unit tests import parseRoute without a DOM).
if (typeof document !== 'undefined' && document.getElementById('app')) {
  window.addEventListener('hashchange', render);
  window.addEventListener('focus', scheduleRefresh);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleRefresh(); });
  render();
  registerServiceWorker();
}
