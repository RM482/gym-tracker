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

## Recover when the app cannot open its data

1. Tap **Try again** and close any other Gym Tracker tabs if the app asks you to.
2. A destructive reset is deliberately hidden until a non-blocking open error repeats.
3. Before resetting, locate the newest `gym-tracker-backup-*.json` in Files.
4. Expand **Still can’t open it?**, type the exact confirmation phrase, and reset.
5. After restart, open Settings → **Import backup**.

Reset deletes only this browser's Gym Tracker database. It cannot recover data that was never exported, so it is a last resort.

## Verify an update on iPhone

1. Keep the installed app open on the old release while a new cache version is deployed.
2. Bring the app online and reopen it. Tap **Restart** in the update notice.
3. Confirm the app reloads, existing exercises and sets remain, then switch to airplane mode and reload once more.

## Roll back a bad deploy

`git revert` the bad commit (keeps history), bump `CACHE_VERSION` again, push.

**Never roll `DB_VERSION` backwards.** A database upgrade is one-way: once a phone has opened the app at a newer schema version, its stored data is at that version permanently. Deploying code with a lower `DB_VERSION` makes every upgraded device fail to open its data (`VersionError`). If a release that raised `DB_VERSION` turns out to be bad, revert the *behaviour* but keep `DB_VERSION` at the new number and keep the migration and readers in place. The app now recognises this situation and tells the owner to reload rather than offering to erase anything — but the deploy is still broken for them until fixed, so check `DB_VERSION` before pushing any revert.

## Repository safety

GitHub account: keep 2-factor authentication on; the `main` branch is the deployed app.
