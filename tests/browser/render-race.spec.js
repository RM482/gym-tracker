// B9: regression for the duplicate-list bug the owner hit on their iPhone.
// Returning to the app fires focus and visibilitychange together. Each render
// used to clear #app once and then append rows after awaiting its data, so
// overlapping renders interleaved and stacked 2–3 copies of the exercise list.
// Reproduced reliably with a macrotask stagger between the two events.

import { test, expect } from '@playwright/test';

async function seed(page, names) {
  await page.goto('/');
  await page.locator('.chip', { hasText: names[0] }).click();
  for (const name of names.slice(1)) {
    await page.getByRole('button', { name: '＋ Add exercise' }).click();
    await page.locator('.sheet input').fill(name);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await expect(page.locator('.list-row')).toHaveCount(names.length);
}

test('B9: overlapping refresh events never duplicate the exercise list', async ({ page }) => {
  const names = ['Bench press', 'Cable fly'];
  await seed(page, names);

  // Stagger by a macrotask: the window that used to duplicate.
  for (const delay of [0, 1, 3, 8]) {
    await page.evaluate((d) => {
      window.dispatchEvent(new Event('focus'));
      return new Promise((resolve) => setTimeout(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        resolve();
      }, d));
    }, delay);
    await page.waitForTimeout(250);
    await expect(page.locator('.screen-header')).toHaveCount(1);
    await expect(page.locator('.list-row')).toHaveCount(names.length);
    for (const name of names) {
      await expect(page.locator('.list-row .name', { hasText: name })).toHaveCount(1);
    }
  }

  // A burst of events in one tick must also settle on exactly one screen.
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
  await page.waitForTimeout(400);
  await expect(page.locator('.screen-header')).toHaveCount(1);
  await expect(page.locator('.list-row')).toHaveCount(names.length);
});

test('B9: rapid navigation never commits a stale screen', async ({ page }) => {
  await seed(page, ['Bench press']);

  // Navigate away and back faster than the screens can load their data.
  await page.evaluate(() => {
    location.hash = '#/dashboard';
    location.hash = '#/manage';
    location.hash = '#/settings';
    location.hash = '#/';
  });
  await page.waitForTimeout(600);
  await expect(page.locator('.screen-header')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Gym Tracker');
  await expect(page.locator('.list-row')).toHaveCount(1);

  // Leaving Home while it loads must not paint Home over the new screen.
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    location.hash = '#/settings';
  });
  await page.waitForTimeout(600);
  await expect(page.locator('h1')).toHaveText('Settings');
  await expect(page.locator('.list-row')).toHaveCount(0);
});

// G1: rendering is detached, but side effects are not. A superseded Log render
// for a deleted exercise used to still toast and redirect Home, yanking the
// owner off whichever screen they had actually navigated to.
test('B9: a superseded render for a missing exercise cannot hijack navigation', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();
  await expect(page.locator('.list-row')).toHaveCount(1);

  // Start a Log render for an exercise that does not exist, then immediately
  // navigate somewhere else before it resolves.
  await page.evaluate(() => {
    location.hash = '#/log/does-not-exist';
    location.hash = '#/settings';
  });

  await expect(page.locator('h1')).toHaveText('Settings');
  await page.waitForTimeout(600);
  // Still on Settings: the stale render neither redirected nor toasted.
  await expect(page.locator('h1')).toHaveText('Settings');
  await expect(page.locator('#toast-region .toast')).toHaveCount(0);

  // Navigating there directly still redirects, as it should.
  await page.goto('/#/log/does-not-exist');
  await expect(page.locator('h1')).toHaveText('Gym Tracker');
});
