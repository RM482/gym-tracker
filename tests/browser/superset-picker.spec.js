// Change set 4: "When I want to add a superset, I can't scroll the list of
// exercises. I'd need to be able to scroll them, but ideally would also have
// them grouped in their groups (in a foldable way)."
//
// The bottom sheet had no max-height and no overflow, so a picker with one
// entry per exercise simply grew past the top of the screen with nothing to
// scroll. That affects every sheet; the superset picker is the one with an
// unbounded number of items.

import { test, expect } from '@playwright/test';

const MANY = [
  ['Bench press', 'Chest'], ['Incline press', 'Chest'], ['Cable fly', 'Chest'],
  ['Barbell row', 'Back'], ['Lat pulldown', 'Back'], ['Seated row', 'Back'],
  ['Squat', 'Legs'], ['Leg press', 'Legs'], ['Leg curl', 'Legs'], ['Calf raise', 'Legs'],
  ['Overhead press', 'Shoulders'], ['Lateral raise', 'Shoulders'],
  ['Biceps curl', 'Arms'], ['Hammer curl', 'Arms'], ['Triceps pushdown', 'Arms'],
  ['Plank', 'Core'], ['Hanging leg raise', 'Core'],
  ['Farmer walk', null], ['Sled push', null], ['Battle ropes', null],
];

async function seedAndOpenPicker(page) {
  await page.setViewportSize({ width: 390, height: 700 }); // iPhone-ish
  await page.goto('/');
  const firstId = await page.evaluate(async (rows) => {
    const { openDb } = await import('/js/db.js');
    const { createStore } = await import('/js/store.js');
    const platform = await import('/js/platform.js');
    const db = await openDb();
    const store = createStore({ dbHandle: db, platform });
    let first = null;
    for (const [name, muscleGroup] of rows) {
      const ex = await store.addExercise(name, { muscleGroup });
      first ??= ex;
    }
    db.close();
    return first.id;
  }, MANY);

  await page.goto(`/#/log/${firstId}`);
  await page.getByRole('button', { name: '⇄ Superset with…' }).click();
  await expect(page.locator('.sheet')).toBeVisible();
  return firstId;
}

test('the superset picker fits on screen and scrolls to its last entry', async ({ page }) => {
  await seedAndOpenPicker(page);

  const sheet = page.locator('.sheet');

  // The sheet must not run off the top of the screen — that is the state where
  // the owner could reach neither the list nor Cancel.
  const box = await sheet.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(700 + 1);

  // With 20 exercises the list must genuinely overflow, and that overflow must
  // be scrollable rather than clipped.
  const list = page.locator('.picker-list');
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  // The list scrolls, not the whole sheet, so the title and Cancel stay put
  // rather than scrolling away from someone halfway down.
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeInViewport();

  // The last section is reachable by scrolling and is tappable.
  const ungrouped = page.locator('.sheet .group-toggle', { hasText: 'Ungrouped' });
  await ungrouped.scrollIntoViewIfNeeded();
  await expect(ungrouped).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeInViewport();
});

test('the picker groups exercises and the sections fold', async ({ page }) => {
  await seedAndOpenPicker(page);

  // Same taxonomy and order as Home, with never-assigned exercises last.
  const headings = await page.locator('.sheet .group-toggle').allTextContents();
  expect(headings).toEqual([
    '▾Chest (2)', '▾Back (3)', '▾Legs (4)', '▾Shoulders (2)',
    '▾Arms (3)', '▾Core (2)', '▾Ungrouped (3)',
  ]);

  // Chest shows 2, not 3: the exercise you are supersetting FROM is excluded.
  await expect(page.locator('.sheet .menu-item', { hasText: 'Bench press' })).toHaveCount(0);
  await expect(page.locator('.sheet .menu-item', { hasText: 'Incline press' })).toBeVisible();

  // Folding a section hides its exercises and shortens the list.
  const legs = page.locator('.sheet .group-toggle', { hasText: 'Legs' });
  await legs.click();
  await expect(legs).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.sheet .menu-item', { hasText: 'Leg press' })).toBeHidden();
  await expect(page.locator('.sheet .menu-item', { hasText: 'Incline press' })).toBeVisible();

  await legs.click();
  await expect(page.locator('.sheet .menu-item', { hasText: 'Leg press' })).toBeVisible();
});

test('picking a partner from a group opens that superset', async ({ page }) => {
  await seedAndOpenPicker(page);

  await page.locator('.sheet .group-toggle', { hasText: 'Back' }).click(); // fold
  await page.locator('.sheet .group-toggle', { hasText: 'Back' }).click(); // unfold
  await page.locator('.sheet .menu-item', { hasText: 'Barbell row' }).click();

  await expect(page.locator('.screen-header h1')).toHaveText('Superset');
  await expect(page.locator('.superset-panel h2').nth(0)).toHaveText('Bench press');
  await expect(page.locator('.superset-panel h2').nth(1)).toHaveText('Barbell row');
});

test('the picker shares the fold preference with Home', async ({ page }) => {
  await seedAndOpenPicker(page);

  await page.locator('.sheet .group-toggle', { hasText: 'Legs' }).click();
  await expect(page.locator('.sheet .group-toggle', { hasText: 'Legs' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Folding is one preference, not one per screen.
  await page.goto('/#/');
  await expect(page.locator('.group-toggle', { hasText: 'Legs' })).toHaveAttribute('aria-expanded', 'false');
});
