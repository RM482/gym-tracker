import { defineConfig } from 'vitest/config';

// Only *.test.js files are Vitest's; tests/browser/*.spec.js belong to Playwright.
export default defineConfig({
  test: { include: ['tests/**/*.test.js'] },
});
