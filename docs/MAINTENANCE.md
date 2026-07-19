# Maintenance recipes

Plain-language how-tos for changing this app safely (plan §18 R18). Expanded as the build progresses; each recipe is verified before Phase 8 exits.

## Make any code change

1. Edit the file(s).
2. Bump `CACHE_VERSION` in `sw.js` (same commit — phones cache the app by this name).
3. `npm test && npm run check:precache && npm run test:browser`
4. Commit and push. GitHub Pages redeploys automatically; phones show "Update available — Restart" on next online open.

## Add a shell file (new JS/CSS/icon)

Add the file, add its path to `PRECACHE` in `sw.js`, bump `CACHE_VERSION`. `npm run check:precache` fails until the list is right.

## Add a data field / change the schema (from v2 on)

1. Increase `DB_VERSION` in `js/db.js` by 1.
2. Add a migration step `{ structural, records }` for the old→new transition (plan §10).
3. Required tests: a fixture test for the record transform AND a DB-level upgrade test from a version-fixture database. The first real migration must add these — no placeholder migrations.
4. Bump `CACHE_VERSION`; ship code + DB version together in one commit.

## Restore data (new phone / after reset)

Install the PWA → Settings → Import backup → pick the latest `gym-tracker-backup-*.json` from iCloud Files.

## Roll back a bad deploy

`git revert` the bad commit (keeps history), bump `CACHE_VERSION` again, push.

## Repository safety

GitHub account: keep 2-factor authentication on; the `main` branch is the deployed app.
