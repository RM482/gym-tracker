import { test, expect } from '@playwright/test';

test('dark mode, 200% text, and dialog keyboard focus remain usable', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');

  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(15, 23, 42)');

  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const add = page.getByRole('button', { name: 'Add exercise' });
  await add.click();
  const dialog = page.getByRole('dialog', { name: 'New exercise' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(add).toBeFocused();
});
