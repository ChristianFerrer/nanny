import { test, expect } from '@playwright/test';

/**
 * Smoke test: la app levanta y la home (`/`) responde sin error.
 *
 * Este test NO requiere mocks porque la home es un splash que decide redirigir.
 * Sirve como verificacion minima de que el dev server arranca, Next.js compila,
 * y Playwright puede navegar contra el viewport mobile.
 */
test('la home responde y redirige sin errores', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBeLessThan(400);

  // El splash muestra "Cargando..." o similar mientras decide a donde ir
  await expect(page.locator('body')).toBeVisible();
});
