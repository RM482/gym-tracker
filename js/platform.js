// platform.js — thin adapters around browser APIs (plan §5 A11).
// Public API: now(), uuid(), tzOffsetMin(), requestPersist(), canShare(),
//             shareFile(file), downloadFile(file)
// Everything the rest of the app needs from the platform goes through here so
// tests can inject fakes. No DOM access in this module.

export function now() {
  return Date.now();
}

export function uuid() {
  return crypto.randomUUID();
}

// Minutes east of UTC for a given epoch-ms moment (default: now).
export function tzOffsetMin(atMs = Date.now()) {
  return -new Date(atMs).getTimezoneOffset();
}

// Best-effort persistent storage (plan §9). Returns "granted" | "denied" | "unsupported".
let persistRequest = null;
export async function requestPersist() {
  if (!navigator.storage || !navigator.storage.persist) return 'unsupported';
  persistRequest ??= navigator.storage.persist().then((granted) => granted ? 'granted' : 'denied');
  return persistRequest;
}

export async function persistenceStatus() {
  if (!navigator.storage || !navigator.storage.persisted) return 'unsupported';
  return (await navigator.storage.persisted()) ? 'granted' : 'not granted';
}

export function canShare(file) {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

export async function shareFile(file) {
  await navigator.share({ files: [file] });
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
