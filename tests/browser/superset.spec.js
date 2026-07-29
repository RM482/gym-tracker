// Change set 3: "I do supersets - is there a way to have two exercises open at
// the same time? Now I have to go back and forward between exercises in
// between reps to record weight changes."

import { test, expect } from '@playwright/test';

async function seed(page) {
  await page.goto('/');
  return page.evaluate(async () => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    const store = createStore({ dbHandle: db, platform });
    const bench = await store.addExercise('Bench press', { muscleGroup: 'Chest' });
    const row = await store.addExercise('Barbell row', { muscleGroup: 'Back' });
    db.close();
    return { benchId: bench.id, rowId: row.id };
  });
}

const panel = (page, name) => page.locator('.superset-panel', { hasText: name });

test('two exercises log side by side without leaving the screen', async ({ page }) => {
  const { benchId } = await seed(page);

  // Started from inside one of the two exercises, where the owner already is.
  await page.goto(`/#/log/${benchId}`);
  await page.getByRole('button', { name: '⇄ Superset with…' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Barbell row' }).click();

  await expect(page.locator('.screen-header h1')).toHaveText('Superset');
  await expect(page.locator('.superset-panel')).toHaveCount(2);
  await expect(page.locator('.superset-panel h2').nth(0)).toHaveText('Bench press');
  await expect(page.locator('.superset-panel h2').nth(1)).toHaveText('Barbell row');

  // Each panel has its own controls, and each save lands against its own
  // exercise — the whole point of the screen.
  await panel(page, 'Bench press').getByLabel('Weight in kilograms').fill('60');
  await panel(page, 'Bench press').getByLabel('Repetitions').fill('8');
  await panel(page, 'Bench press').getByRole('button', { name: 'Save set' }).click();
  await expect(panel(page, 'Bench press')).toContainText('Today — 1 set: 60 kg × 8');

  await panel(page, 'Barbell row').getByLabel('Weight in kilograms').fill('50');
  await panel(page, 'Barbell row').getByLabel('Repetitions').fill('10');
  await panel(page, 'Barbell row').getByRole('button', { name: 'Save set' }).click();
  await expect(panel(page, 'Barbell row')).toContainText('Today — 1 set: 50 kg × 10');
  // Saving the second must not have disturbed the first.
  await expect(panel(page, 'Bench press')).toContainText('Today — 1 set: 60 kg × 8');

  // A second round, alternating, is the real use case.
  await panel(page, 'Bench press').getByRole('button', { name: 'Save set' }).click();
  await expect(panel(page, 'Bench press')).toContainText('Today — 2 sets');
  await panel(page, 'Barbell row').getByRole('button', { name: 'Save set' }).click();
  await expect(panel(page, 'Barbell row')).toContainText('Today — 2 sets');

  // The sets really belong to the two different exercises.
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByText('2 exercises · 4 sets', { exact: false })).toBeVisible();
});

test('the pair survives a reload, and swapping reverses the panels', async ({ page }) => {
  const { benchId, rowId } = await seed(page);
  await page.goto(`/#/superset/${benchId}/${rowId}`);
  await expect(page.locator('.superset-panel h2').nth(0)).toHaveText('Bench press');

  // The pair is in the URL, so an iOS relaunch onto the last hash restores it.
  await page.reload();
  await expect(page.locator('.superset-panel')).toHaveCount(2);
  await expect(page.locator('.superset-panel h2').nth(0)).toHaveText('Bench press');

  await page.getByRole('button', { name: 'Swap which exercise is on top' }).click();
  await expect(page.locator('.superset-panel h2').nth(0)).toHaveText('Barbell row');
  await expect(page.locator('.superset-panel h2').nth(1)).toHaveText('Bench press');
});

test('quick entry is left out of the compact panels but the guard is not', async ({ page }) => {
  const { benchId, rowId } = await seed(page);
  await page.goto(`/#/superset/${benchId}/${rowId}`);

  // The sentence box is a plan-several-sets tool; it stays on the full screen.
  await expect(page.getByLabel('Quick entry sentence')).toHaveCount(0);

  // Each panel still keeps its own duplicate-write protection: a double tap on
  // one Save must produce one set, not two.
  await panel(page, 'Bench press').getByLabel('Weight in kilograms').fill('60');
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('.superset-panel')].find((n) => n.textContent.includes('Bench press'));
    const save = [...p.querySelectorAll('button')].find((b) => b.textContent === 'Save set');
    save.click(); save.click();
  });
  await expect(panel(page, 'Bench press')).toContainText('Today — 1 set');
});

test('a superset with an archived or deleted exercise falls back safely', async ({ page }) => {
  const { benchId, rowId } = await seed(page);

  // One gone: fall back to the survivor's own logging screen, never a
  // half-dead superset.
  await page.evaluate(async (id) => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    await createStore({ dbHandle: db, platform }).archiveExercise(id);
    db.close();
  }, rowId);

  await page.goto(`/#/superset/${benchId}/${rowId}`);
  await expect(page.locator('.screen-header h1')).toHaveText('Bench press');
  await expect(page.locator('.toast')).toContainText('archived or was deleted');

  // Both gone: back to Home.
  await page.evaluate(async (id) => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    await createStore({ dbHandle: db, platform }).archiveExercise(id);
    db.close();
  }, benchId);

  await page.goto(`/#/superset/${benchId}/${rowId}`);
  await expect(page.locator('.screen-header h1')).toHaveText('Gym Tracker');

  // An exercise supersetted with itself is refused by the router, which sends
  // unknown routes Home rather than building two guards over one exercise.
  await page.goto(`/#/superset/${benchId}/${benchId}`);
  await expect(page).toHaveURL(/#\/$/);
});
