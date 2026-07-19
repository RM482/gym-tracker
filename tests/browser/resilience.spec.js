import { test, expect } from '@playwright/test';

test('installed app reloads its main screen while fully offline @chromium', async ({ page, context }) => {
  await page.goto('/?sw=on');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // The first visit installs and claims the worker; this navigation proves it
  // serves the complete cached shell rather than relying on loaded resources.
  await page.reload();

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Gym Tracker' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('database upgrade in another tab blocks stale interaction until reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gym Tracker' })).toBeVisible();

  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('gym-tracker', 2);
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  }));

  await expect(page.getByText('The app was updated in another tab.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings' })).toHaveCount(0);
});
