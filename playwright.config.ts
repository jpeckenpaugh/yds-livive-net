import { defineConfig, devices } from '@playwright/test';

/**
 * The browser job (D5 §9.4).
 *
 * Runs in Chromium against the **built** artifact, served locally over HTTP.
 * It is the only place AC-UI-22's contrast, 200%-zoom and target-size
 * requirements can be checked, and it gives the real end-to-end smoke path.
 */
export default defineConfig({
  testDir: 'test/browser',
  outputDir: 'test-artifacts/playwright',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
