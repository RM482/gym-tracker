// Change set 1 features: muscle-group sections, done-today marking, the
// machine add-on toggle, and the plateau nudge.

import { test, expect } from '@playwright/test';

// Change set 3: adding from Home now lands on the new exercise's logging
// screen, so this helper walks back to Home to leave the caller where it was.
async function addExercise(page, name) {
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('.sheet input').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('button[aria-label="Back"]').click();
}

async function setGroup(page, exercise, group) {
  await page.getByRole('button', { name: 'Manage exercises' }).click();
  await page.getByRole('button', { name: `Options for ${exercise}` }).click();
  await page.getByRole('button', { name: /^Muscle group:/ }).click();
  await page.locator('.sheet').getByRole('button', { name: group, exact: true }).click();
  await page.locator('button[aria-label="Back"]').click();
}

test('exercises group by muscle, ungrouped last, and filtering hides empty headings', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await addExercise(page, 'Cable row');
  await addExercise(page, 'Weird machine');

  await setGroup(page, 'Bench press', 'Chest');
  await setGroup(page, 'Cable row', 'Back');

  // Sections appear in taxonomy order, with never-assigned exercises last.
  // Change set 3 added the fold arrow and a count to each heading.
  const headings = await page.locator('.group-toggle').allTextContents();
  expect(headings).toEqual(['▾Chest (1)', '▾Back (1)', '▾Ungrouped (1)']);
  await expect(page.locator('.list-row', { hasText: 'Weird machine' })).toBeVisible();

  // Manage stays a flat list (grouped sections would fight the up/down order),
  // showing the group as secondary text.
  await page.getByRole('button', { name: 'Manage exercises' }).click();
  await expect(page.locator('.group-heading')).toHaveCount(0);
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toContainText('Chest');
  await expect(page.locator('.list-row', { hasText: 'Weird machine' })).toContainText('Ungrouped');
});

test('the home filter box appears past 12 exercises and narrows the list', async ({ page }) => {
  await page.goto('/');
  // Seed 13 exercises straight into the store so the filter box (shown only past
  // 12) actually appears — the path the detached-container render once broke.
  await page.evaluate(async () => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    const store = createStore({ dbHandle: db, platform });
    const names = ['Bench press', 'Squat', 'Deadlift', 'Overhead press', 'Row',
      'Lat pulldown', 'Leg press', 'Biceps curl', 'Triceps pushdown', 'Calf raise',
      'Plank', 'Face pull', 'Hip thrust'];
    for (const name of names) await store.addExercise(name);
    db.close();
  });
  await page.reload();

  const filter = page.getByLabel('Filter exercises');
  await expect(filter).toBeVisible();
  await filter.fill('squat');
  await expect(page.locator('.list-row', { hasText: 'Squat' })).toBeVisible();
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toBeHidden();
  // Clearing the box brings the whole list back.
  await filter.fill('');
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toBeVisible();
});

// Change set 3: "I need to be able to fold in groups (with a little arrow) so I
// don't have a massive list."
test('groups fold away, stay folded across a reload, and never hide a filter match', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    const store = createStore({ dbHandle: db, platform });
    // 13 exercises so the filter box appears too, and two real groups.
    const seed = [['Bench press', 'Chest'], ['Cable fly', 'Chest'], ['Squat', 'Legs'],
      ['Leg press', 'Legs'], ['Calf raise', 'Legs'], ['Deadlift', null], ['Row', null],
      ['Lat pulldown', null], ['Biceps curl', null], ['Plank', null], ['Face pull', null],
      ['Hip thrust', null], ['Shrug', null]];
    for (const [name, muscleGroup] of seed) await store.addExercise(name, { muscleGroup });
    db.close();
  });
  await page.reload();

  const legs = page.locator('.group-toggle', { hasText: 'Legs' });
  await expect(legs).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.list-row', { hasText: 'Leg press' })).toBeVisible();

  // Fold Legs: its three rows go, the other groups are untouched.
  await legs.click();
  await expect(legs).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.list-row', { hasText: 'Leg press' })).toBeHidden();
  await expect(page.locator('.list-row', { hasText: 'Calf raise' })).toBeHidden();
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toBeVisible();
  await expect(legs).toContainText('Legs (3)');

  // Remembered between visits — the whole point of the request.
  await page.reload();
  await expect(page.locator('.group-toggle', { hasText: 'Legs' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.list-row', { hasText: 'Leg press' })).toBeHidden();

  // A filter match inside a folded group must still show, or search would
  // silently skip folded sections.
  const filter = page.getByLabel('Filter exercises');
  await filter.fill('leg');
  await expect(page.locator('.list-row', { hasText: 'Leg press' })).toBeVisible();
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toBeHidden();

  // Clearing the filter restores the fold rather than leaving it open.
  await filter.fill('');
  await expect(page.locator('.list-row', { hasText: 'Leg press' })).toBeHidden();
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toBeVisible();

  // Unfolding brings them back and is likewise remembered.
  await page.locator('.group-toggle', { hasText: 'Legs' }).click();
  await expect(page.locator('.list-row', { hasText: 'Leg press' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.list-row', { hasText: 'Leg press' })).toBeVisible();
});

// Returning to the app fires focus and visibilitychange, which re-render Home.
// The fold state is stored, not held in the render closure, so it must survive.
test('fold state survives a background refresh', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await page.locator('.group-toggle', { hasText: 'Ungrouped' }).click();
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toBeHidden();

  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(250);
  await expect(page.locator('.group-toggle', { hasText: 'Ungrouped' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toBeHidden();
});

test('an exercise can be renamed and grouped from its own entry screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await page.locator('.list-row', { hasText: 'Bench press' }).click();

  // Rename without walking back to the main menu.
  await page.getByRole('button', { name: 'Rename or group this exercise' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Rename', exact: true }).click();
  await page.locator('.sheet input').fill('Incline press');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.screen-header h1')).toHaveText('Incline press');

  // Group it from the same screen.
  await page.getByRole('button', { name: 'Rename or group this exercise' }).click();
  await page.getByRole('button', { name: /^Muscle group:/ }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Chest', exact: true }).click();

  // Back on Home it now sits under the Chest heading, with its new name.
  await page.locator('button[aria-label="Back"]').click();
  await expect(page.locator('.group-heading', { hasText: 'Chest' })).toBeVisible();
  await expect(page.locator('.list-row', { hasText: 'Incline press' })).toBeVisible();
});

test('the entry screen shows a live estimated 1-rep max and compares it to last time', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();

  // Seed a previous session: best set 60×5 → Epley 70 kg.
  const exerciseId = await page.evaluate(async () => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    const store = createStore({ dbHandle: db, platform });
    const [ex] = await store.listExercises();
    await store.addSet({ exerciseId: ex.id, weightKg: 60, reps: 5, performedAtMs: Date.now() - 3 * 86400000 });
    db.close();
    return ex.id;
  });

  await page.goto(`/#/log/${exerciseId}`);
  const readout = page.locator('.e1rm-readout');
  // A heavier-but-fewer set (80×3 → Epley 88) reads as stronger than last time.
  await page.getByLabel('Weight in kilograms').fill('80');
  await page.getByLabel('Repetitions').fill('3');
  await expect(readout).toContainText('Est. 1-rep max ≈ 88 kg');
  await expect(readout).toContainText('stronger than last time');
  // A lighter set that estimates below last time's best is flagged as such.
  await page.getByLabel('Weight in kilograms').fill('50');
  await page.getByLabel('Repetitions').fill('5');
  await expect(readout).toContainText('below last time');
});

test('exercises logged today are marked so the remaining ones stand out', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await addExercise(page, 'Squat');

  await page.locator('.list-row', { hasText: 'Bench press' }).click();
  await page.getByLabel('Weight in kilograms').fill('40');
  await page.getByRole('button', { name: 'Save set' }).click();
  await expect(page.getByText('Today — 1 set')).toBeVisible();
  await page.locator('button[aria-label="Back"]').click();

  const done = page.locator('.list-row[data-done="true"]');
  await expect(done).toHaveCount(1);
  await expect(done).toContainText('Bench press');
  // The state is in the accessible name, not colour or an icon alone.
  await expect(done).toContainText('logged today');
  // The session summary stays in the accessible name (not replaced by a label).
  await expect(done).toContainText('Today');
  await expect(page.locator('.list-row', { hasText: 'Squat' })).not.toHaveAttribute('data-done', 'true');
});

test('machine add-on is recorded, badged, and never folded into the weight', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Leg press' }).click();
  await page.locator('.list-row', { hasText: 'Leg press' }).click();

  await page.getByLabel('Weight in kilograms').fill('50');
  const toggle = page.getByRole('button', { name: /Machine add-on/ });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save set' }).click();

  // Badged in Today, and the recorded weight is untouched.
  await expect(page.locator('.set-row', { hasText: '50 kg × 8 +on' })).toHaveCount(1);

  // The toggle state carries to the next set, and can be turned back off.
  await expect(page.getByRole('button', { name: /Machine add-on/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Machine add-on/ }).click();
  await page.getByRole('button', { name: 'Save set' }).click();
  await expect(page.getByText('Today — 2 sets')).toBeVisible();
  // Exactly one of the two sets carries the badge; both recorded 50 kg.
  await expect(page.locator('.set-row')).toHaveCount(2);
  await expect(page.locator('.set-row', { hasText: '+on' })).toHaveCount(1);

  // Dashboard discloses that the unknown add-on weight is excluded.
  await page.locator('button[aria-label="Back"]').click();
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.locator('.addon-caveat')).toContainText('not included');
});

test('the plateau nudge appears after three identical sessions and clears when beaten', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();

  // Seed three earlier workout days at the same top weight, straight into the
  // database so the sessions are genuinely in the past.
  const exerciseId = await page.evaluate(async () => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    const store = createStore({ dbHandle: db, platform });
    const [ex] = await store.listExercises();
    const DAY = 86400000;
    for (const daysAgo of [9, 6, 3]) {
      await store.addSet({ exerciseId: ex.id, weightKg: 60, reps: 8, performedAtMs: Date.now() - daysAgo * DAY });
    }
    db.close();
    return ex.id;
  });

  await page.goto(`/#/log/${exerciseId}`);
  const nudge = page.locator('.nudge');
  await expect(nudge).toContainText('unchanged for 3 sessions');
  await expect(nudge).toContainText('60 kg');

  // Matching the plateau today does not clear it.
  await page.getByLabel('Weight in kilograms').fill('60');
  await page.getByRole('button', { name: 'Save set' }).click();
  // Wait for the post-save re-render to commit before touching the inputs
  // again. Saving disables the button and re-renders asynchronously, so typing
  // into the outgoing DOM would be discarded and the next tap would re-save the
  // pre-filled weight instead — an intermittent failure this test hit for real.
  await expect(page.getByRole('heading', { name: /^Today — 1 set$/ })).toBeVisible();
  await expect(page.locator('.nudge')).toBeVisible();

  // Beating it does.
  await page.getByLabel('Weight in kilograms').fill('62.5');
  await page.getByRole('button', { name: 'Save set' }).click();
  await expect(page.getByRole('heading', { name: /^Today — 2 sets$/ })).toBeVisible();
  await expect(page.locator('.nudge')).toHaveCount(0);
});

test('the Progress tab has a search that narrows the exercise picker', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await addExercise(page, 'Squat');
  await addExercise(page, 'Deadlift');

  await page.getByRole('button', { name: 'Dashboard' }).click();
  const search = page.getByLabel('Search exercise', { exact: true });
  await expect(search).toBeVisible();

  const options = page.getByLabel('Exercise', { exact: true }).locator('option');
  await expect(options).toHaveCount(3);
  await search.fill('squ');
  await expect(options).toHaveCount(1);
  await expect(options).toHaveText('Squat');
  // A miss reports it rather than silently showing everything.
  await search.fill('zzz');
  await expect(page.getByText(/No exercise matches/)).toBeVisible();
});
