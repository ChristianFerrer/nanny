# Plan de Confiabilidad y Sincronización — Nanny

> **Documento autocontenido para los próximos 5 sprints.** Si arrancás una sesión nueva sin contexto previo, lee este archivo + `CLAUDE.md` (secciones 1-3 y 8). Cubre el periodo post-rutinas semanales (mayo 2026 en adelante).

---

## 1. Contexto

Después del cierre del rediseño Apple-inspired (`REDESIGN-PLAN.md`) y de la feature de rutinas semanales + cancelaciones puntuales (abril 2026), el siguiente foco es **confiabilidad y sincronización**. Tres problemas observados en producción:

1. **Detecciones perdidas silenciosamente.** El extractor LLM pide JSON vía instrucciones en el prompt; cuando el formato falla, un `try/catch` en `extractor.ts` devuelve `intent: CHAT` sin logging. La detección desaparece y nadie se entera. Score actual de eval: precision ~52%, recall ~80%.

2. **Cambios de un padre invisibles para el otro.** Si mamá agrega un evento desde su teléfono, papá no lo ve en `/agenda` ni `/tareas` hasta que recarga manualmente. La promesa central de "carga mental compartida" se rompe en el flujo más común.

3. **Push limitado a morning brief y push manuales.** Si la dosis de medicación es a las 17:00 y el padre no abrió la app, no hay alerta proactiva en ese momento. Si hay un evento en 30 minutos, tampoco.

**Filosofía del plan:** calidad sobre cantidad. Cada fase tiene un criterio de salida explícito; si no se cumple, se itera antes de avanzar.

---

## 2. Decisiones vinculantes

| Decisión | Detalle |
|---|---|
| Branch | Cada sprint en su propia branch desde `claude/continue-previous-session-OleqU`. Merge cuando quality gate pasa. |
| Commits | `feat(area): descripción` o `fix(area): descripción`. Granularidad: 1 commit por unidad lógica, no por archivo. |
| Quality gate | Cada fase cierra solo si su criterio de salida pasa. Si falla, iterar antes de avanzar. |
| Eval | Snapshot en Fase 1 (baseline) y antes/después de Fase 4. Si Fase 4 baja score >2pp, revertir. |
| E2E | Los 5 tests de `app/tests/chat.spec.ts` deben quedar verdes en cada commit. |
| Rollback | `git revert <commit>`, nunca `--hard` en branches pusheadas. |
| Migraciones | Vía `./scripts/db-migrate.sh` desde la máquina del usuario (sandbox no tiene acceso a DB). |

---

## 3. Las 5 fases

### Fase 1 — Setup y baseline (~2 días) — RIESGO BAJO

**Objetivo:** baseline numérico y estado limpio antes de cambiar nada.

**Tareas:**
1. Verificar que `supabase/migrations/20260427_routine_exceptions.sql` esté aplicada. Si no, aplicarla con `./scripts/db-migrate.sh`.
2. Correr `npm run test:eval:save` con `OPENAI_API_KEY` válida. Registrar:
   - Precision / recall global
   - Precision / recall por categoría (eventos, tareas, medicaciones, schedule_changes)
   - Conversaciones que peor/mejor performaron
3. Verificar que los 5 E2E del chat (`app/tests/chat.spec.ts`) estén verdes en CI.
4. Documentar el baseline en `CLAUDE.md` sección 9 con la fecha.

**Criterio de salida:**
- Migración aplicada (`./scripts/db-migrate.sh --status` muestra 0 pendientes)
- Baseline numérico documentado en `CLAUDE.md`
- 5/5 E2E verdes en CI

**Riesgo:** bajo. Es solo medición. El único riesgo es que la eval consume tokens de OpenAI (~$1-2 por corrida).

---

### Fase 2 — Push reminders X minutos antes (~1 semana) — RIESGO BAJO-MEDIO

**Objetivo:** push proactivos antes de eventos y tomas de medicación, no solo en el morning brief.

**Tareas:**
1. Nueva tabla `notifications_sent` (o columna `notified_at` en `events` y `medication_intakes`):
   ```sql
   CREATE TABLE notifications_sent (
     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
     entity_type TEXT NOT NULL CHECK (entity_type IN ('event', 'medication_intake')),
     entity_id UUID NOT NULL,
     notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (entity_type, entity_id)
   );
   ```
2. Endpoint `/api/cron/upcoming-reminders` con `maxDuration = 60`:
   - Query: eventos con `date_start` entre `NOW()` y `NOW() + 30 min` sin notificación previa
   - Query: tomas con `scheduled_at` entre `NOW()` y `NOW() + 15 min` sin notificación
   - Para cada hit: enviar push con `/api/push-notify`, insertar en `notifications_sent`
3. Configurar cron en cron-job.org cada 10 min apuntando al endpoint con `?secret=<CRON_SECRET>`
4. Agregar a la tabla de crons en `CLAUDE.md` sección 1

**Criterio de salida:**
- En al menos un evento real: push llega entre 25-30 min antes del `date_start`
- En al menos una toma real: push llega entre 10-15 min antes del `scheduled_at`
- Re-correr el cron 2 veces no genera duplicados (tabla `notifications_sent` previene)
- Sin errores 500 en los logs de Vercel durante 24h

**Riesgo:** bajo. Es additive, no toca código existente. El único riesgo: configurar mal la ventana y mandar push tarde o duplicados — la tabla `notifications_sent` lo cubre.

---

### Fase 3 — Real-time sync vía Supabase Realtime (~1 semana) — RIESGO MEDIO

**Objetivo:** cambios hechos por un padre se reflejan en el dispositivo del otro sin refresh manual.

**Tareas:**
1. Hook custom `useRealtimeFamily(familyId, tables: string[])` en `app/src/lib/realtime.ts`:
   - Suscribirse a INSERT/UPDATE/DELETE de las tablas especificadas, filtradas por `family_id` (o vía join donde aplique)
   - Invocar el `notify()` de `store.ts` al recibir un evento, así los listeners refetchean
   - Cleanup al unmount
2. Aplicar el hook en:
   - `/agenda` → `events`, `tasks`, `routines`, `routine_exceptions`, `medications`
   - `/tareas` → `tasks`
   - `/hijo/[id]` → `routines`, `medications`, `events`, `tasks` filtrados por `child_id`
   - `/chat` ya tiene polling — mantener ambos (realtime más responsive, polling como red de seguridad)
3. Rate-limit interno: si llegan 5+ eventos en 1s, agrupar y debounce
4. RLS check: las suscripciones de Supabase respetan RLS, validar que `parents.auth_user_id = auth.uid()` filtre correctamente

**Criterio de salida:**
- Dos dispositivos (o dos pestañas) con la misma cuenta abiertas: cambio en uno aparece en el otro en < 2s
- Sin memory leaks tras 5 navegaciones entre tabs (verificar con DevTools heap snapshot)
- En caso de desconexión de WebSocket, fallback al fetch normal funciona sin loops
- E2E del chat siguen verdes

**Riesgo:** medio. Las suscripciones mal manejadas pueden generar render storms o memory leaks. El rate-limit y cleanup explícito mitigan.

---

### Fase 4 — Function calling en el extractor (~2 semanas) — RIESGO ALTO

**Objetivo:** reemplazar la extracción JSON-by-prompt por OpenAI tools con JSON Schema. Eliminar las detecciones perdidas por formato malformado y permitir múltiples acciones en una sola respuesta del LLM.

**Tareas:**
1. Branch nueva `claude/extractor-function-calling` desde producción
2. Definir tools en `app/src/lib/chat/tools.ts`:
   - `create_event` (params: title, event_type, date_start, date_end?, location?, child_id?, assigned_to?)
   - `create_task` (params: title, status, due_date?, assigned_to?, child_id?, parent_task_id?)
   - `create_medication` (params: medication_name, child_id, schedule_times[], duration_days?, frequency?)
   - `create_routine` (params: child_id, name, type, days_of_week[], time_start?, time_end?)
   - `create_routine_exception` (params: routine_id, date, cancelled, reason?)
   - `update_existing_event` (params: event_id, updates)
   - `update_existing_task` (params: task_id, updates)
   - `ask_for_missing_info` (params: type, partial_data, missing[], summary)
   - `stay_silent` (no params)
3. Reescribir `extractor.ts`:
   - Reemplazar el prompt "responde con JSON" por system prompt + tools
   - Procesar `tool_calls[]` de la respuesta en lugar de parsear JSON
   - Mapear cada tool call a la estructura `confirmation` / `additional_confirmations` actual
4. Adaptar `postprocess.ts` solo si hace falta — la mayoría de la validación sigue valiendo
5. El `routine-detector` (regex de seguridad) se mantiene como red de seguridad
6. Tests:
   - Correr `npm run test:eval` antes de cada commit
   - Si baja >2pp del baseline, revertir y diagnosticar
   - 5 E2E del chat siguen verdes

**Criterio de salida:**
- Eval score igual o mejor que el baseline de Fase 1
- Cero JSON parse errors en logs de Vercel durante 7 días
- Los flujos manuales en chat (medicación con confirmación, rutinas, edición de tareas) funcionan idénticos
- Detección de mensajes con múltiples acciones funciona (ej: "compré pañales y ya hice la inscripción del cole" → 2 tool calls)

**Riesgo:** alto. Es el corazón del pipeline AI. Mitigaciones:
- Branch separada
- Eval automática antes/después
- E2E como red de seguridad
- `routine-detector` regex sigue activo

---

### Fase 5 — Validación en producción (~3-5 días) — RIESGO BAJO

**Objetivo:** confirmar que las 4 fases anteriores cumplieron en la realidad, no solo en tests.

**Tareas:**
1. Mirar logs de Vercel: ¿cero errores 500 nuevos?
2. Mirar push delivery: ¿usuarios reciben los recordatorios?
3. Mirar eval automatizada del autopilot: ¿score se mantiene/mejora?
4. Pedir feedback al usuario primario sobre la sensación de fluidez (real-time + push)
5. Revisar tabla `messages.metadata` para detectar patrones de fallas en el extractor que el regex haya tenido que rescatar

**Criterio de salida:**
- Decisión informada de qué viene después: ¿más features (cumpleaños anuales, multi-día), o consolidar?

**Riesgo:** ninguno técnico. Es observación.

---

## 4. Roadmap fuera de scope (post Fase 5)

**Si Fase 5 cierra bien, candidatos para Fase 6+ (sprint dedicado):**
- Cumpleaños anuales y eventos multi-día (gap real, baja frecuencia)
- Conflict detection (promesa de NANNY.md, riesgo de false positives)
- Refactor del chat en componentes (`CHAT-REFACTOR-PLAN.md`)
- Red de apoyo (abuela, niñera) — promesa de NANNY.md
- OCR de emails del cole — promesa de NANNY.md
- Migración a Claude con prompt caching — costo

---

## 5. Anexo A — Prompts de arranque por fase

Pegá uno de estos al inicio de la sesión correspondiente.

### A.1 Fase 1 — Setup y baseline

```
Empezá la Fase 1 del RELIABILITY-PLAN.md.

1. Lee RELIABILITY-PLAN.md sección "Fase 1" + CLAUDE.md sección 1, 9, 10.
2. Confirmá si la migración 20260427_routine_exceptions.sql está aplicada.
   Si no, dame el SQL para que la aplique manualmente y esperá confirmación.
3. Corré la eval suite con npm run test:eval:save y reportá:
   - Precision / recall global
   - Precision / recall por categoría
   - 3 conversaciones con peor score
4. Verificá que los 5 E2E del chat estén verdes en CI.
5. Actualizá CLAUDE.md sección 9 con el baseline fechado.
6. Commit + push.

Esperá mi OK antes de pasar a Fase 2.
```

### A.2 Fase 2 — Push reminders

```
Empezá la Fase 2 del RELIABILITY-PLAN.md.

1. Lee RELIABILITY-PLAN.md sección "Fase 2" + CLAUDE.md sección 1 (cron-jobs).
2. Confirmá que Fase 1 cerró (baseline registrado, E2E verdes).
3. Crear branch claude/push-reminders desde claude/continue-previous-session-OleqU.
4. Implementar:
   - Migración nueva: tabla notifications_sent
   - Endpoint /api/cron/upcoming-reminders
   - Documentar el cron en CLAUDE.md (no podés configurarlo en cron-job.org, eso lo hago yo)
5. Tests: levantar dev server, simular un evento próximo y validar el flujo end-to-end localmente.
6. Push + dame las instrucciones para configurar el cron en cron-job.org.

Esperá mi confirmación de que el cron está corriendo en prod antes de marcar Fase 2 como cerrada.
```

### A.3 Fase 3 — Real-time sync

```
Empezá la Fase 3 del RELIABILITY-PLAN.md.

1. Lee RELIABILITY-PLAN.md sección "Fase 3" + CLAUDE.md sección 5 (Supabase).
2. Confirmá que Fase 2 cerró (push llegando bien en prod).
3. Crear branch claude/realtime-sync desde producción.
4. Implementar useRealtimeFamily hook + aplicar en /agenda, /tareas, /hijo/[id].
5. Validar local con dos pestañas abiertas (no podés probar dos dispositivos físicos).
6. Push y pedime que valide con dispositivo real antes de cerrar.

Quality gate: cambio en una pestaña aparece en otra <2s, sin memory leaks tras 5 navegaciones.
```

### A.4 Fase 4 — Function calling en el extractor

```
Sesión dedicada de alto riesgo. Lee TODO antes de tocar código.

1. Lee RELIABILITY-PLAN.md sección "Fase 4" completa.
2. Lee app/src/lib/chat/extractor.ts y postprocess.ts.
3. Lee app/src/lib/chat/routine-detector.ts (red de seguridad que se mantiene).
4. Verificá baseline de Fase 1 — necesario para validar regresiones.
5. Crear branch claude/extractor-function-calling.
6. Implementación incremental:
   - Definir tools en app/src/lib/chat/tools.ts
   - Reescribir extractor.ts para usar tool calls
   - Correr eval después de cada commit; si baja >2pp, revertir
7. Antes de pushear: 5 E2E verdes + eval igual o mejor.

Esperá explícito OK antes de avanzar entre commits si la eval no es concluyente.
```

### A.5 Fase 5 — Validación en producción

```
Empezá Fase 5 del RELIABILITY-PLAN.md.

1. Lee RELIABILITY-PLAN.md sección "Fase 5".
2. Sacá métricas de los últimos 7 días en prod:
   - Logs de Vercel: errores 500
   - Push delivery: cuántos se enviaron, cuántos reportaron click
   - Autopilot: scores de las últimas corridas
   - Tabla messages: patrones de fallas en metadata
3. Reportá un resumen + recomendación:
   - ¿Cerramos el plan?
   - ¿Iteramos algún sprint específico?
   - ¿Pasamos al roadmap post-Fase 5?
```

---

## 6. Tracking

| Fase | Status | Branch | Commit clave | Validación | Notas |
|---|---|---|---|---|---|
| 1 — Setup y baseline | ⚠️ Parcial | `claude/continue-previous-session-OleqU` | (este) | Eval ✅ Migración ✅ E2E ❌ | Migración aplicada el 5/5/26. Baseline 70/60/74 registrado en CLAUDE.md §9. E2E rotos por feature changes pre-existentes (deuda conocida) — fix obligatorio antes de Fase 4. |
| 1.5 — Fix E2E (mini-sprint) | 🟡 Pusheado, pendiente CI | `claude/continue-previous-session-OleqU` | `1d4fae8` | ⏳ esperando run de Actions | Mocks actualizados a SSE + family-data con familyId/routines. Tests 3-4 reescritos para editor inline. |
| 2 — Push reminders | ⏳ | — | — | — | — |
| 3 — Real-time sync | ⏳ | — | — | — | — |
| 4 — Function calling | ⏳ | — | — | — | Requiere Fase 1.5 cerrada (E2E verdes) como red de seguridad. |
| 5 — Validación en prod | ⏳ | — | — | — | — |

**Estado al cierre de la sesión donde se inicia el plan:** sesión 2026-04-28.

### Bitácora de sesiones

- **2026-05-05** — Fase 1 ejecutada: migración aplicada, baseline numérico tomado (70% overall). E2E test suite revisada y se confirma que los 5 tests fallan por feature changes de abril que no se reflejaron en los tests. Se documenta como Fase 1.5 mini-sprint pre-Fase 4.

---

## 7. Comandos útiles

```bash
# Migrations
./scripts/db-migrate.sh           # aplica las pendientes
./scripts/db-migrate.sh --status  # qué falta

# Eval
cd app
npm run test:eval                 # solo correr y mostrar
npm run test:eval:save            # guardar el run en evaluation_runs
npm run test:eval:diagnose        # eval + diagnóstico AI

# E2E
npm run test:e2e                  # Playwright suite del chat
```

---

## 8. Glosario

- **Baseline**: snapshot numérico (precision / recall por categoría) tomado en Fase 1, sirve como punto de comparación para detectar regresiones en Fase 4.
- **Eval suite**: las 10 conversaciones de test en `app/src/lib/eval/conversations/` que el pipeline AI debe procesar correctamente.
- **Function calling**: feature de OpenAI donde el modelo invoca funciones predefinidas con parámetros estructurados, en vez de devolver texto libre que tenemos que parsear.
- **Quality gate**: criterio explícito de salida de cada fase. Si no se cumple, no se avanza.
- **Red de seguridad**: el `routine-detector` regex sigue activo aún después de Fase 4, por si el LLM falla.
