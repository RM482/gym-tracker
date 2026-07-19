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
    { name: 'webkit', grepInvert: /@chromium/, use: { ...devices['iPhone 13'] } },
    // Chromium has reliable service-worker + offline emulation. WebKit's
    // inspector currently aborts an offline navigation before its worker runs.
    { name: 'chromium-offline', grep: /@chromium/, use: { ...devices['Pixel 7'] } },
  ],
});
