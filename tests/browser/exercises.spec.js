// B2 (plan §17.0): add exercise → appears on Home. Also covers the D2 starter
// chips and the Manage rename flow end-to-end in a real browser.

import { test, expect } from '@playwright/test';

test('B2: starter chip and custom add both appear on Home; rename reflects', async ({ page }) => {
  await page.goto('/');

  // Empty state with starter chips (D2)
  await expect(page.getByText('Add your first exercise')).toBeVisible();
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toBeVisible();

  // Custom add via the sheet
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('.sheet input').fill('Cable fly');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.list-row', { hasText: 'Cable fly' })).toBeVisible();

  // Duplicate is rejected with a visible message, nothing added
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('.sheet input').fill(' cable FLY ');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.sheet-error')).toContainText('already have');
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Rename in Manage reflects on Home
  await page.getByRole('button', { name: 'Manage exercises' }).click();
  await page.getByRole('button', { name: 'Options for Cable fly' }).click();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.locator('.sheet input').fill('Chest fly');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.list-row', { hasText: 'Chest fly' })).toBeVisible();
  await expect(page.locator('.list-row', { hasText: 'Cable fly' })).toHaveCount(0);
});
