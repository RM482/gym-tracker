import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 30_000,
  webServer: {
    command: 'python3 -m http.server 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
  ],
});
