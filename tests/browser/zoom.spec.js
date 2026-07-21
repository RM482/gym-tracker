// D5: the app must not zoom on tap. Two independent iOS causes:
//  1. double-tap-to-zoom on rapid button taps  → touch-action: manipulation
//  2. focus zoom on controls under 16px        → 16px floor on every control
// Deliberate pinch-zoom stays available (plan §13 accessibility).

import { test, expect } from '@playwright/test';

const MIN_IOS_FONT_PX = 16;

async function controlSizes(page) {
  return page.$$eval('input, select, textarea', (nodes) => nodes.map((n) => ({
    tag: n.tagName.toLowerCase(),
    label: n.getAttribute('aria-label') || n.type || n.className || '(unnamed)',
    fontPx: parseFloat(getComputedStyle(n).fontSize),
    touchAction: getComputedStyle(n).touchAction,
  })));
}

test('no control is small enough to trigger iOS focus zoom', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: 'Bench press' }).click();

  // Home: filter box only appears past 12 exercises, so check the add sheet too.
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  for (const c of await controlSizes(page)) {
    expect(c.fontPx, `sheet control "${c.label}"`).toBeGreaterThanOrEqual(MIN_IOS_FONT_PX);
  }
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Log screen: steppers and the quick-entry sentence field.
  await page.locator('.list-row', { hasText: 'Bench press' }).click();
  await page.getByLabel('Weight in kilograms').waitFor();
  const logControls = await controlSizes(page);
  expect(logControls.length).toBeGreaterThan(0);
  for (const c of logControls) {
    expect(c.fontPx, `log control "${c.label}"`).toBeGreaterThanOrEqual(MIN_IOS_FONT_PX);
    expect(c.touchAction, `log control "${c.label}"`).toBe('manipulation');
  }

  // The set editor nests its inputs in a 0.85rem label — the case that used to
  // inherit 13.6px and zoom on focus.
  await page.getByLabel('Weight in kilograms').fill('20');
  await page.getByRole('button', { name: 'Save set' }).click();
  await page.locator('.set-row, .sets-line').first().waitFor();
  await page.locator('button[aria-label="History"]').click();
  await page.locator('.set-row').first().click();
  for (const c of await controlSizes(page)) {
    expect(c.fontPx, `set-editor control "${c.label}"`).toBeGreaterThanOrEqual(MIN_IOS_FONT_PX);
  }
});

test('settings selects and interactive surfaces disable double-tap zoom', async ({ page }) => {
  await page.goto('/#/settings');
  for (const c of await controlSizes(page)) {
    expect(c.fontPx, `settings control "${c.label}"`).toBeGreaterThanOrEqual(MIN_IOS_FONT_PX);
    expect(c.touchAction, `settings control "${c.label}"`).toBe('manipulation');
  }

  const buttonTouch = await page.$$eval('button', (nodes) => [...new Set(nodes.map((n) => getComputedStyle(n).touchAction))]);
  expect(buttonTouch).toEqual(['manipulation']);

  // Pinch-zoom must remain possible: no viewport zoom lock.
  const viewport = await page.getAttribute('meta[name="viewport"]', 'content');
  expect(viewport).not.toContain('user-scalable=no');
  expect(viewport).not.toContain('maximum-scale');
});
