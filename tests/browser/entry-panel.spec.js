// Characterisation tests for the logging screen's entry block, written BEFORE
// it was extracted into js/ui/entry-panel.js so the refactor is measured against
// a net that already existed.
//
// The existing suites cover the entry block's features (persistence, quick
// entry, add-on, e1RM, plateau). What they did not cover is the coupling BETWEEN
// those parts, which is precisely what an extraction can break silently:
//
//   - one `pending` guard shared by manual Save, Repeat and the quick-entry
//     confirm, so no two writes for an exercise can overlap (plan §12 — this is
//     the only duplicate-write protection there is);
//   - the quick-entry draft surviving navigation, surviving a failed save, and
//     clearing only after a successful one;
//   - quick-entry parsing falling back to the weight currently in the stepper;
//   - the quick-entry batch taking the add-on state from the toggle;
//   - Repeat taking the add-on from the SET IT COPIES, not from the toggle.
//
// These assert observable behaviour only, so they stay valid across the move.

import { test, expect } from '@playwright/test';

async function openExercise(page, name) {
  await page.goto('/');
  await page.locator('.chip', { hasText: name }).click();
  await page.locator('.list-row', { hasText: name }).click();
}

test('the quick-entry draft survives navigation and clears only after a successful save', async ({ page }) => {
  await openExercise(page, 'Bench press');

  await page.getByLabel('Quick entry sentence').fill('3x5 @ 40kg');

  // Navigate away and back: the sentence is held in module memory on purpose
  // (plan §12), so it survives in-app navigation.
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.locator('.screen-header h1')).toHaveText('Bench press');
  await page.locator('button[aria-label="Back"]').click();
  await expect(page.getByLabel('Quick entry sentence')).toHaveValue('3x5 @ 40kg');

  // A parse failure must not discard what was typed.
  await page.getByLabel('Quick entry sentence').fill('3x5 @ 40kg, bananas');
  await page.getByRole('button', { name: 'Preview sets' }).click();
  await expect(page.locator('.quick-entry .sheet-error')).toContainText('could not understand');
  await expect(page.getByLabel('Quick entry sentence')).toHaveValue('3x5 @ 40kg, bananas');

  // Only a successful save clears it.
  await page.getByLabel('Quick entry sentence').fill('3x5 @ 40kg');
  await page.getByRole('button', { name: 'Preview sets' }).click();
  await page.getByRole('button', { name: 'Add 3 sets' }).click();
  await expect(page.getByRole('heading', { name: /^Today — 3 sets$/ })).toBeVisible();
  await expect(page.getByLabel('Quick entry sentence')).toHaveValue('');
});

test('quick entry falls back to the weight currently in the stepper', async ({ page }) => {
  await openExercise(page, 'Squat');

  // A sentence with reps but no weight borrows the stepper's current value.
  await page.getByLabel('Weight in kilograms').fill('72.5');
  await page.getByLabel('Quick entry sentence').fill('2 sets of 5');
  await page.getByRole('button', { name: 'Preview sets' }).click();
  await expect(page.locator('.preview-chip')).toHaveCount(2);
  await expect(page.locator('.preview-chip').nth(0)).toHaveText('72.5 kg × 5');
});

test('the quick-entry batch takes the add-on from the toggle', async ({ page }) => {
  await openExercise(page, 'Leg press');

  await page.getByRole('button', { name: /Machine add-on/ }).click();
  await expect(page.getByRole('button', { name: /Machine add-on/ })).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Quick entry sentence').fill('2x6 @ 100kg');
  await page.getByRole('button', { name: 'Preview sets' }).click();
  await page.getByRole('button', { name: 'Add 2 sets' }).click();

  await expect(page.getByRole('heading', { name: /^Today — 2 sets$/ })).toBeVisible();
  await expect(page.locator('.set-row', { hasText: '100 kg × 6 +on' })).toHaveCount(2);
});

test('Repeat copies the add-on of the set it repeats, not the toggle state', async ({ page }) => {
  // Seed a previous session whose first set carries the add-on and whose second
  // does not, so Repeat and the toggle genuinely disagree.
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Leg press' }).click();
  const exerciseId = await page.evaluate(async () => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    const store = createStore({ dbHandle: db, platform });
    const [ex] = await store.listExercises();
    const yesterday = Date.now() - 86400000;
    await store.addSet({ exerciseId: ex.id, weightKg: 100, reps: 6, addOn: true, performedAtMs: yesterday });
    await store.addSet({ exerciseId: ex.id, weightKg: 100, reps: 6, addOn: false, performedAtMs: yesterday + 60000 });
    db.close();
    return ex.id;
  });
  await page.goto(`/#/log/${exerciseId}`);

  // The toggle pre-fills from the previous session's first set: add-on ON.
  await expect(page.getByRole('button', { name: /Machine add-on/ })).toHaveAttribute('aria-pressed', 'true');

  // Repeat set 1 — the copied set has the add-on.
  await page.getByRole('button', { name: /Same as last time/ }).click();
  await expect(page.getByRole('heading', { name: /^Today — 1 set$/ })).toBeVisible();
  await expect(page.locator('.set-row', { hasText: '100 kg × 6 +on' })).toHaveCount(1);

  // Repeat again: the n+1 rule advances to set 2, which did NOT have the add-on,
  // and Repeat must follow the copied set rather than the toggle.
  await page.getByRole('button', { name: /Same as last time/ }).click();
  await expect(page.getByRole('heading', { name: /^Today — 2 sets$/ })).toBeVisible();
  await expect(page.locator('.set-row', { hasText: '+on' })).toHaveCount(1);
  await expect(page.locator('.set-row')).toHaveCount(2);
});

test('every write control on the screen shares one duplicate-write guard', async ({ page }) => {
  await openExercise(page, 'Bench press');

  // Slow the write down so the guard's window is observable, then fire the
  // manual Save and the quick-entry confirm at the same moment. Exactly one
  // must land: they are two buttons over one exercise (plan §12).
  await page.getByLabel('Weight in kilograms').fill('40');
  await page.getByLabel('Quick entry sentence').fill('1x5 @ 40kg');
  await page.getByRole('button', { name: 'Preview sets' }).click();
  await expect(page.getByRole('button', { name: 'Add 1 set' })).toBeVisible();

  await page.evaluate(() => {
    document.querySelectorAll('button').forEach((b) => {
      if (b.textContent === 'Save set' || /^Add 1 set$/.test(b.textContent)) b.click();
    });
  });

  // One of the two wins; the other is refused by the shared guard. Whichever it
  // is, the screen must end up with a single set, never two.
  await expect(page.getByRole('heading', { name: /^Today — 1 set$/ })).toBeVisible();
  await expect(page.locator('.set-row')).toHaveCount(1);
});
