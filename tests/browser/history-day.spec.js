// B5 + B8 (plan §17.0): edit/delete/Undo and cross-exercise day overview.

import { test, expect } from '@playwright/test';

async function addStarterAndSet(page, name, weight, reps = '8') {
  await page.locator('.chip', { hasText: name }).click();
  await page.locator('.list-row', { hasText: name }).click();
  await page.getByLabel('Weight in kilograms').fill(String(weight));
  await page.getByLabel('Repetitions').fill(String(reps));
  await page.getByRole('button', { name: 'Save set' }).click();
}

test('B5: history edits a set, deletes it, and Undo restores the same entry', async ({ page }) => {
  await page.goto('/');
  await addStarterAndSet(page, 'Bench press', '40');
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.locator('.history-card')).toHaveCount(1);

  await page.getByRole('button', { name: /Edit 40 kg × 8/ }).click();
  await page.getByText('Weight (kg)').locator('..').locator('input').fill('42,5');
  await page.getByText('Repetitions').locator('..').locator('input').fill('6');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: /Edit 42.5 kg × 6/ })).toBeVisible();

  // A timestamp edit previews and then moves the set to its derived workout day.
  await page.getByRole('button', { name: /Edit 42.5 kg × 6/ }).click();
  const yesterdayNoon = await page.evaluate(() => {
    const date = new Date(Date.now() - 86400000);
    date.setHours(12, 0, 0, 0);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T12:00`;
  });
  await page.getByLabel('Date and time').fill(yesterdayNoon);
  await expect(page.getByText(/Moves to workout day:/)).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.history-day-link')).toContainText('1 set');

  await page.getByRole('button', { name: /Edit 42.5 kg × 6/ }).click();
  await page.getByRole('button', { name: 'Delete set' }).click();
  await page.getByRole('dialog', { name: 'Delete this set?' }).getByRole('button', { name: 'Delete set' }).click();
  await expect(page.getByText('No sets logged yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: /Edit 42.5 kg × 6/ })).toBeVisible();

  // Delete again and let the documented Undo window expire: deletion stands.
  await page.getByRole('button', { name: /Edit 42.5 kg × 6/ }).click();
  await page.getByRole('button', { name: 'Delete set' }).click();
  await page.getByRole('dialog', { name: 'Delete this set?' }).getByRole('button', { name: 'Delete set' }).click();
  await page.waitForTimeout(6200);
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('No sets logged yet.')).toBeVisible();
});

test('B8: today groups two exercises and opens the shared editor', async ({ page }) => {
  await page.goto('/');
  await addStarterAndSet(page, 'Bench press', '40');
  await page.getByRole('button', { name: 'Back' }).click();

  // Starter chips disappear after first use, so add the second exercise normally.
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.getByLabel('Exercise name').fill('Squat');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.list-row', { hasText: 'Squat' }).click();
  await page.getByLabel('Weight in kilograms').fill('60');
  await page.getByRole('button', { name: 'Save set' }).click();
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Today');
  await expect(page.getByText('2 exercises · 2 sets · 0 min')).toBeVisible();
  await expect(page.locator('.day-card').nth(0).locator('h2')).toHaveText('Bench press');
  await expect(page.locator('.day-card').nth(1).locator('h2')).toHaveText('Squat');
  await page.getByRole('button', { name: /Edit 60 kg × 8/ }).click();
  await expect(page.getByRole('dialog', { name: 'Edit set' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.locator('h1')).toHaveText('Yesterday');
  await expect(page.getByText('No sets on this day.')).toBeVisible();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.locator('h1')).toHaveText('Today');
});
