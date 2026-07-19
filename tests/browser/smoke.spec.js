// B1 (plan §17.0): the app loads, every route renders, back navigation works.

import { test, expect } from '@playwright/test';

test('B1: loads and navigates every route', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Gym Tracker');

  const routes = [
    ['#/dashboard', 'Progress'],
    ['#/manage', 'Manage exercises'],
    ['#/settings', 'Settings'],
    ['#/day/2026-07-19', 'Day overview'],
    ['#/history/some-id', 'History'],
  ];
  for (const [hash, title] of routes) {
    await page.goto('/' + hash);
    await expect(page.locator('h1')).toHaveText(title);
    await page.locator('button[aria-label="Back"]').click();
    await expect(page.locator('h1')).toHaveText('Gym Tracker');
  }

  // Unknown routes and stale exercise links redirect Home (plan §12)
  await page.goto('/#/nonsense');
  await expect(page.locator('h1')).toHaveText('Gym Tracker');
  await page.goto('/#/log/deleted-exercise-id');
  await expect(page.locator('h1')).toHaveText('Gym Tracker');
});
