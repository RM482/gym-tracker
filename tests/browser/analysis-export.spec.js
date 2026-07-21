import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('analysis export downloads readable JSON with the logged exercise joined in', async ({ page }) => {
  // Exercise the download fallback deterministically; the iPhone share sheet
  // remains part of the planned real-device pass.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await page.locator('.list-row', { hasText: 'Bench press' }).click();
  await page.getByLabel('Weight in kilograms').fill('42.5');
  await page.getByLabel('Repetitions').fill('6');
  await page.getByRole('button', { name: 'Save set' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export for AI analysis' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^gym-tracker-analysis-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const data = JSON.parse(await readFile(path, 'utf8'));
  expect(data.summary.setCount).toBe(1);
  expect(data.sets[0]).toMatchObject({ exerciseName: 'Bench press', weightKg: 42.5, reps: 6 });
  expect(data.guidance).toContain('03:00');

  const backupPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const backupDownload = await backupPromise;
  expect(backupDownload.suggestedFilename()).toMatch(/^gym-tracker-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await readFile(await backupDownload.path(), 'utf8'));
  expect(backup).toMatchObject({ app: 'gym-tracker' });
  expect(backup.schemaVersion).toBeGreaterThanOrEqual(2);
  expect(backup.exercises[0].name).toBe('Bench press');
  expect(backup.sets[0]).toMatchObject({ weightKg: 42.5, reps: 6 });

  await page.getByLabel('Coarse weight increment').selectOption('5');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('.list-row', { hasText: 'Bench press' }).click();
  await expect(page.getByRole('button', { name: '+5' })).toBeVisible();
});
