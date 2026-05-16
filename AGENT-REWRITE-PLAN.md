# Plan de Rediseño — Nanny como Asistente Real

> **Documento operativo del rediseño completo de Nanny.** Define los 6 sprints que llevan del producto actual ("respondedor reactivo con parches") al producto de la visión ("asistente real con criterio temporal propio").
>
> Si arrancás una sesión nueva sin contexto previo, leé:
> 1. `CLAUDE.md` (siempre primero)
> 2. `NANNY-VISION.md` (la visión de producto, decisiones vinculantes)
> 3. Este documento (el plan operativo)
>
> **Versión:** 1.0 — 14 mayo 2026
> **Estado:** Activo. Sprint 0 en ejecución.

---

## 0. Resumen ejecutivo

**Objetivo del plan:** transformar Nanny de **respondedor reactivo** (1 mensaje → 1 respuesta + parches de safety nets) a **agente con criterio temporal propio** (Nanny decide cuándo hablar, escucha en silencio, anticipa, coordina con red de apoyo).

**Alcance del rediseño:**
- ~70% del código actual se mantiene (schemas, UI, push, infra, eval)
- ~30% se reescribe (pipeline AI completo)
- Se construyen nuevos: decision agent, memory engine, learning queue, red de apoyo, integración WhatsApp Business API, pricing tiers

**Duración estimada:** 4-6 semanas a ritmo de 2-3 sesiones por semana.

**Stack confirmado:** Claude Sonnet 4.6 con prompt caching (no gpt-4o).

---

## 1. Los 6 sprints

| # | Sprint | Sesiones | Esfuerzo | Riesgo | Branch |
|---|---|---|---|---|---|
| 0 | Foundation | 1 (bundled con plan) | 1 día | Bajo | `claude/agent-rewrite-sprint-0` |
| 1 | Decision Agent | 1 | 3-4 días | Medio-alto | `claude/agent-rewrite-sprint-1` |
| 2 | Memory Engine | 1 | 3-4 días | Medio | `claude/agent-rewrite-sprint-2` |
| 3 | Listening Pipeline + Cutover | 1 | 2-3 días | Alto | `claude/agent-rewrite-sprint-3` |
| 4 | Red de apoyo + WhatsApp | 3 (4a, 4b, 4c) | 1-2 semanas | Alto (Meta) | `claude/agent-rewrite-sprint-4a/4b/4c` |
| 5 | Pricing + Stripe | 1 | 3-4 días | Bajo | `claude/agent-rewrite-sprint-5` |
| 6 | Polish + Launch | 1 | 3-4 días | Bajo | `claude/agent-rewrite-sprint-6` |

Cada sprint:
- Nace de la rama de producción actual (`claude/continue-previous-session-OleqU`)
- Termina con un PR que se mergea solo cuando pasa su validación
- Sin tocar producción hasta el cutover de Sprint 3 (con excepción de Sprint 0 que es aditivo)

---

## 2. Sprint 0 — Foundation

**Objetivo:** preparar el terreno sin tocar comportamiento. Migraciones SQL + types + skeleton.

**Tareas:**
1. Crear 5 migraciones SQL nuevas:
   - `family_patterns` — memoria semántica de patrones con confidence
   - `family_preferences` — preferencias explícitas persistentes
   - `family_learning_queue` — cosas que Nanny quiere aprender
   - `support_contacts` — red de apoyo (abuela, niñera, etc.)
   - `whatsapp_conversations` — log de mensajes Nanny ↔ contactos
2. Agregar tipos TypeScript en `app/src/lib/types.ts` para cada entidad nueva
3. Agregar las nuevas tablas a `ALLOWED_TABLES` en `family-write/route.ts`
4. Crear skeleton de 4 endpoints (placeholders vacíos, retornan 501 Not Implemented):
   - `/api/cron/nanny-wake` (decision agent — Sprint 1)
   - `/api/cron/memory-updater` (memory engine — Sprint 2)
   - `/api/whatsapp/inbound` (webhook Meta — Sprint 4)
   - `/api/whatsapp/send` (envío Meta — Sprint 4)
5. Actualizar `CLAUDE.md` con las 5 migraciones nuevas en sección 10

**Criterio de salida:**
- `npx tsc --noEmit` limpio
- `./scripts/db-migrate.sh --status` muestra las 5 nuevas pendientes
- Usuario aplica migraciones con `./scripts/db-migrate.sh`
- PR aprobado y mergeado

**Riesgo:** bajo. Es aditivo — no toca pipeline existente. Si se mergea sin aplicar las migraciones, no rompe nada (las tablas inexistentes solo afectan los nuevos endpoints, que son skeleton sin uso).

---

## 3. Sprint 1 — Decision Agent

**Objetivo:** implementar el cerebro temporal de Nanny. Cron despierta 4 veces por día + event-triggered. Decide si tiene algo que decir.

**Tareas:**
1. Implementar `/api/cron/nanny-wake/route.ts`:
   - Itera familias activas
   - Para cada una: arma el contexto (perfil, agenda 48h, mensajes 24h, patrones, preferencias, learning queue, estado emocional efímero)
   - Invoca Claude Sonnet 4.6 con prompt caching
   - Si decision = intervenir → escribe mensaje en chat o dispara WhatsApp (Sprint 4) o push
   - Si decision = silencio → no hace nada, loguea
2. System prompt completo del decision agent — basado en `NANNY-VISION.md` Sección 3 (8 principios) y Sección 9 (casos fundacionales)
3. Configurar cron en cron-job.org cada 1h (la función iterará familias y disparará solo a las que están en uno de los 4 momentos clave + event-triggered)
4. Reemplazar progresivamente la responder reactiva: cuando llega mensaje al chat, se invoca decision agent en lugar de classifier+extractor+responder
5. Mantener el listening pipeline (capturar info estructurada) — eso es Sprint 3, no Sprint 1
6. Agregar tabla `decision_agent_log` para diagnosis (cada despertar, qué decidió, por qué)

**Criterio de salida:**
- Decision agent despertando 4 veces/día por la familia de testing (Christian)
- Eval suite mantiene ≥ 75% overall (acepta caída de hasta 3pp porque el comportamiento cambia significativamente; las 10 convs miden lo viejo)
- Casos fundacionales 1-7 (de NANNY-VISION.md §9) pasan manualmente
- Costo medio por familia ≤ $5/mes (validado con logs)
- PR aprobado y mergeado

**Riesgo:** medio-alto. Es el core del rediseño. Mitigación: el responder reactivo viejo se queda como fallback durante esta fase. Si el decision agent falla, se usa el viejo. Cutover total recién en Sprint 3.

---

## 4. Sprint 2 — Memory Engine

**Objetivo:** dar a Nanny memoria semántica real (patrones + preferencias + learning queue), no solo eventos atómicos.

**Tareas:**
1. Implementar `/api/cron/memory-updater/route.ts` (cron diario):
   - Lee últimas 24h de actividad por familia
   - Propone patrones nuevos al modelo (Claude Sonnet)
   - Actualiza `confidence` de patrones existentes (sube si se confirma, baja si se contradice)
   - Encola preguntas en `family_learning_queue` cuando detecta info faltante
2. Integrar con decision agent: el contexto del decision agent incluye `family_patterns` (≥0.5 confidence) + `family_preferences` activas + `family_learning_queue`
3. Lógica de aplicación de patrones:
   - confidence ≥ 0.7 → aplica el patrón pero lo verbaliza
   - confidence 0.5-0.7 → pregunta antes de aplicar
   - confidence < 0.5 → ignorar
4. Captura de correcciones: cuando el usuario corrige a Nanny ("no, eso lo hago yo"), persistir como preferencia con `source='correction'` y máxima prioridad
5. Memoria efímera emocional: ya implícita en los mensajes recientes del decision agent. Sin nueva tabla. Agregar un flag detectado por el listening pipeline (Sprint 3) — placeholder por ahora

**Criterio de salida:**
- Después de 1 semana usando Nanny, hay ≥ 5 patrones en `family_patterns` para la familia de testing con confidence ≥ 0.5
- Al menos 1 preferencia explícita registrada vía corrección
- Learning queue activa: Nanny preguntó al menos 1 cosa de la cola en una semana
- Eval suite no baja del baseline post-Sprint 1
- PR aprobado y mergeado

**Riesgo:** medio. El memory updater extrayendo patrones equivocados es peligroso. Mitigación: confidence bajo al inicio + threshold de aplicación + correcciones explícitas pesando 10×.

---

## 5. Sprint 3 — Listening Pipeline + Cutover

**Objetivo:** el momento crítico. Reemplazar el pipeline viejo (classifier + extractor + responder) por el listening pipeline silencioso + decision agent. Cutover total.

**Tareas:**
1. Implementar **listening pipeline** en `app/src/lib/chat/listener.ts`:
   - Recibe mensaje del chat
   - Una llamada a Claude mini: ¿hay info estructurable acá? (evento, tarea, medicación, rutina, preferencia, sensibilidad emocional)
   - Si sí: extrae y persiste silenciosamente (sin responder en chat)
   - Si silencio_emocional o conflict_parents: flag para 48h del decision agent
   - NO genera reply textual — eso es trabajo del decision agent
2. Reemplazar el endpoint `/api/chat`:
   - Antes: invocaba `processChatPipeline` (classifier+extractor+responder)
   - Ahora: invoca `listener` (silent capture) + dispara `nanny-wake` event-triggered (decision agent decide si responder en chat)
3. Retirar progresivamente: classifier, extractor, responder, routine-detector regex, synthesize functions, safety nets de respuestas cortas
4. Mantener: validation.ts (con ajustes para nuevas tools si las hay), postprocess básico, el cliente del chat
5. Eval comparativa: correr eval suite contra nuevo pipeline + reportar score

**Criterio de salida:**
- Eval score ≥ 75% (acepta caída moderada porque el comportamiento es fundamentalmente diferente — el viejo "siempre responde", el nuevo "responde cuando aporta valor", y la eval mide cuántos items detectó, no cuántas veces respondió correctamente)
- **Métrica nueva crítica**: % de mensajes con respuesta = 15-25% (target de la visión). Si > 30%, Nanny todavía habla demasiado.
- Casos fundacionales 1-7 pasan manualmente
- Costo medio por familia ≤ $5/mes
- Sin regresiones en E2E del chat
- PR aprobado y mergeado

**Riesgo:** alto. Es el cutover real. Mitigaciones:
- Branch separada hasta validación completa
- Feature flag `USE_NEW_PIPELINE` controlable por familia (default false, true solo para la familia de testing)
- Cuando ambos pipelines coexisten 1 semana sin issues, se mergea y se prende para todos

---

## 6. Sprint 4 — Red de apoyo + WhatsApp Business

**Objetivo:** habilitar que Nanny escriba afuera del chat familiar — a la abuela, la niñera, contactos de emergencia.

**Sprint 4a — Setup Meta + UI de contactos** (1 sesión)
1. Trámite con Meta para WhatsApp Business API (puede tomar días, arrancar pronto)
2. Configurar número dedicado + plantillas iniciales aprobadas
3. UI nueva en `/perfil` → "Red de apoyo":
   - Lista de contactos
   - Crear/editar/eliminar
   - Estado: pendiente consentimiento / activo / rechazado
4. Endpoint `/api/support-contacts` CRUD

**Sprint 4b — Integración Meta + interpretación** (1 sesión)
1. Webhook `/api/whatsapp/inbound` recibe mensajes de contactos
2. Endpoint `/api/whatsapp/send` envía vía Meta API
3. Mini LLM call para interpretar respuestas humanas ("dale lo recojo" → confirmación)
4. Persiste todo en `whatsapp_conversations`
5. Flow de consentimiento: primer mensaje pide opt-in, espera respuesta antes de activar

**Sprint 4c — Integración con decision agent** (1 sesión)
1. Decision agent puede decidir `delivery: 'whatsapp_contact'`
2. Cuando un contacto responde, se gatilla decision agent event-triggered
3. Nanny vuelve al chat familiar con la respuesta traducida
4. Caso fundacional 3 (coordinación con abuela) funciona end-to-end

**Criterio de salida total (Sprint 4):**
- Caso fundacional 3 (coordinación con abuela) pasa end-to-end con un contacto real
- Privacidad estricta: Nanny no menciona info no relevante al contacto
- 0 falsos positivos de consentimiento (nunca escribe a alguien que no aceptó)
- PRs aprobados y mergeados

**Riesgo:** alto. Depende de aprobación Meta + interpretación robusta de respuestas humanas. Mitigación: arrancar trámite Meta apenas Sprint 4 empieza; tener fallback "Nanny te avisa que tenés que llamar a la abuela vos" si la integración falla.

---

## 7. Sprint 5 — Pricing + Stripe

**Objetivo:** activar el modelo de negocio. Free tier limitado + Premium $9.99 + trial 14 días.

**Tareas:**
1. Cuenta Stripe activa (acción del founder, no de Claude)
2. Webhook Stripe en `/api/stripe/webhook` (subscription created/updated/cancelled)
3. Tabla `family_subscriptions`:
   - status (trial / active / cancelled / past_due)
   - tier (free / premium / familia_plus)
   - trial_ends_at, current_period_end, stripe_subscription_id
4. Lógica de gating en producción:
   - Free tier: 30 msgs/mes hard limit, 1 hijo max, sin decision agent, sin red de apoyo
   - Trial 14 días: todo activado, sin cobro
   - Premium activo: todo activado
5. UI de upgrade: pantalla `/upgrade` con tiers comparados
6. Flow de checkout: Stripe Checkout embebido o redirect
7. Downgrade automático cuando vence trial sin pago
8. Email transaccional: confirmaciones, reminders pre-fin-trial

**Criterio de salida:**
- Flow completo signup → trial 14 días → conversión a premium funciona
- Free tier respeta límites (30 msgs/mes bloqueado)
- Stripe webhook idempotente
- 1 transacción real de prueba con tarjeta test
- PR aprobado y mergeado

**Riesgo:** bajo técnico. Riesgo de producto: si el pricing no convierte, hay que iterar (eso es post-launch).

---

## 8. Sprint 6 — Polish + Launch Prep

**Objetivo:** dejar todo listo para invitar usuarios reales.

**Tareas:**
1. Eval final contra todo el sistema nuevo
2. Stress test: simular 100 familias activas, ver si los crons escalan
3. Documentación de usuario (FAQ, "cómo usar a Nanny", "cómo agregar a la abuela")
4. Soporte: email transaccional + canal de soporte (formulario? WhatsApp?)
5. Landing actualizada con el nuevo modelo (la actual menciona red de apoyo en mockup pero no como feature real)
6. Métricas de tracking: tablero básico con métricas de Sección 12 de la visión
7. Aviso legal / política de privacidad / términos de servicio (consultar con abogado)
8. **Validación cualitativa con tu familia 1 semana**: Christian + Sofía usando la nueva Nanny día a día. Si "se siente como asistente humana" → launch. Si todavía "se siente como libreta" → iterar.

**Criterio de salida:**
- Validación cualitativa positiva
- Eval ≥ 75% sostenido
- 0 errores 500 en producción 72h consecutivas
- Documentación pública disponible
- Listo para abrir registros públicos

---

## 9. Tracking

| Sprint | Status | Branch | Commit clave | PR | Notas |
|---|---|---|---|---|---|
| 0 — Foundation | ✅ Mergeado | `claude/continue-previous-session-OleqU` | `986d8f8` | #3 | 14/5/26 |
| 1 — Decision Agent | ✅ Mergeado | `claude/nanny-sprint1-decision-agent-0XltZ` | `2a0a488` | #4 | Sonnet 4.6 + prompt caching, 4 momentos ±15min, dedup 4h, feature flag por familia |
| 2 — Memory Engine | 🔍 En review | `claude/agent-rewrite-sprint-2` | (pendiente push) | (pendiente PR) | Memory updater diario + captura inline en decision agent + decay 14d + soft-delete vía confidence |
| 3 — Listening + Cutover | ⏳ | — | — | — | — |
| 4a — Meta + UI contactos | ⏳ | — | — | — | — |
| 4b — WhatsApp integración | ⏳ | — | — | — | — |
| 4c — Decision agent + WhatsApp | ⏳ | — | — | — | — |
| 5 — Pricing + Stripe | ⏳ | — | — | — | — |
| 6 — Polish + Launch | ⏳ | — | — | — | — |

### Bitácora de sesiones

- **2026-05-14** — Sesión inicial. Creado este plan. Sprint 0 ejecutándose en branch `claude/agent-rewrite-sprint-0`.
- **2026-05-15** — Sprint 1 implementado y mergeado a `claude/continue-previous-session-OleqU` (PR #4, commit `2a0a488`). Migración aplicada, env vars seteadas, cron-job.org `Nanny-Wake` activo. Primer despertar real validado: trigger_moment=evening, intervene=false con razón coherente, cost_usd=0.015, latency 2.5s. Cache hit rate pendiente de medición tras el 2do despertar.
- **2026-05-16** — Sprint 2 implementado en `claude/agent-rewrite-sprint-2`. Memory updater diario + captura inline en decision agent. Sin migraciones nuevas (las 3 tablas de Sprint 0 cubren todo). Pendiente: configurar cron-job.org `Nanny-MemoryUpdater` con `0 3 * * *`, observar 3-7 días de operaciones reales contra mi familia.

---

## 10. Anexo A — Prompts de arranque por sprint

Pegá uno de estos al inicio de la sesión correspondiente para que Claude arranque sin ambigüedad.

### A.0 — Sprint 0 (Foundation)
*Ya ejecutado en la sesión inicial — no se reusa.*

### A.1 — Sprint 1 (Decision Agent)
```
Continuamos con el rediseño de Nanny. Sprint 1 — Decision Agent.

Pre-lectura obligatoria:
1. CLAUDE.md (auto-cargado)
2. NANNY-VISION.md
3. AGENT-REWRITE-PLAN.md sección 3 (Sprint 1)

Verificá:
- Sprint 0 está mergeado (las 5 migraciones aplicadas, types creados, endpoints skeleton existen)
- Estás en branch limpia (sin cambios pendientes)

Hacé:
1. Crear branch claude/agent-rewrite-sprint-1 desde claude/continue-previous-session-OleqU
2. Implementar /api/cron/nanny-wake/route.ts con:
   - Iteración de familias activas
   - Armado de contexto (perfil, agenda 48h, mensajes 24h, patrones, preferencias)
   - Invocación de Claude Sonnet 4.6 con prompt caching
   - Procesamiento de decision (intervene / silent / message / delivery / priority)
3. System prompt completo del decision agent — usar NANNY-VISION.md §3 y §9 como base
4. Crear tabla decision_agent_log (migración nueva) para diagnosis
5. Integración: cuando llega mensaje al chat, invocar listener + event-triggered decision agent (el listener viene en Sprint 3, por ahora mantener el viejo classifier+extractor como fallback)
6. Configurar cron-job.org cada 1h (la función filtra familias por momento del día)

Validación:
- tsc + lint limpios
- Eval suite ≥ 75% overall
- Casos fundacionales 1-7 (NANNY-VISION §9) pasan manualmente
- Costo medio ≤ $5/familia/mes
- PR contra producción con descripción + screenshots

Esperá mi OK antes de mergear el PR.
```

### A.2 — Sprint 2 (Memory Engine)
```
Continuamos con el rediseño de Nanny. Sprint 2 — Memory Engine.

Pre-lectura obligatoria:
1. CLAUDE.md
2. NANNY-VISION.md (especialmente §5 Memoria semántica)
3. AGENT-REWRITE-PLAN.md sección 4 (Sprint 2)

Verificá:
- Sprint 1 mergeado y estable
- Tablas family_patterns, family_preferences, family_learning_queue existen (Sprint 0)
- Decision agent funcionando (Sprint 1)

Hacé:
1. Crear branch claude/agent-rewrite-sprint-2
2. Implementar /api/cron/memory-updater/route.ts (cron diario)
3. Lógica de extracción de patrones + update de confidence
4. Captura de correcciones explícitas → preferences con prioridad alta
5. Integrar contexto de memoria en el decision agent (pasar patrones ≥0.5 + prefs activas + learning queue)
6. Lógica de aplicación por confidence (≥0.7 aplica + verbaliza; 0.5-0.7 pregunta; <0.5 ignora)

Validación:
- Después de 1 día de uso, hay ≥ 3 patrones detectados en la familia de testing
- Al menos 1 corrección capturada y aplicada
- Eval no baja del baseline post-Sprint 1
- PR con descripción + ejemplos de patrones detectados

Esperá mi OK antes de mergear.
```

### A.3 — Sprint 3 (Listening Pipeline + Cutover)
```
Continuamos con el rediseño de Nanny. Sprint 3 — Listening Pipeline + Cutover. RIESGO ALTO.

Pre-lectura obligatoria (TODO):
1. CLAUDE.md
2. NANNY-VISION.md COMPLETO
3. AGENT-REWRITE-PLAN.md sección 5
4. app/src/lib/chat/ — todo el código actual del pipeline (vamos a jubilarlo)

Verificá:
- Sprints 1 y 2 mergeados y estables
- Eval baseline post-Sprint 2 documentado
- E2E del chat verdes en CI

Hacé:
1. Crear branch claude/agent-rewrite-sprint-3
2. Implementar app/src/lib/chat/listener.ts (silent capture)
3. Reemplazar /api/chat para usar listener + event-triggered decision agent
4. Feature flag USE_NEW_PIPELINE: default false, true solo para tu familia inicialmente
5. Retirar progresivamente: classifier, extractor, responder, routine-detector regex, synthesize functions
6. Mantener: validation.ts (adaptado), postprocess básico, cliente del chat
7. Eval comparativa: nuevo pipeline vs viejo

Validación:
- Eval ≥ 75% overall
- % de mensajes con respuesta entre 15-25% (target de visión)
- Casos fundacionales 1-7 pasan manualmente
- E2E verdes
- Sin regresión en costos
- PR con eval comparativa documentada

Esperá mi OK antes de mergear. Después del merge, monitorear 1 semana antes de prender USE_NEW_PIPELINE para todos.
```

### A.4a — Sprint 4a (Meta + UI contactos)
```
Continuamos con el rediseño de Nanny. Sprint 4a — Setup Meta + UI contactos.

Pre-lectura:
1. CLAUDE.md
2. NANNY-VISION.md §7 (Red de apoyo)
3. AGENT-REWRITE-PLAN.md sección 6

Pre-requisitos del usuario (NO Claude):
- Cuenta Meta Business activa
- Número de WhatsApp dedicado verificado
- Plantillas iniciales sometidas a Meta (puede tomar días la aprobación)

Verificá:
- Sprint 3 mergeado y estable
- Tabla support_contacts existe (Sprint 0)

Hacé:
1. Crear branch claude/agent-rewrite-sprint-4a
2. UI nueva en /perfil → "Red de apoyo": lista, crear, editar, eliminar
3. CRUD endpoint /api/support-contacts
4. Estado por contacto: pendiente / activo / rechazado
5. Aviso visual: "Tu número de Nanny: [+XXX]" con instrucciones de cómo agregarlo a los contactos personales

Validación:
- Crear 3 contactos manualmente vía UI
- Lista persiste y se edita correctamente
- PR con screenshots

Esperá mi OK antes de mergear y arrancar 4b.
```

### A.4b — Sprint 4b (WhatsApp integración Meta)
```
Sprint 4b — Integración Meta API + interpretación de respuestas.

Pre-lectura:
1. CLAUDE.md
2. NANNY-VISION.md §7
3. AGENT-REWRITE-PLAN.md sección 6

Pre-requisitos:
- Plantillas Meta aprobadas
- Webhook URL configurada en Meta dashboard apuntando a tu deployment

Hacé:
1. Crear branch claude/agent-rewrite-sprint-4b
2. Webhook /api/whatsapp/inbound (recibe mensajes)
3. Endpoint /api/whatsapp/send (envía vía Meta API con tu token de página)
4. Mini LLM call (Claude) para interpretar respuestas humanas → {intent, parsed_response}
5. Persistir todo en whatsapp_conversations
6. Flow de consentimiento: primer mensaje a contacto nuevo pide opt-in, espera respuesta

Validación:
- Enviar mensaje real a un contacto de prueba (tu propio número o un colaborador)
- Recibir respuesta y parsearla correctamente
- Privacy: el contacto no ve info adicional
- PR con logs de la primera conversación end-to-end

Esperá mi OK antes de mergear y arrancar 4c.
```

### A.4c — Sprint 4c (Decision Agent + WhatsApp end-to-end)
```
Sprint 4c — Integración Decision Agent ↔ WhatsApp.

Pre-lectura:
1. CLAUDE.md
2. NANNY-VISION.md §7 + caso fundacional 3
3. AGENT-REWRITE-PLAN.md sección 6

Hacé:
1. Crear branch claude/agent-rewrite-sprint-4c
2. Decision agent puede emitir delivery='whatsapp_contact' con contact_id + mensaje
3. Cuando contacto responde, event-triggered al decision agent
4. Decision agent traduce respuesta y postea en chat familiar
5. Caso fundacional 3 end-to-end:
   - Papá+mamá no pueden recoger
   - Nanny escribe a la abuela
   - Abuela confirma
   - Nanny lo reporta en el chat familiar

Validación:
- Caso 3 funcionando end-to-end con tu familia real
- Tiempo de loop completo < 10 min
- Privacy estricta validada
- PR con video o transcripción del flow

Esperá mi OK antes de mergear.
```

### A.5 — Sprint 5 (Pricing + Stripe)
```
Sprint 5 — Pricing + Stripe + Trial.

Pre-lectura:
1. CLAUDE.md
2. NANNY-VISION.md §10 (Modelo de negocio)
3. AGENT-REWRITE-PLAN.md sección 7

Pre-requisitos:
- Cuenta Stripe activa con API keys
- Stripe webhook URL configurada apuntando a tu deployment

Hacé:
1. Crear branch claude/agent-rewrite-sprint-5
2. Tabla family_subscriptions
3. Webhook /api/stripe/webhook (subscription events)
4. Gating en producción: free tier vs trial vs premium
5. UI /upgrade con tiers
6. Checkout flow Stripe
7. Downgrade automático al vencer trial
8. Email transaccional (Resend / similar)

Validación:
- Signup → trial 14 días → conversión a premium funciona
- Free tier respeta 30 msgs/mes
- Webhook idempotente
- 1 transacción de prueba con tarjeta test
- PR con flow documentado

Esperá mi OK.
```

### A.6 — Sprint 6 (Polish + Launch)
```
Sprint 6 — Polish + Launch Prep.

Pre-lectura:
1. CLAUDE.md
2. NANNY-VISION.md COMPLETO (§12 métricas, §13 decisiones)
3. AGENT-REWRITE-PLAN.md sección 8

Hacé:
1. Crear branch claude/agent-rewrite-sprint-6
2. Eval final + stress test (100 familias simuladas)
3. Docs públicas: FAQ, cómo usar, cómo agregar abuela
4. Soporte: canal definido (email / WhatsApp)
5. Landing actualizada con features reales nuevas
6. Tablero de métricas básico
7. Términos / privacidad / aviso legal (placeholder, abogado después)
8. Validación cualitativa 1 semana con tu familia

Criterio: si tu familia siente "es una asistente real" → launch. Sino → iterar.

PR final con todo + lista de checks pre-launch.
```

---

## 11. Anexo B — Recuperación de sesión

Si esta sesión muere o vas a empezar una nueva sesión para continuar el rediseño, sigue este protocolo:

### Caso 1 — Querés saber dónde estamos
Abrí un chat nuevo con Claude Code y pegá:

```
Continuamos con el rediseño de Nanny.

Pre-lectura obligatoria (en orden):
1. CLAUDE.md
2. NANNY-VISION.md
3. AGENT-REWRITE-PLAN.md

Después de leerlos, decime:
- En qué sprint estamos según la tabla de tracking (sección 9 del plan)
- Qué está mergeado y qué está pendiente
- Qué deberíamos hacer hoy
```

Claude va a leer los docs, revisar el estado de git, y proponer el siguiente paso.

### Caso 2 — Sabés qué sprint querés ejecutar
Abrí un chat nuevo y pegá el prompt correspondiente del Anexo A.

Ejemplos:
- Para Sprint 1: usar A.1
- Para Sprint 4b: usar A.4b
- Etc.

### Caso 3 — Algo se rompió, querés debugar
Abrí un chat nuevo y pegá:

```
El rediseño de Nanny tiene un problema. Pre-lectura:
1. CLAUDE.md
2. NANNY-VISION.md
3. AGENT-REWRITE-PLAN.md
4. El sprint donde está el bug

Síntoma observado: [DESCRIBI ACA]
Cuándo empezó: [SPRINT N MERGEADO HACE X DIAS]
Reproducción: [PASOS]

Diagnosticá y proponé fix. NO toques producción sin confirmar conmigo.
```

### Caso 4 — Querés iterar la visión (cambiar algo de NANNY-VISION.md)
La visión es **vinculante**. Solo se cambia con discusión explícita. Si querés discutirla:

```
Quiero revisar NANNY-VISION.md. Lo que NO me cierra es: [DESCRIBI]

Pre-lectura:
1. CLAUDE.md
2. NANNY-VISION.md
3. AGENT-REWRITE-PLAN.md

Analicemos juntos antes de cambiar nada. Si decidimos cambiar, actualizamos
la versión del doc y notamos qué sprints se ven afectados.
```

### Reglas no negociables

1. **Nunca empezar a codear sin leer CLAUDE.md + NANNY-VISION.md + AGENT-REWRITE-PLAN.md primero.**
2. **Nunca mergear un sprint sin pasar su criterio de salida.**
3. **Nunca tocar producción directamente.** Todo va en branches de sprint con PR.
4. **Nunca cambiar la visión sin discusión explícita.** Si un sprint requiere violar un principio, se discute primero.
5. **Cada sesión cierra con commit + push, aunque esté incompleta.** No dejar trabajo en limbo local.

---

## 12. Glosario

- **Decision Agent**: el componente nuevo que decide cada N tiempo si Nanny tiene algo que decir
- **Listening Pipeline**: el componente nuevo que captura info silenciosamente sin generar respuesta
- **Memory Updater**: cron diario que extrae patrones de la actividad reciente
- **Confidence**: float 0-1 que indica qué tan seguro está el sistema de un patrón inferido
- **Learning Queue**: cola de cosas que Nanny quiere aprender de la familia
- **Red de apoyo**: contactos externos (abuela, niñera) a los que Nanny escribe por WhatsApp
- **Sprint**: unidad de trabajo entre 1 día y 2 semanas, con entregable medible y PR propio
- **Cutover** (Sprint 3): el momento donde el pipeline viejo se jubila y el nuevo toma su lugar

---

## 13. Comandos útiles

```bash
# Aplicar migraciones nuevas
./scripts/db-migrate.sh

# Status de migraciones
./scripts/db-migrate.sh --status

# Query ad-hoc a Supabase
./scripts/db-query.sh "SELECT * FROM family_patterns LIMIT 5;"

# Eval suite
cd app && npm run test:eval
cd app && npm run test:eval:save  # guarda en evaluation_runs

# Type check
cd app && npx tsc --noEmit

# E2E del chat
cd app && npm run test:e2e

# Routine detector tests (legacy pero útil)
cd app && npx tsx src/lib/chat/routine-detector.test.ts
```
