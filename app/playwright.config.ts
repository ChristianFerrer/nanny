import { defineConfig, devices } from '@playwright/test';

/**
 * Config de Playwright para tests E2E del chat de Nanny.
 *
 * Estrategia:
 * - Los tests mockean Supabase y OpenAI (ver app/tests/fixtures/) — no usan
 *   credenciales reales ni consumen tokens. Por eso el workflow puede correr
 *   con env vars dummy en GitHub Actions.
 * - Mobile-first viewport (430px ancho) porque la app esta diseñada para mobile.
 * - El dev server lo levanta el propio Playwright via `webServer` config.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 430, height: 932 },
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
