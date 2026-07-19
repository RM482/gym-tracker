// check-precache.mjs — fails when sw.js PRECACHE and the shell files on disk
// diverge in either direction (plan §14). Run via: npm run check:precache

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const listMatch = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!listMatch) {
  console.error('check-precache: could not find PRECACHE array in sw.js');
  process.exit(1);
}
const precache = [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

const SHELL_DIRS = ['css', 'js', 'icons'];
const SHELL_FILES = ['index.html', 'manifest.webmanifest'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(relative(root, p));
  }
  return out;
}

const onDisk = [...SHELL_FILES, ...SHELL_DIRS.flatMap((d) => walk(join(root, d)))].sort();

const missingFromPrecache = onDisk.filter((f) => !precache.includes(f));
const missingFromDisk = precache.filter((f) => !onDisk.includes(f));

if (missingFromPrecache.length || missingFromDisk.length) {
  if (missingFromPrecache.length) console.error('Not in sw.js PRECACHE:', missingFromPrecache);
  if (missingFromDisk.length) console.error('In PRECACHE but not on disk:', missingFromDisk);
  process.exit(1);
}
console.log(`check-precache: OK (${precache.length} files)`);
