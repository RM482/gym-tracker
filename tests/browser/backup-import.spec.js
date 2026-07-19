import { test, expect } from '@playwright/test';

test('backup import previews, safety-copies, and atomically replaces current data', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const restoredExercise = { id: 'restored', name: 'Restored row', sortOrder: 0, archivedAtMs: null, createdAtMs: 1, updatedAtMs: 1 };
  const restoredSet = { id: 'restored-set', exerciseId: 'restored', weightKg: 30, reps: 8, performedAtMs: 1, tzOffsetMin: 0, workoutDay: '1970-01-01', createdAtMs: 1, updatedAtMs: 1 };
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'gym-tracker', schemaVersion: 1, exportedAtMs: 1, exercises: [restoredExercise], sets: [restoredSet], settings: { id: 'app', coarseIncrementKg: 5 }, unreadable: [] })),
  });
  await expect(page.getByRole('dialog', { name: 'Replace current data?' })).toContainText('1 exercises and 1 sets');
  const safety = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Create safety copy and replace' }).click();
  expect((await safety).suggestedFilename()).toMatch(/^gym-tracker-safety-/);
  await expect(page.getByText('Backup restored ✓')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.list-row', { hasText: 'Restored row' })).toBeVisible();
  await expect(page.locator('.list-row', { hasText: 'Bench press' })).toHaveCount(0);
});
