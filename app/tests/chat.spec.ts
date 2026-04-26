import { test, expect } from '@playwright/test';
import { setupChatMocks, resetMocks } from './fixtures/mockApis';

/**
 * 5 tests E2E criticos del chat de Nanny.
 *
 * Estos tests cubren los flujos mas sensibles al refactor planificado en
 * CHAT-REFACTOR-PLAN.md. Si pasan despues de cada fase del refactor, hay
 * 95% de confianza de que no hubo regresiones funcionales.
 *
 * Estrategia:
 * - Mocks completos via setupChatMocks (sin Supabase ni OpenAI reales)
 * - Selectores por rol/texto (Playwright best practice, mas robusto que CSS)
 * - Mobile viewport 430px (definido en playwright.config.ts)
 *
 * NOTA: el chat tiene un buffer de 8s antes de mandar a /api/chat (acumula
 * mensajes consecutivos del mismo sender). Los timeouts esperando respuesta
 * de Nanny tienen que ser >8s (usamos 15s para margen).
 */

const NANNY_RESPONSE_TIMEOUT = 15_000;

test.describe('chat — flujos críticos del refactor', () => {
  test.beforeEach(async ({ page }) => {
    resetMocks();
    await setupChatMocks(page);
    await page.goto('/chat');
    // Espera a que el chat termine de cargar (input visible)
    await expect(page.getByPlaceholder('Mensaje')).toBeVisible({ timeout: 15_000 });
  });

  test('1 — mandar mensaje y recibir respuesta de Nanny', async ({ page }) => {
    const input = page.getByPlaceholder('Mensaje');
    await input.fill('Hola Nanny');
    await input.press('Enter');

    // El bubble del usuario aparece
    await expect(page.getByText('Hola Nanny')).toBeVisible();

    // La respuesta default de Nanny aparece
    await expect(page.getByText('Entendido, anotado.')).toBeVisible({ timeout: NANNY_RESPONSE_TIMEOUT });
  });

  test('2 — intent MEDICATION muestra 3 botones (Sí crear / Editar / No)', async ({ page }) => {
    const input = page.getByPlaceholder('Mensaje');
    await input.fill('Pau toma jarabe 3 veces al día');
    await input.press('Enter');

    // Espera la respuesta de Nanny con intent MEDICATION
    await expect(page.getByText('Anoté el medicamento. ¿Querés que cree recordatorios?')).toBeVisible({ timeout: NANNY_RESPONSE_TIMEOUT });

    // Los 3 botones deben aparecer
    await expect(page.getByRole('button', { name: 'Sí, crear' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar horarios' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'No' })).toBeVisible();
  });

  test('3 — click "Editar horarios" abre el bottom sheet del editor', async ({ page }) => {
    const input = page.getByPlaceholder('Mensaje');
    await input.fill('Pau toma jarabe 3 veces al día');
    await input.press('Enter');

    await expect(page.getByRole('button', { name: 'Editar horarios' })).toBeVisible({ timeout: NANNY_RESPONSE_TIMEOUT });
    await page.getByRole('button', { name: 'Editar horarios' }).click();

    // El sheet con role=dialog debe aparecer
    const sheet = page.getByRole('dialog', { name: /editar horarios|ajustar horarios/i });
    await expect(sheet).toBeVisible();

    // Inputs de hora visibles
    await expect(sheet.getByLabel(/horario \d/i).first()).toBeVisible();

    // Botones del sheet
    await expect(sheet.getByRole('button', { name: 'Cancelar' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Guardar' })).toBeVisible();
  });

  test('4 — editar horarios y confirmar medicación', async ({ page }) => {
    const input = page.getByPlaceholder('Mensaje');
    await input.fill('Pau toma jarabe 3 veces al día');
    await input.press('Enter');

    await page.getByRole('button', { name: 'Editar horarios' }).click({ timeout: NANNY_RESPONSE_TIMEOUT });
    const sheet = page.getByRole('dialog', { name: /editar horarios|ajustar horarios/i });
    await expect(sheet).toBeVisible();

    // Cambiar el primer horario
    const firstTime = sheet.getByLabel('Horario 1');
    await firstTime.fill('09:30');

    // Guardar — el sheet se cierra
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(sheet).not.toBeVisible();

    // El bubble debe mostrar el nuevo horario en el resumen
    await expect(page.getByText(/09:30/)).toBeVisible();

    // Confirmar la medicación
    await page.getByRole('button', { name: 'Sí, crear' }).click();

    // Los botones desaparecen tras confirmar
    await expect(page.getByRole('button', { name: 'Sí, crear' })).not.toBeVisible({ timeout: 5_000 });
  });

  test('5 — botón de reply (alternativa al swipe) abre preview de respuesta', async ({ page }) => {
    // Primero generamos un mensaje al que se pueda responder
    const input = page.getByPlaceholder('Mensaje');
    await input.fill('Hola Nanny');
    await input.press('Enter');
    await expect(page.getByText('Entendido, anotado.')).toBeVisible({ timeout: NANNY_RESPONSE_TIMEOUT });

    // El botón de reply alternativo es accesible via teclado (sr-only que se muestra en focus)
    const replyButton = page.getByRole('button', { name: 'Responder a este mensaje' }).first();
    await replyButton.focus();
    await replyButton.click();

    // El preview de "Respondiendo a..." debe aparecer (banner con texto del mensaje)
    await expect(page.getByRole('button', { name: 'Cancelar respuesta' })).toBeVisible();
  });
});
