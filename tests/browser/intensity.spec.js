// Change set 5: "I'd like to add an option to flag how intense an exercise was
// for me, so I know the next time if I struggled to finish the set or if I can
// go up in weights."
//
// Optional per-set flag: Easy / OK / Struggled, stored as null|easy|ok|hard.
// null means the owner did not say and must never read as "it was fine".

import { test, expect } from '@playwright/test';

async function openExercise(page, name = 'Bench press') {
  await page.goto('/');
  await page.locator('.chip', { hasText: name }).click();
  await page.locator('.list-row', { hasText: name }).click();
}

const feel = (page, label) => page.getByRole('button', { name: label, exact: true });

test('a set can be flagged, and the flag shows next time on Last time', async ({ page }) => {
  await openExercise(page);

  await page.getByLabel('Weight in kilograms').fill('60');
  await page.getByLabel('Repetitions').fill('8');
  await feel(page, 'Struggled').click();
  await expect(feel(page, 'Struggled')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save set' }).click();

  await expect(page.getByRole('heading', { name: /^Today — 1 set$/ })).toBeVisible();
  await expect(page.locator('.set-row', { hasText: '60 kg × 8 Struggled' })).toHaveCount(1);

  // The point of the feature: it is there next time, when picking a weight.
  await page.locator('button[aria-label="Back"]').click();
  await page.locator('.list-row', { hasText: 'Bench press' }).click();
  await expect(page.locator('.set-row', { hasText: '60 kg × 8 Struggled' })).toHaveCount(1);
});

test('the flag does NOT carry over to the next set', async ({ page }) => {
  await openExercise(page);

  // Set 1: easy.
  await page.getByLabel('Weight in kilograms').fill('60');
  await feel(page, 'Easy').click();
  await page.getByRole('button', { name: 'Save set' }).click();
  await expect(page.getByRole('heading', { name: /^Today — 1 set$/ })).toBeVisible();

  // Set 2 starts unset. Weight and reps still pre-fill — those describe the
  // prescription; how hard it felt is an outcome and must be said again, or a
  // set 4 that was a fight would silently record "Easy".
  await expect(feel(page, 'Easy')).toHaveAttribute('aria-pressed', 'false');
  await expect(feel(page, 'OK')).toHaveAttribute('aria-pressed', 'false');
  await expect(feel(page, 'Struggled')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Weight in kilograms')).toHaveValue('60');

  // Saving without touching it records nothing rather than repeating "Easy".
  await page.getByRole('button', { name: 'Save set' }).click();
  await expect(page.getByRole('heading', { name: /^Today — 2 sets$/ })).toBeVisible();
  await expect(page.locator('.set-row', { hasText: 'Easy' })).toHaveCount(1);
});

test('tapping the chosen level again clears it back to unrecorded', async ({ page }) => {
  await openExercise(page);
  await page.getByLabel('Weight in kilograms').fill('40');
  await feel(page, 'OK').click();
  await expect(feel(page, 'OK')).toHaveAttribute('aria-pressed', 'true');
  await feel(page, 'OK').click();
  await expect(feel(page, 'OK')).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Save set' }).click();
  await expect(page.getByRole('heading', { name: /^Today — 1 set$/ })).toBeVisible();
  // No level word at all — "not said" is shown as nothing, not as OK.
  await expect(page.locator('.set-row')).toHaveText(/40 kg × 8$/);
});

test('a set can be flagged after the fact from the editor, and unflagged again', async ({ page }) => {
  await openExercise(page);
  await page.getByLabel('Weight in kilograms').fill('50');
  await page.getByRole('button', { name: 'Save set' }).click();
  await expect(page.getByRole('heading', { name: /^Today — 1 set$/ })).toBeVisible();

  await page.locator('.set-row').first().click();
  await expect(page.getByRole('dialog', { name: 'Edit set' })).toBeVisible();
  await page.locator('.sheet').getByRole('button', { name: 'Struggled', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.set-row', { hasText: '50 kg × 8 Struggled' })).toHaveCount(1);

  // And back to unrecorded.
  await page.locator('.set-row').first().click();
  await page.locator('.sheet').getByRole('button', { name: 'Struggled', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.set-row', { hasText: 'Struggled' })).toHaveCount(0);
  await expect(page.locator('.set-row')).toHaveText(/50 kg × 8$/);
});

test('quick-entry batches are left unflagged, and Repeat uses today’s answer', async ({ page }) => {
  await openExercise(page);

  // A sentence says nothing about how any individual set felt.
  await page.getByLabel('Quick entry sentence').fill('2x8 @ 40kg');
  await page.getByRole('button', { name: 'Preview sets' }).click();
  await page.getByRole('button', { name: 'Add 2 sets' }).click();
  await expect(page.getByRole('heading', { name: /^Today — 2 sets$/ })).toBeVisible();
  await expect(page.locator('.set-row', { hasText: /Easy|OK|Struggled/ })).toHaveCount(0);

  // Set up a previous session with a flagged set, then check Repeat.
  const exerciseId = await page.evaluate(async () => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    const store = createStore({ dbHandle: db, platform });
    const [ex] = await store.listExercises();
    await store.addSet({ exerciseId: ex.id, weightKg: 55, reps: 6, intensity: 'hard', performedAtMs: Date.now() - 86400000 });
    db.close();
    return ex.id;
  });
  await page.goto(`/#/log/${exerciseId}`);

  // The label offers last session's feeling as context…
  const repeat = page.getByRole('button', { name: /Same as last time/ });
  await expect(repeat).toContainText('felt Struggled');

  // …but the saved set takes TODAY's answer, not last session's.
  await feel(page, 'Easy').click();
  await repeat.click();
  await expect(page.locator('.set-row', { hasText: '55 kg × 6 Easy' })).toHaveCount(1);
  await expect(page.locator('.set-row', { hasText: '55 kg × 6 Struggled' })).toHaveCount(0);
});

// A set that predates the feature comes out of the v2→v3 migration with
// intensity null. This asserts that shape renders correctly end to end — no
// level invented for it, and it is not hidden either.
//
// It does NOT drive the migration itself: the page has already opened the
// database at v3 by the time a test can run, so seeding a real v2 database from
// here is impossible (the app correctly refuses to open newer data with older
// code). The upgrade is covered against a real v2 database in tests/db.test.js.
test('a set with no recorded intensity renders with no level invented for it', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Squat' }).click();
  await page.evaluate(async () => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    const store = createStore({ dbHandle: db, platform });
    const [ex] = await store.listExercises();
    // Exactly what the migration produces for a pre-existing set.
    await store.addSet({ exerciseId: ex.id, weightKg: 70, reps: 5, intensity: null });
    db.close();
  });
  await page.reload();

  await page.locator('.list-row', { hasText: 'Squat' }).click();
  await expect(page.locator('.set-row', { hasText: '70 kg × 5' })).toHaveCount(1);
  await expect(page.locator('.set-row', { hasText: /Easy|OK|Struggled/ })).toHaveCount(0);
});
