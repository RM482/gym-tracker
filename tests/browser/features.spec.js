// Change set 1 features: muscle-group sections, done-today marking, the
// machine add-on toggle, and the plateau nudge.

import { test, expect } from '@playwright/test';

async function addExercise(page, name) {
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('.sheet input').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
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
  const headings = await page.locator('.group-heading').allTextContents();
  expect(headings).toEqual(['Chest', 'Back', 'Ungrouped']);
  await expect(page.locator('.list-row', { hasText: 'Weird machine' })).toBeVisible();

  // Manage stays a flat list (grouped sections would fight the up/down order),
  // showing the group as secondary text.
  await page.getByRole('button', { name: 'Manage exercises' }).click();
  await expect(page.locator('.group-heading')).toHaveCount(0);
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toContainText('Chest');
  await expect(page.locator('.list-row', { hasText: 'Weird machine' })).toContainText('Ungrouped');
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
  await expect(page.locator('.nudge')).toBeVisible();

  // Beating it does.
  await page.getByLabel('Weight in kilograms').fill('62.5');
  await page.getByRole('button', { name: 'Save set' }).click();
  await expect(page.locator('.nudge')).toHaveCount(0);
});
