// B4 (plan §17.0): canonical sentence → preview → one atomic batch save.

import { test, expect } from '@playwright/test';

test('B4: quick-entry sentence previews and saves three sets', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await page.locator('.list-row', { hasText: 'Bench press' }).click();

  await page.getByLabel('Quick entry sentence').fill(
    'I did 2 sets of 8 reps at 10kg, then one set of 8 reps at 9kg',
  );
  await page.getByRole('button', { name: 'Preview sets' }).click();

  await expect(page.locator('.preview-chip')).toHaveCount(3);
  await expect(page.locator('.preview-chip').nth(0)).toHaveText('10 kg × 8');
  await expect(page.locator('.preview-chip').nth(1)).toHaveText('10 kg × 8');
  await expect(page.locator('.preview-chip').nth(2)).toHaveText('9 kg × 8');
  await page.getByRole('button', { name: 'Add 3 sets' }).click();

  await expect(page.getByText('Today — 3 sets')).toBeVisible();
  await expect(page.locator('.sets-line', { hasText: '10 kg × 8' })).toHaveCount(2);
  await expect(page.locator('.sets-line', { hasText: '9 kg × 8' })).toBeVisible();
});

test('B4: a bad fragment saves nothing and shows the fragment', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Squat' }).click();
  await page.locator('.list-row', { hasText: 'Squat' }).click();

  await page.getByLabel('Quick entry sentence').fill('5 @ 60kg, bananas');
  await page.getByRole('button', { name: 'Preview sets' }).click();

  await expect(page.getByText(/“bananas”: could not understand/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Add \d+ sets/ })).toHaveCount(0);
  await expect(page.getByText(/Today —/)).toHaveCount(0);
});
