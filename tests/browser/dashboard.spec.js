import { test, expect } from '@playwright/test';

test('dashboard shows weight and bodyweight modes with PRs and consistency', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await page.locator('.list-row', { hasText: 'Bench press' }).click();
  await page.getByLabel('Weight in kilograms').fill('60');
  await page.getByLabel('Repetitions').fill('5');
  await page.getByRole('button', { name: 'Save set' }).click();
  await page.locator('button[aria-label="Back"]').click();

  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.getByLabel('Exercise name').fill('Pull-up');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.list-row', { hasText: 'Pull-up' }).click();
  await page.getByLabel('Weight in kilograms').fill('0');
  await page.getByLabel('Repetitions').fill('12');
  await page.getByRole('button', { name: 'Save set' }).click();
  await page.locator('button[aria-label="Back"]').click();
  await page.getByRole('button', { name: 'Dashboard' }).click();

  // MRU puts Pull-up first: reps-only mode and its applicable PR.
  await expect(page.getByLabel('Exercise')).toHaveValue(/.+/);
  await expect(page.getByText('★ Most reps: 12 reps', { exact: false })).toBeVisible();
  await expect(page.locator('.chart-card h2')).toHaveText(['Max reps']);
  await expect(page.getByText('1 workout in the last 4 weeks')).toBeVisible();

  await page.getByLabel('Exercise').selectOption({ label: 'Bench press' });
  await expect(page.getByText('★ Heaviest: 60 kg', { exact: false })).toBeVisible();
  await expect(page.getByText('★ Best estimated 1RM: 70 kg', { exact: false })).toBeVisible();
  await expect(page.locator('.chart-card h2')).toHaveText(['Top-set weight', 'Best estimated 1RM']);
  await expect(page.getByText(/Come back after your next workout/)).toHaveCount(2);
});
