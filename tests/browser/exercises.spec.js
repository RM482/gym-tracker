// B2 (plan §17.0): add exercise → appears on Home. Also covers the D2 starter
// chips and the Manage rename flow end-to-end in a real browser.
//
// Change set 3 amended this test on purpose, not to accommodate a refactor:
// adding from Home now lands on the new exercise's logging screen instead of
// returning to the list, and the add sheet now also takes a muscle group.
// The old assertions are kept, reached via a Back tap.

import { test, expect } from '@playwright/test';

test('B2: starter chip and custom add both appear on Home; rename reflects', async ({ page }) => {
  await page.goto('/');

  // Empty state with starter chips (D2). A chip stays on Home, so the other
  // seven suggestions remain reachable.
  await expect(page.getByText('Add your first exercise')).toBeVisible();
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toBeVisible();

  // Custom add via the sheet, with a group chosen in the same sheet
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('.sheet input').fill('Cable fly');
  await page.locator('.sheet .chip', { hasText: 'Chest' }).click();
  await expect(page.locator('.sheet .chip[aria-pressed="true"]')).toHaveText('Chest');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // …lands straight on that exercise's logging screen, ready to log
  await expect(page.locator('.screen-header h1')).toHaveText('Cable fly');
  await expect(page.getByRole('button', { name: 'Save set' })).toBeVisible();

  // Back on Home it is listed, under the group picked while adding
  await page.locator('button[aria-label="Back"]').click();
  await expect(page.locator('.list-row', { hasText: 'Cable fly' })).toBeVisible();
  await expect(page.locator('.group-heading', { hasText: 'Chest' })).toBeVisible();

  // Duplicate is rejected with a visible message, the sheet stays open holding
  // the typing, and nothing is added or navigated to
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('.sheet input').fill(' cable FLY ');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.sheet-error')).toContainText('already have');
  await expect(page.locator('.sheet input')).toHaveValue(' cable FLY ');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.list-row', { hasText: 'Cable fly' })).toHaveCount(1);

  // Rename in Manage reflects on Home
  await page.getByRole('button', { name: 'Manage exercises' }).click();
  await page.getByRole('button', { name: 'Options for Cable fly' }).click();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.locator('.sheet input').fill('Chest fly');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('button[aria-label="Back"]').click();
  await expect(page.locator('.list-row', { hasText: 'Chest fly' })).toBeVisible();
  await expect(page.locator('.list-row', { hasText: 'Cable fly' })).toHaveCount(0);
});

test('add sheet: skipping the group leaves it Ungrouped; Manage add stays on Manage', async ({ page }) => {
  await page.goto('/');

  // No chip tapped → Ungrouped, exactly as before change set 3
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('.sheet input').fill('Farmer walk');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.screen-header h1')).toHaveText('Farmer walk');
  await page.locator('button[aria-label="Back"]').click();
  await expect(page.locator('.group-heading', { hasText: 'Ungrouped' })).toBeVisible();

  // Tapping the chosen chip again clears it back to Ungrouped
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('.sheet input').fill('Sled push');
  await page.locator('.sheet .chip', { hasText: 'Legs' }).click();
  await page.locator('.sheet .chip', { hasText: 'Legs' }).click();
  await expect(page.locator('.sheet .chip[aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('button[aria-label="Back"]').click();
  await expect(page.locator('.group-heading', { hasText: 'Legs' })).toHaveCount(0);

  // Manage is a housekeeping screen: adding there must NOT navigate away, so
  // several exercises can be added in a row.
  await page.getByRole('button', { name: 'Manage exercises' }).click();
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('.sheet input').fill('Calf raise');
  await page.locator('.sheet .chip', { hasText: 'Legs' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.screen-header h1')).toHaveText('Manage exercises');
  await expect(page.locator('.list-row', { hasText: 'Calf raise' })).toBeVisible();

  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('.sheet input').fill('Hip thrust');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.screen-header h1')).toHaveText('Manage exercises');
  await expect(page.locator('.list-row', { hasText: 'Hip thrust' })).toBeVisible();
});
