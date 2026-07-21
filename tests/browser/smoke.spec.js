// B1 (plan §17.0): the app loads, every route renders, back navigation works.

import { test, expect } from '@playwright/test';

test('B1: loads and navigates every route', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Gym Tracker');

  // Create one real exercise so the parameterised History route can render.
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await page.locator('.list-row', { hasText: 'Bench press' }).click();
  const exerciseId = page.url().split('/').at(-1);
  await page.locator('button[aria-label="Back"]').click();

  // Derive today's workout day from the app itself: a hardcoded date silently
  // stops being "Today" the next day and rots the test.
  const todayDay = await page.evaluate(() => {
    const shifted = new Date(Date.now() - 3 * 3600 * 1000); // 03:00 boundary (D1)
    return new Date(shifted.getTime() - shifted.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });

  const routes = [
    ['#/dashboard', 'Progress'],
    ['#/manage', 'Manage exercises'],
    ['#/settings', 'Settings'],
    [`#/day/${todayDay}`, 'Today'],
    [`#/history/${exerciseId}`, 'Bench press'],
  ];
  for (const [hash, title] of routes) {
    await page.goto('/' + hash);
    await expect(page.locator('h1')).toHaveText(title);
    await page.locator('button[aria-label="Back"]').click();
    if (title === 'Bench press') {
      await expect(page.locator('h1')).toHaveText('Bench press'); // History → Log
      await page.locator('button[aria-label="Back"]').click();
    }
    await expect(page.locator('h1')).toHaveText('Gym Tracker');
  }

  // Unknown routes and stale exercise links redirect Home (plan §12)
  await page.goto('/#/nonsense');
  await expect(page.locator('h1')).toHaveText('Gym Tracker');
  await page.goto('/#/log/deleted-exercise-id');
  await expect(page.locator('h1')).toHaveText('Gym Tracker');
  await page.goto('/#/history/deleted-exercise-id');
  await expect(page.locator('h1')).toHaveText('Gym Tracker');
});
