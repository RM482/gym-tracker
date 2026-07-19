// B3 (plan §17.0): log a set via the steppers → it appears in Today and
// survives a page reload (IndexedDB persistence in a real browser).

import { test, expect } from '@playwright/test';

test('B3: stepper logging persists across reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await page.locator('.list-row', { hasText: 'Bench press' }).click();

  // First time: no previous session, weight empty, reps prefilled 8
  await expect(page.getByText('First time — log your opening set below.')).toBeVisible();
  const weight = page.getByLabel('Weight in kilograms');
  await weight.fill('22,5'); // decimal comma must be accepted (A7)
  await page.getByRole('button', { name: '+0.5' }).click();
  await expect(weight).toHaveValue('23');
  await page.getByRole('button', { name: 'Save set' }).click();
  await expect(page.getByText('Today — 1 set')).toBeVisible();
  await expect(page.locator('.set-row', { hasText: '23 kg × 8' })).toBeVisible();

  // Values stay for the next set; save again → 2 sets
  await page.getByRole('button', { name: 'Save set' }).click();
  await expect(page.getByText('Today — 2 sets')).toBeVisible();

  // Survives reload
  await page.reload();
  await expect(page.getByText('Today — 2 sets')).toBeVisible();

  // Home row now shows today's summary
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toContainText('Today · 2 sets · top 23 kg');
});
