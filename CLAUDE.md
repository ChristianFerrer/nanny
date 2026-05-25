# Nanny — Contexto del Proyecto

> **Hub principal del proyecto.** Este archivo se carga automáticamente en cada sesión de Claude Code. Contiene el contexto base + un índice de los planes activos en `.md` separados.

---

## 0. Cómo usar este archivo en una sesión nueva

1. **Este archivo (`CLAUDE.md`) ya está cargado** automáticamente. Tenés contexto base sin pedir nada.
2. **Si vas a trabajar en un plan específico**, indicalo en tu prompt inicial. Ejemplos:
   - *"Vamos a continuar con el refactor del chat. Lee `CHAT-REFACTOR-PLAN.md`."*
   - *"Quiero entender el estado del rediseño. Lee `REDESIGN-PLAN.md`."*
   - *"Necesito ajustar el autopilot."* → ya tengo contexto suficiente acá mismo, sección 9.
3. **Para cambios chicos / bug fixes** alcanza con este archivo, no hace falta cargar planes específicos.

### Documentos del repo

| Archivo | Cuándo cargar | Rol |
|---|---|---|
| `CLAUDE.md` (este) | Siempre (automático) | Contexto base + índice |
| `NANNY-VISION.md` | **SIEMPRE si tocás pipeline AI o features de Nanny "como asistente"** | Documento de visión: quién es Nanny, cómo actúa, decisiones vinculantes. Es el ancla de producto. |
| `AGENT-REWRITE-PLAN.md` | **SIEMPRE si trabajás en el rediseño actual (6 sprints)** | Plan operativo activo. Sprints definidos, prompts de arranque, tracking. |
| `NANNY.md` | Si necesitás contexto de producto / user stories | Documento de producto, estable |
| `REDESIGN-PLAN.md` | Si trabajás en UI/UX o querés ver el plan de rediseño | Plan del rediseño Apple-inspired (cerrado, archivo histórico) |
| `RELIABILITY-PLAN.md` | Si necesitás contexto del trabajo previo a este rediseño | Plan de confiabilidad (cerrado, archivo histórico — sus aprendizajes están integrados en `AGENT-REWRITE-PLAN.md`) |
| `CHAT-REFACTOR-PLAN.md` | **Obsoleto** — superseded por `AGENT-REWRITE-PLAN.md` | Histórico, no usar |
| `app/README.md` | Onboarding rápido al stack | README de Next.js del app |

---

## 1. Branches y Deployment

### Branches activas

| Branch | Rol |
|---|---|
| `claude/continue-previous-session-OleqU` | **Producción Vercel.** Cualquier push acá deploya. Es la branch a la que apuntan los pushes de cambios validados. |
| `claude/continue-markdown-docs-JmrP4` | Branch histórica del rediseño UI (cerrado). Mantener en sync con producción si hay cambios cross-cutting. |
| `claude/refactor-chat-into-components` | Pendiente de crear cuando arranque la sesión dedicada del refactor del chat. Ver `CHAT-REFACTOR-PLAN.md`. |

### Deployment

- **Vercel** despliega desde `claude/continue-previous-session-OleqU` (NO desde `main`)
- **Preview deploys** activos por default en cada branch que no sea producción
- NO sugerir cambiar a `main` ni crear branch `main`
- Plan **Hobby**: `maxDuration = 60s` para serverless functions

### Cron Jobs — servicio externo (cron-job.org)

Vercel Hobby solo soporta cron diario, así que los cron jobs corren en **cron-job.org** (servicio externo gratuito) que invoca endpoints HTTP de la app. `app/vercel.json` NO tiene `crons` configurados — la sección `crons` ahí es ignorada.

**Endpoints configurados en cron-job.org:**

| Cron | Endpoint | Schedule | Notas |
|---|---|---|---|
| `Nanny-Autopilot` | `https://nanny-xi.vercel.app/api/cron/autopilot` | `* * * * *` (cada minuto) | Procesa el job de autopilot AI; cada invocación tiene budget de 45s |
| `Nanny-MorningBrief` | `https://nanny-xi.vercel.app/api/cron/morning-brief` | `0 * * * *` (cada hora) | Itera familias y dispara brief solo a las que están en su 8am local. Una corrida horaria cubre todas las TZ. Endpoint: `app/src/app/api/cron/morning-brief/route.ts`. |
| `Nanny-NightlyCatchup` | `https://nanny-xi.vercel.app/api/cron/nightly-catchup` | `0 * * * *` (cada hora) | Itera familias y dispara catchup automático a las 4am local. Encuentra items que Nanny no capturó durante el día y los agrega silenciosamente con `[auto-catchup]` en description. Endpoint: `app/src/app/api/cron/nightly-catchup/route.ts`. |
| `Nanny-UpcomingReminders` | `https://nanny-xi.vercel.app/api/cron/upcoming-reminders` | `*/10 * * * *` (cada 10 min) | Push proactivo antes de eventos (ventana de 30 min) y tomas de medicación (15 min). Idempotente vía tabla `notifications_sent`. Endpoint: `app/src/app/api/cron/upcoming-reminders/route.ts`. |
| `Nanny-Wake` | `https://nanny-xi.vercel.app/api/cron/nanny-wake` | `*/15 * * * *` (cada 15 min) | **AGENT-REWRITE Sprint 1.** Despertador del decision agent. Itera familias y dispara en 4 momentos locales (07:00 / 12:30 / 17:00 / 21:00) con ±15min tolerancia. Dedup 4h por (familia, momento). Filtra por `USE_NEW_PIPELINE_FAMILY_IDS` durante cutover progresivo. Endpoint: `app/src/app/api/cron/nanny-wake/route.ts`. |
| `Nanny-MemoryUpdater` | `https://nanny-xi.vercel.app/api/cron/memory-updater` | `0 3 * * *` (03:00 UTC diario) | **AGENT-REWRITE Sprint 2.** Memory engine. Por familia elegible: lee actividad 24h + patrones existentes, invoca Claude Sonnet 4.6 con prompt caching, aplica operaciones (create/confirm/contradict/decay sobre `family_patterns`, enqueue sobre `family_learning_queue`). Decay automático 14d sin reconfirmación. Endpoint: `app/src/app/api/cron/memory-updater/route.ts`. |

**Auth:** los endpoints aceptan tres formas (cualquiera funciona):
1. `?secret=<CRON_SECRET>` en query string (lo más simple para cron-job.org).
2. Header `x-cron-secret: <CRON_SECRET>`.
3. Header `x-vercel-cron` (solo aplica si Vercel lo invocara directamente).

`CRON_SECRET` se configura en Vercel Project Settings → Environment Variables.

**Cómo agregar un nuevo cron:**
1. Crear el endpoint en `app/src/app/api/cron/<nombre>/route.ts` con `export const maxDuration = 60` y validación de `CRON_SECRET`.
2. En cron-job.org, crear una entrada nueva apuntando a la URL de producción con `?secret=...` y el schedule deseado.
3. Documentarlo en la tabla de arriba.

---

## 2. Trabajos en curso (resumen)

### 🚨 Trabajo activo principal — Rediseño "Nanny como Asistente Real"

**Plan operativo:** `AGENT-REWRITE-PLAN.md` (6 sprints, ~4-6 semanas).

**Visión de producto:** `NANNY-VISION.md` (decisiones vinculantes, no cambian sin discusión).

**Sprint actual:** Sprint 3 — Listening Pipeline + Cutover. Branch `claude/agent-rewrite-sprint-3`.

**Fase A (en desarrollo):** listener silencioso implementado en `lib/chat/listener.ts` — Claude Haiku 4.5 con 4 tools (`create_event`, `create_task`, `create_medication`, `create_routine`), prompt caching sobre system+tools, persistencia directa a Supabase via service role. Integrado en `/api/chat/route.ts` corriendo ANTES del decision agent en `runNewPipeline` (listener captura, agent ve los items recién creados en su contexto y decide si responder). Best-effort: si el listener falla, el agent sigue funcionando. Costo objetivo: Haiku $0.001/msg + Sonnet $0.005/msg ≈ $8/familia/mes a 100 msgs/día.

**Fase B (pendiente):** observación 3-7 días en familia de testing, eval comparativa contra el viejo pipeline, % de mensajes con respuesta entre 15-25% (target visión). Si Fase A valida, retirar progresivamente classifier/extractor/responder/routine-detector regex (el viejo pipeline queda como fallback para familias fuera de `USE_NEW_PIPELINE_FAMILY_IDS`).

**Sprint 2:** ✅ Mergeado. Memory Engine — `lib/agent/memory-updater.ts` (orquestador cron diario con prompt caching), `lib/agent/memory-system-prompt.ts`, `/api/cron/memory-updater`, captura inline en decision agent con dedup por type+scope+topic.

**Sprint 1:** ✅ Mergeado (PR #4, commit `2a0a488`). Decision agent + cron nanny-wake + feature flag en /api/chat + migración decision_agent_log.

**Sprint 0:** ✅ Mergeado (PR #3, commit `986d8f8`). 5 migraciones nuevas + types + endpoints skeleton.

**Próximos sprints:** Sprint 1 (Decision Agent) → 2 (Memory Engine) → 3 (Cutover) → 4 (WhatsApp) → 5 (Pricing) → 6 (Launch).

**Si esta sesión muere o querés arrancar nueva:** ver `AGENT-REWRITE-PLAN.md` Anexo B (Recuperación de sesión). Tiene prompts copy-paste para reanudar.

### Rediseño Apple-inspired — ✅ Cerrado

14/14 micro-batches completados. Toda la app tiene el nuevo design system, animaciones de entrada, dark mode auto, headers Apple-style. Detalle completo en `REDESIGN-PLAN.md`.

### Agenda estilo Apple Calendar — ✅ Cerrado (mayo 2026)

`/agenda` tiene selector **Lista / Día** en el header. **Lista**: semana agrupada por día (solo días con items), con número de semana ISO (`S21`), barra de color por hijo + avatar, y horas inicio→fin a la derecha (inicio negro, fin gris). **Día**: timeline horario (`components/DayTimeline.tsx`) con rango dinámico de horas, bloques posicionados por hora, layout de columnas para eventos solapados (lado a lado), franja "todo el día" (eventos sin hora + tareas), tinte por color de hijo. Tap en un día del strip hace drill-in a la vista Día. `event_type` → ícono lucide (doctor/school/birthday/activity/travel/other). "Hoy" como pill fijo abajo-izquierda (estilo Apple).

### Refactor de UI a páginas full-screen — ✅ Cerrado (abril 2026)

Toda edición de detalle ahora vive en páginas full-screen con back arrow, no en bottom sheets / popups. El patrón unificado:
- `/tarea/[id]`, `/evento/[id]`, `/tratamiento/[id]` (detalle/edit)
- `/perfil/familia`, `/perfil/padre/[id]`, `/perfil/hijo/[id]`, `/perfil/hijo/nuevo` (config)
- `/hijo/[id]/rutina/nueva` (creación manual de rutina)

Los confirms destructivos (logout, eliminar hijo, eliminar evento/tarea) se mantienen como confirm inline o dialog modal — no son edición de detalle.

Composer del chat slim (8px 10px / 16px) extendido como base de inputs en toda la app (`globals.css` `.input`).

### Rutinas semanales + cancelaciones puntuales — ✅ Cerrado (abril 2026)

Soporte para horarios fijos recurrentes (guardería, cole, fútbol semanal) como concepto separado de eventos:
- Tabla `routines` ya existía; nueva tabla `routine_exceptions` para overrides puntuales (cancelar un día / cambiar horario para una fecha específica)
- Migración: `supabase/migrations/20260427_routine_exceptions.sql`
- Agenda expande rutinas activas por día con estilo distinto (borde punteado morado, badge `RUTINA`)
- Pestaña Rutinas en `/hijo/[id]` agrupa por momento del día (mañana/tarde/noche/sin horario) derivado de `time_start`, no de la columna `type`
- Detector determinístico (`app/src/lib/chat/routine-detector.ts`) corre como red de seguridad después del LLM. Si el extractor falla en crear rutina cuando el mensaje describe horario fijo claro ("X tiene Y de lunes a viernes de 9 a 17"), el detector la fuerza y reescribe el reply. Cubre patrones comunes con tests en `routine-detector.test.ts` (`npx tsx`).

### Plan de confiabilidad y sincronización — ⏳ En curso (mayo 2026)

5 sprints documentados en `RELIABILITY-PLAN.md`: setup/baseline, push reminders X min antes, real-time sync vía Supabase Realtime, function calling en el extractor (alto riesgo), validación en prod. Cada uno con quality gate explícito.

Filosofía del plan: calidad sobre cantidad. Las primeras dos fases son additive y de bajo riesgo (entregan valor visible inmediato); la tercera es la inversión de confiabilidad mayor (function calling); la última es observación.

**Estado al 12/5/26**: Fases 1–4 cerradas. La Fase 4 (function calling en el extractor) mejoró el score de eval de 70/60/74 → 77/63/90. El catch silencioso del extractor murió: anomalías ahora se loguean explícitamente. Pendiente Fase 5 (observación en prod). Durante la validación manual aparecieron 2 bugs preexistentes (rutinas vía chat / persistencia de eventos) documentados en sección 9 como follow-ups.

### Refactor del chat — ⏳ Pendiente (sesión dedicada)

`app/src/app/chat/page.tsx` tiene ~1900 líneas y ~32 useStates (creció con state de routines/routineExceptions). Plan en 7 fases para extraer componentes y hooks. Plan completo en `CHAT-REFACTOR-PLAN.md`.

**Red de seguridad ya establecida (PR #1 mergeado, commit `7843a75`):**
- Playwright + workflow GH Actions en `.github/workflows/e2e.yml` corre en cada push a `claude/**`
- 5 tests E2E críticos del chat en `app/tests/chat.spec.ts` (verde en CI)
- Mocks de Supabase + OpenAI en `app/tests/fixtures/` — sin secrets reales
- Bypass de auth vía `E2E_TEST_MODE` y `NEXT_PUBLIC_E2E_TEST_MODE` (solo activas en CI, nunca en prod)

**Pre-requisitos antes de arrancar el refactor:**
- Branch nueva `claude/refactor-chat-into-components` desde `claude/continue-previous-session-OleqU`
- Cada commit del refactor dispara los E2E tests automáticamente; si pasan los 5, fase OK
- Si fallan, revertir esa fase con `git revert <hash>`

### Autopilot del pipeline AI — Estado activo, mejoras pendientes

Sistema corriendo en producción. Ver sección 9 abajo para detalle completo de arquitectura, problemas conocidos, áreas de mejora.

---

## 3. Convenciones de actualización de documentación

**Regla general:** después de cualquier cambio que afecte arquitectura, decisiones, o estado de un plan, actualizar el `.md` correspondiente en el mismo commit (o uno inmediatamente posterior).

| Cuando cambia… | Actualizar… |
|---|---|
| Tech stack, dependencia, arquitectura general | `CLAUDE.md` (sección Tech Stack / Arquitectura) |
| Nueva migración SQL aplicada | `CLAUDE.md` (sección Migraciones) |
| Nueva ruta API o página | `CLAUDE.md` (tablas de rutas) |
| Decisión que afecta a futuro | `CLAUDE.md` (sección Decisiones tomadas) |
| Avance / cambio de fase de un plan activo | el `.md` del plan (`CHAT-REFACTOR-PLAN.md`, etc.) |
| Plan terminado | cerrar su `.md` con una sección "Estado final" + actualizar el resumen acá en sección 2 |
| Nueva branch que tenga rol específico | `CLAUDE.md` (tabla de branches) |
| MCP servers nuevos en `.mcp.json` | mencionar acá en sección 1 + en el `.md` del plan que los use |

**Convención de commits para cambios de docs solos:**
```
docs(<scope>): <descripción>
```
Ejemplos: `docs(redesign): cierre de fase X`, `docs(refactor-chat): completar fase 2`.

---

## 4. Tech Stack

- **Next.js 15** (App Router) + TypeScript
- **Supabase** (PostgreSQL + Auth con email/password)
- **OpenAI** chat pipeline híbrido: `gpt-4o-mini` para classifier + responder (tareas simples, baratas), `gpt-4o` para extractor (function calling, inferencia contextual, detección de múltiples tools). Costo estimado: ~$0.55/familia/mes.
- **Tailwind CSS 4** (mobile-first, max 430px)
- **Playwright MCP** disponible para automatización de browser (config en `.mcp.json`)
- Deploy en **Vercel** (Hobby plan, `maxDuration=60s`)

---

## 5. Arquitectura

### Directorios

- App directory: `app/src/app/`
- Lib compartido: `app/src/lib/`
- API routes: `app/src/app/api/`
- Componentes UI reutilizables: `app/src/components/ui/`
- Componentes de pantalla específicos: `app/src/components/`
- Migraciones SQL: `supabase/migrations/`
- Schema base: `supabase-schema.sql`
- Config Vercel: `app/vercel.json`
- Config MCP: `.mcp.json` (raíz)

### Supabase

- API routes usan `getSupabaseAdmin()` (service role key, bypasa RLS) para operaciones server-side
- Cliente browser usa `getSupabase()` (anon key, respeta RLS)
- RLS aísla datos por familia usando `parents.auth_user_id = auth.uid()`

### Variables de Entorno (Vercel + `.env.local`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY` — usada por el decision agent (Sonnet 4.6). Configurar en los 3 environments (prod, preview, dev). **AGENT-REWRITE Sprint 1.**
- `USE_NEW_PIPELINE_FAMILY_IDS` — comma-separated UUIDs de familias que usan el decision agent (cron nanny-wake + event-triggered en /api/chat). Vacío o no seteada = todas las familias usan el pipeline viejo. **AGENT-REWRITE Sprint 1.**
- `CRON_SECRET` (opcional, para autenticar cron de Vercel)

---

## 6. Páginas

### Tabs principales (bottom nav)

| Ruta | Descripción |
|------|-------------|
| `/chat` | Chat familiar principal (Nanny AI) — **tab 1** |
| `/agenda` | Línea temporal: eventos + tareas con fecha + rutinas semanales expandidas + tomas — **tab 2** |
| `/tareas` | Backlog completo de tareas (con y sin fecha), agrupadas — **tab 3** |
| `/hijo` | Lista de hijos — **tab 4** |

### Páginas de detalle / edición (full-screen, back arrow)

| Ruta | Descripción |
|------|-------------|
| `/evento/[id]` | Editar/eliminar evento (creado en abril 2026, reemplaza popup en `/agenda`) |
| `/tarea/[id]` | Editar/eliminar tarea (incluye vista de tarea paraguas con sub-actividades) |
| `/tratamiento/[id]` | Detalle de tratamiento médico (fechas, estado, tomas) + acciones inline (marcar completado / cancelar / reactivar) |
| `/hijo/[id]` | Perfil del hijo (tabs: Info / Agenda / Salud / Rutinas) |
| `/hijo/[id]/rutina/nueva` | Crear rutina semanal manualmente (nombre, tipo, días, hora) |
| `/perfil` | Hub de configuración familiar — solo navegación, accedido vía gear ⚙ |
| `/perfil/familia` | Editar nombre + zona horaria de la familia |
| `/perfil/padre/[id]` | Editar mamá/papá |
| `/perfil/hijo/[id]` | Editar hijo (datos + delete) |
| `/perfil/hijo/nuevo` | Agregar hijo |

### Auth + landing

| Ruta | Descripción |
|------|-------------|
| `/` | Landing / redirect |
| `/landing` | **Landing pública de marketing** (hero + features + screenshots + CTA). Para compartir con clientes / inversores. Override del constraint mobile de 430px solo en esta ruta vía hook `useEscapeMobileLayout`. |
| `/login` | Auth email/password |
| `/onboarding` | Setup inicial de familia |

### Admin / testing

| Ruta | Descripción |
|------|-------------|
| `/admin/testing` | Dashboard de testing/eval |
| `/admin/testing/[runId]` | Detalle de un run de evaluación |

### Deprecated / fuera del nav

| Ruta | Descripción |
|------|-------------|
| `/hoy` | **Deprecated** — redirige a `/agenda` (back-compat con bookmarks) |
| `/semana` | **Deprecated** — redirige a `/agenda` (back-compat con bookmarks) |
| `/mas` | Submenú legacy — fuera del nav, accesible solo por URL directa |
| `/red-apoyo` | Stub, próximamente — fuera del nav |
| `/insights` | Stub, próximamente — fuera del nav |

**Navegación inferior (simplificada, abril 2026):** 4 tabs — Chat, Agenda, Tareas, Hijos. La configuración vive en un gear ⚙ en el header de cada tab principal (no es tab). Las rutas legacy ya no aparecen en el nav pero siguen funcionando para back-compat. Ver `app/src/components/BottomNav.tsx`.

**Patrón de edición (vinculante):** cualquier flow de "ver detalle" o "editar" abre una **página full-screen con back arrow `size={26}`**, no un popup ni bottom sheet. Los confirms destructivos (delete con doble-tap, logout) se mantienen como dialog modal centrado o como confirm inline al pie de la página. Ver decisión 11.

---

## 7. API Routes

| Ruta | Descripción |
|------|-------------|
| `/api/chat` | Procesa mensajes del chat (pipeline AI streaming SSE) |
| `/api/chat-catchup` | Resumen de mensajes perdidos |
| `/api/onboarding` | Crea familia y padres |
| `/api/onboarding-chat` | Chat conversacional del onboarding |
| `/api/family-data` | Lee datos de la familia (acepta `tables=` con `family,parents,children,events,tasks,messages,medications,routines,routine_exceptions`) |
| `/api/family-write` | Escribe datos de la familia. Tablas sin `family_id` (`routines`, `routine_exceptions`, `families`) están en `TABLES_WITHOUT_FAMILY_ID` y NO reciben scope automático — heredan acceso vía FK a `children` |
| `/api/check-family` | Verifica si el usuario tiene familia |
| `/api/join-family` | Unirse a familia existente (idempotente, retry-safe). Resuelve el `familyId` en orden: body → `pending_family_id` de la metadata del usuario → slot de parent sin vincular cuyo `email` coincide (invitación por correo) |
| `/api/invite-partner` | El invitador (autenticado) asocia el email de su pareja a un slot de parent sin vincular en su familia. Cuando esa persona crea su cuenta con ese correo, join-family/onboarding la vinculan automáticamente — sin depender del link |
| `/api/medication/[id]` | Devuelve un tratamiento + sus tomas (`medication_intakes`) |
| `/api/push-subscribe` | Registrar suscripción push |
| `/api/push-notify` | Enviar notificación push |
| `/api/reset-user` | Reset de usuario (dev) |
| `/api/eval/run` | Ejecutar evaluación mensaje por mensaje |
| `/api/eval/run/finalize` | Guardar resultados de evaluación |
| `/api/eval/runs` | Listar runs de evaluación |
| `/api/eval/runs/[runId]` | Detalle de un run |
| `/api/eval/save` | Guardar evaluación |
| `/api/eval/autopilot` | GET=status, POST=iniciar, DELETE=cancelar autopilot |
| `/api/eval/diagnose` | Diagnóstico AI de resultados |
| `/api/eval/prompt` | GET/POST/PUT/DELETE de reglas del prompt |
| `/api/cron/autopilot` | Cron (cron-job.org cada 1 min): procesa job de autopilot |
| `/api/cron/morning-brief` | Cron (cron-job.org cada 1 hora): brief matutino por familia, filtra por TZ local (envía a las 8am locales) |
| `/api/cron/nightly-catchup` | Cron (cron-job.org cada 1 hora): nightly catchup automático a las 4am locales — encuentra items que Nanny no capturó durante el día |
| `/api/cron/upcoming-reminders` | Cron (cron-job.org cada 10 min): push proactivo antes de eventos (30 min) y tomas de medicación (15 min). Usa tabla `notifications_sent` para idempotencia. |
| `/api/cron/nanny-wake` | **AGENT-REWRITE Sprint 1.** Despertador del decision agent. Itera familias activas, calcula minutos locales y matchea contra MOMENTS (07:00 / 12:30 / 17:00 / 21:00 ±15min). Dedup 4h por (familia, momento) vía `decision_agent_log`. Filtro por `USE_NEW_PIPELINE_FAMILY_IDS`. Cron cada 15 min en cron-job.org. |
| `/api/cron/memory-updater` | **AGENT-REWRITE Sprint 2.** Por familia elegible (USE_NEW_PIPELINE_FAMILY_IDS): lee actividad 24h + patrones, invoca Claude Sonnet 4.6, aplica operaciones sobre `family_patterns` (create/confirm/contradict/decay) y `family_learning_queue` (enqueue). Soft-delete vía confidence < 0.3. Cron diario 03:00 UTC. |
| `/api/whatsapp/inbound` | **AGENT-REWRITE Sprint 0 (skeleton).** Webhook entrante de Meta. GET implementado para verification challenge, POST pendiente Sprint 4b. |
| `/api/whatsapp/send` | **AGENT-REWRITE Sprint 0 (skeleton).** Envío de mensajes a contactos de apoyo. Implementación real en Sprint 4b. |

---

## 8. Pipeline de Chat AI (`app/src/lib/chat/`)

**Replanteo (mayo 2026):** el pipeline orquestado (classifier/extractor/responder + listener + decision agent) generaba demasiada complejidad, latencia y silencios. Volvimos a lo básico: **`assistant.ts` — un cerebro único.** El switch lo hace `/api/chat/route.ts` mirando `USE_NEW_PIPELINE_FAMILY_IDS`. Una vez validado, se retira todo lo demás.

### Nanny Assistant (`assistant.ts`) — el cerebro único

UNA llamada a Claude Sonnet 4.6 por mensaje. Lee la conversación reciente (últimos 20 mensajes, como un todo — entiende ráfagas) + lo ya anotado (eventos próximos, tareas pendientes, tratamientos activos, rutinas activas — **cada item con su id entre corchetes**) + hijos + zona horaria de la familia. En un solo turno decide qué anotar/gestionar (persiste directo a Supabase) y qué responder. Sin classifier, sin listener separado, sin decision agent, sin postprocess regex. Prompt corto: confiamos en la inteligencia del modelo con el contexto correcto. Prompt caching sobre el system. Latencia ~2-3s, costo ~$0.01/msg.

**8 tools** — el cuaderno es editable, no solo append:
- Crear: `anotar_evento`, `anotar_tarea`, `anotar_medicacion`, `anotar_rutina`.
- Gestionar (sobre el id del bloque "Ya está anotado"): `completar_tarea` (status=done), `cancelar_item` (reversible: `status=cancelled` para evento/tarea/tratamiento, `active=false` para rutina; cubre los 4 tipos), `editar_evento` y `editar_tarea` (correcciones in-place). Todas las mutaciones van scopeadas por familia (events/tasks/medications por `family_id`; routines por `child_id ∈ hijos de la familia`).
- **Protocolo**: confirmar antes de `completar_tarea`/`cancelar_item` (proponé y esperá el "sí"); detección proactiva de duplicados y tareas dadas por cumplidas; editar el item existente en vez de crear uno nuevo ante una corrección. Nunca toca un item que no esté en el contexto.
- Los `cancelled`/`done` se filtran en las vistas (agenda lista + `DayTimeline` + `/tareas`) para que desaparezcan del cuaderno.

**Componentes en transición (a retirar si el assistant valida):** `listener.ts` (Sprint 3 Fase A, desconectado del endpoint), `lib/agent/decision-agent.ts` + cron `nanny-wake`, `lib/agent/memory-updater.ts` + cron `memory-updater`. Quedan en disco pero el chat ya no los usa.

### Pipeline viejo (OpenAI — legacy, sigue activo para familias fuera del flag)

1. `processChat.ts` — orquestador público + `ChatInput` interface; el `SYSTEM_PROMPT` exportado es legacy (solo eval offline)
2. `classifier.ts` — clasifica intención + flags del mensaje (incluye `silent_action`)
3. `extractor.ts` — extrae datos estructurados **via OpenAI tool calling** (Fase 4, mayo 2026). El modelo invoca tools tipadas (ver `tools.ts`); el `content` textual es el reply. NUNCA silencia errores: anomalías loguean (`[extractor] ...`)
4. `tools.ts` — 9 tool schemas: `create_event`, `create_task` (con `parent_title` opcional para task_group), `create_medication`, `create_routine`, `create_routine_exception`, `update_existing_event`, `update_existing_task`, `ask_for_missing_info`, `stay_silent`
5. `responder.ts` — genera respuesta de Nanny (tono profesional, default 1 oración, una pregunta máx)
6. `postprocess.ts` — post-procesamiento (assigned_to, fechas, deduplicación). NO filtra `routine` ni `routine_exception` — pasan directo
7. `routine-detector.ts` — **red de seguridad determinística** (regex): detecta patrones claros de rutina semanal en el mensaje. Si el LLM no creó `confirmation: type=routine` y el regex matchea (hijo + actividad + días + horario), el pipeline fuerza la creación reescribiendo el reply
8. `pipeline.ts` — orquestación: emite stream de eventos `will_respond` + `response`; cuotas anti-spam (3 proactivas/día, ventana 7am-10pm); buffered receipt para casos `silent_action`. Ejecuta `routine-detector` **después** del LLM, antes de `postprocess`
9. `prompt-rules.ts` — reglas dinámicas persistidas en Supabase (`prompt_rules_state`)
10. `correction-rules.ts` — destila correcciones del padre en reglas persistidas (rol, preferencias, asignaciones habituales)
11. `routine-detector.test.ts` — runner de tests (no framework, solo asserts) — `npx tsx src/lib/chat/routine-detector.test.ts`

### Streaming SSE (`/api/chat`)

El endpoint del chat devuelve **Server-Sent Events**, no JSON. Dos eventos:

- `event: will_respond` con `data: {"value": true|false}` — emitido apenas el classifier termina (~500ms). El cliente lo usa para prender los 3 puntos de "Nanny está escribiendo" SOLO cuando realmente va a haber respuesta.
- `event: response` con `data: {ChatResponse}` — emitido cuando termina extractor/responder.
- `event: done` o `event: error` cierran el stream.

Cliente: `app/src/lib/chat-stream.ts` con `callChatStream(payload, callbacks)`.

### Convenciones de tono (vinculantes, viven en los prompts modulares)
- Default 1 oración, máximo 2 (3 solo en briefs)
- Cero exclamaciones, cero efusividad
- Una sola pregunta por turno (jerarquía: asignación > horario > ubicación)
- `silent_action` se trata como hint para producir **receipt mínimo** ("Tarea creada: X."), NO silencio total — para que el usuario tenga feedback de que se capturó algo
- `is_proactive=true` en mensajes no solicitados → cuentan para cuota diaria
- Durante el buffer (8s) NO se muestra ningún indicador en el chat — el silencio mantiene la ilusión de asistente

---

## 9. Sistema de Evaluación + Autopilot (`app/src/lib/eval/`)

### Sistema de evaluación

- 10 conversaciones de test en `conversations/01..10-*.ts`
- `profiles.ts` — perfiles de familias ficticias para eval
- `scorer.ts` — scoring de resultados (precision, recall, etc.)
- `runner.ts` / `run-eval.ts` — ejecución de evaluaciones
- `diagnosis.ts` — diagnóstico AI de fallos (propone ajustes al prompt)
- `types.ts` — tipos compartidos

### Autopilot

Sistema automatizado que evalúa el pipeline AI, diagnostica fallos, aplica ajustes al prompt, y re-evalúa para verificar mejoras. Corre 100% en el servidor via Vercel Cron, independiente del browser.

**Pipeline de fases:**
```
evaluation (10 convs) → saving → diagnosis (OpenAI) → reeval (10 convs) → complete
```

**Archivos clave:**
- `app/src/lib/eval/autopilot-worker.ts` — worker compartido (processOneUnit, processUntilBudget, claimJob, findRunningJob)
- `app/src/app/api/eval/autopilot/route.ts` — API (GET status, POST iniciar, DELETE cancelar)
- `app/src/app/api/cron/autopilot/route.ts` — Cron endpoint (Vercel, cada 1 min, budget 45s)
- `app/src/app/admin/testing/page.tsx` — UI del dashboard

**Tablas Supabase:**
- `autopilot_jobs` — estado del job (status, phase, current_conversation, conversation_scores, locked_until, last_heartbeat, etc.)
- `prompt_rules_state` — reglas del prompt persistidas (fila singleton id=1)
- `evaluation_runs` — resultados guardados de evaluaciones

**Mecanismo de concurrencia:**
- **Job locking**: compare-and-swap en `locked_until` (70s TTL). Dos UPDATEs atómicos secuenciales (no usar `.or()` de Supabase con ISO timestamps — rompe el parser PostgREST).
- **Stuck detection**: `expireIfStale()` checa `last_heartbeat` (>5 min) y `created_at` (>30 min). Solo `findRunningJob` (cron) expira jobs.
- **Yield entre fases**: `processOneUnit` retorna `'yield'` entre fases pesadas para que cada fase arranque en una invocación fresca del cron con budget completo.
- **Idempotencia**: fase `saving` checa si `eval_run_id` ya existe antes de insertar.

**Restricciones de Vercel Hobby:**
- `maxDuration = 60s` para serverless functions
- Cron cada 1 minuto (configurado en `app/vercel.json`)
- Cada invocación procesa ~45s de trabajo (2 conversaciones aprox.)
- Un ciclo completo (eval 10 + diagnosis + reeval 10) toma ~10-15 min

### Baseline pre-Fase 4 — RELIABILITY-PLAN Fase 1 (mayo 2026)

Run de eval completa ejecutada desde `/admin/testing` el 5 de mayo 2026 (autopilot v9-iterative).

**Scores globales:**
- Overall: **70%**
- Precision: **60%**
- Recall: **74%**

**Por conversación (10/10 completadas):**

| Conversación | Score |
|---|---|
| Tres cambios de plan en una semana | 86% |
| Mamá organiza todo, papá ejecuta | 84% |
| Coordinación médica de bebé prematuro | 83% |
| Amor y caos: info perdida entre cariño | 79% |
| Coordinación bilingüe español-inglés | 75% |
| Mañana caótica con tres hijos | 68% |
| Semana organizada con múltiples eventos | 62% |
| Logística doble: primaria y guardería | 57% |
| Negociación tensa de responsabilidades | 56% |
| Coordinación con mensajes telegráficos | 46% |

**Las 3 peores (foco para Fase 4 / function calling):**
- Coordinación con mensajes telegráficos: 46%
- Negociación tensa de responsabilidades: 56%
- Logística doble: primaria y guardería: 57%

### Post-Fase 4 — function calling (12/5/26)

Run ejecutado tras `claude/extractor-function-calling` mergeada a OleqU (commit `c4ae1c7`).

**Scores globales:**
- Overall: **77%** (+7pp)
- Precision: **63%** (+3pp)
- Recall: **90%** (+16pp)

**Cambios destacables por conversación (post vs baseline):**

| Conversación | Pre | Post | Δ |
|---|---|---|---|
| Coordinación bilingüe español-inglés | 75% | 69% | -6pp ⚠️ (-) ; en run intermedio bajó a 37% antes de fixeo |
| Coordinación con mensajes telegráficos | 46% | 40% | -6pp ⚠️ sigue siendo la peor |
| Semana organizada | 62% | 84% | +22pp |
| Mamá organiza todo, papá ejecuta | 84% | 93% | +9pp |
| Logística doble | 57% | 58% | ≈ |
| Tres cambios de plan | 86% | 62% | -24pp ⚠️ regresión |

Trade-off típico de function calling: el modelo se anima más a invocar tools (sube recall +16pp) pero a veces sobre-completa pending detections cancelados ("tres cambios de plan" regresó). Cobertura agregada subió +7pp, quality gate de Fase 4 cumplido.

**Estado de tests E2E (Fase 1.5 cerrada — 5/5 verdes en CI):**

3 bugs en mocks identificados y fixeados en commit `1d4fae8`:
1. Mock `/api/chat` devolvía JSON cuando el endpoint real ahora emite SSE (`will_respond` + `response` + `done`). El cliente nunca veía la respuesta.
2. Mock `/api/family-data` no incluía `familyId`/`currentParentId`/`routines`/`routineExceptions` que el cliente espera para inicializar el store.
3. Tests 3-4 testeaban un bottom sheet del editor de horarios que se inlineó en `78b93fc` (commit de abril 2026).

Tests reescritos para validar el editor inline (inputs `Horario 1/2/3` + Cancelar/Guardar dentro del bubble de Nanny). Suite verde — red de seguridad activa.

### Estado del autopilot (mayo 2026)

- ✅ La evaluación (10/10 conversaciones) funciona correctamente
- ✅ Las fases de saving completan OK
- ⚠️ Fase de diagnosis falla intermitentemente por quota 429 (no afecta scores de la eval, solo el análisis post)
- 📊 Scores post-Fase 4: **77% overall / 63% precision / 90% recall** (12/5/26)
- ⚠️ Diagnóstico AI propone ajustes pero el rollback automático del autopilot lo deshace en ambos runs post-Fase 4

### Problemas conocidos / áreas de mejora

1. **Diagnosis 429**: el paso de diagnóstico AI consume tokens — cuando el plan de OpenAI hace rate-limit, falla. Eval scores siguen siendo válidos.
2. **Conversaciones difíciles persistentes**: "Coordinación con mensajes telegráficos" (40% post-Fase 4), "Tres cambios de plan" (62%, regresión por sobre-completar pending), "Logística doble" (58%).
3. **prompt_version**: las eval runs del autopilot usan `'autopilot-pre'`/`'autopilot-post'` pero no diferencian qué reglas estaban activas.

### Bugs preexistentes descubiertos durante validación manual de Fase 4 (12/5/26)

Ninguno introducido por Fase 4 (verificado: en Fase 4 solo se tocaron `extractor.ts` + `tools.ts`). Merecen sesión dedicada:

**Bug A — Rutinas no se crean vía chat**
- Síntoma: "Pau tiene guardería de lunes a viernes de 9 a 5" → Nanny no responde, no se crea rutina.
- Causa probable: `classifier.ts` no tiene el concepto de "rutina" en su prompt ni en el enum de `intent` (no aparece "ROUTINE" como intent posible). El mensaje se clasifica como `is_actionable=false`, el extractor nunca corre, el `routine-detector` (que vive dentro de `runExtraction` en `pipeline.ts:348`) tampoco se dispara.
- Fix sugerido: (1) agregar `ROUTINE` al enum de intents del classifier + reglas de detección de horarios recurrentes; (2) mover el `routine-detector` regex a un punto del pipeline que corra siempre, independiente del classifier.

**Bug B — Cards visibles en chat pero items no persisten en /agenda**
- Síntoma: Nanny responde "Anotado." + muestra card "Actividad — Ver evento →" para mensajes como "merienda con Pau a las 18", pero el evento no aparece en `/agenda` ni en el perfil del hijo. Tareas sí se persisten (caso "Comprar pañales" funcionó).
- Causa probable: bug en el cliente del chat (`chat/page.tsx`) o en la inserción de eventos via `/api/family-write`. Selectivo a eventos, no a tareas.
- Fix sugerido: agregar logs + repro en local del flujo "create_event desde chat" para identificar dónde se pierde la persistencia.

---

## 10. Migraciones SQL requeridas

Aplicarlas con `./scripts/db-migrate.sh` (requiere `SUPABASE_DB_URL` en `app/.env.local`) o manualmente en orden en el SQL Editor de Supabase. La tabla `_nanny_migrations` mantiene track de las ya aplicadas.

Helpers disponibles:
- `./scripts/db-query.sh "SELECT ..."` — ejecuta un query ad-hoc
- `./scripts/db-migrate.sh` — aplica las pendientes
- `./scripts/db-migrate.sh --status` — solo muestra qué falta
- `./scripts/db-migrate.sh --dry` — lista las pendientes sin aplicar


| Archivo | Descripción |
|---------|-------------|
| `20260312_push_subscriptions.sql` | Suscripciones push |
| `20260318_evaluation_runs.sql` | Resultados de evaluación |
| `20260318_system_prompts.sql` | System prompts |
| `20260408_autopilot_jobs.sql` | Tabla de jobs de autopilot |
| `20260409_autopilot_jobs_lock.sql` | Columnas `locked_until` + `last_heartbeat` |
| `20260409_prompt_rules.sql` | Tabla `prompt_rules_state` (singleton) |
| `20260426_children_color.sql` | Columna `color` en `children` (avatar del hijo) |
| `20260426_cleanup_children_emoji_hex.sql` | Cleanup: mueve códigos hex de `emoji` a `color` |
| `20260426_medication_intakes.sql` | Tabla `medication_intakes` (tomas individuales de tratamientos) |
| `20260427_families_timezone.sql` | Columna `timezone` en `families` (default Argentina; usada por morning-brief) |
| `20260427_families_timezone_manual_flag.sql` | Columna `timezone_set_manually` en `families` (lock para auto-detect) |
| `20260427_tasks_parent.sql` | Columna `parent_task_id` en `tasks` (self-reference) para agrupar sub-actividades bajo tarea paraguas |
| `20260427_routine_exceptions.sql` | Tabla `routine_exceptions`: overrides puntuales de rutinas (cancelar un día / cambiar horario para una fecha específica) |
| `20260505_notifications_sent.sql` | Tabla `notifications_sent`: registra push proactivos enviados (UNIQUE por entity_type+entity_id). Usada por el cron `upcoming-reminders` para idempotencia. |
| `20260514_family_patterns.sql` | Tabla `family_patterns`: memoria semántica de patrones detectados con `confidence` (0-1). Alimenta al decision agent. **AGENT-REWRITE Sprint 0.** |
| `20260514_family_preferences.sql` | Tabla `family_preferences`: preferencias y sensibilidades explícitas (correcciones, "no me hables del cumple", aliases, etc.). Prioridad sobre patrones inferidos. **AGENT-REWRITE Sprint 0.** |
| `20260514_family_learning_queue.sql` | Tabla `family_learning_queue`: cola de preguntas que Nanny quiere hacer para aprender de la familia. Max 1 por día. **AGENT-REWRITE Sprint 0.** |
| `20260514_support_contacts.sql` | Tabla `support_contacts`: red de apoyo de la familia (abuela, niñera, etc.). Vincula a teléfonos WhatsApp. Estado de consentimiento. **AGENT-REWRITE Sprint 0.** |
| `20260514_whatsapp_conversations.sql` | Tabla `whatsapp_conversations`: log de mensajes Nanny ↔ contactos vía Meta API. Incluye `intent` y `parsed_response` para integración con decision agent. **AGENT-REWRITE Sprint 0.** |
| `20260515_decision_agent_log.sql` | Tabla `decision_agent_log`: trace de cada despertar del decision agent (trigger scheduled/message/manual, decision JSONB, cost_usd, latency_ms). RLS read-only por familia. **AGENT-REWRITE Sprint 1.** |

---

## 11. Decisiones tomadas (vinculantes)

### Producto / Negocio

- El idioma de la app es **español**
- Auth con email/password (sin confirmación de email para MVP)
- Onboarding API usa admin client para crear familia antes de que exista el vínculo parent-family

### Arquitectura

- El autopilot es 100% server-side (Vercel Cron), no depende del browser
- `prompt-rules` se persisten en Supabase (no en memoria) para sobrevivir entre invocaciones serverless
- Job locking usa dos UPDATEs atómicos secuenciales en vez de `.or()` de Supabase
- Fases pesadas se separan con `yield` para no exceder `maxDuration=60s` de Vercel
- En lookups por `auth_user_id` o por familia, usar `.maybeSingle()` (no `.single()`) para no lanzar excepciones cuando no hay fila — esto causaba que `/api/check-family` y `/api/join-family` fallaran silenciosamente en el flujo de invitación
- El flujo de invitación al segundo padre persiste el `family_id` de invitación en `localStorage` (`nanny:pendingInvite`). Sobrevive a redirects de confirmación de email y se reintenta en `/chat` si la primera llamada a `/api/join-family` falla por race de cookies tras `signUp`
- **Invitación durable (mayo 2026):** la invitación NO depende solo del link/localStorage (que se pierde entre navegadores/dispositivos). Tres capas para que el segundo padre se una a la familia existente y NUNCA se cree una duplicada: (1) al registrarse, el `familyId` se guarda en la metadata del usuario (`pending_family_id`, server-durable); (2) **invitación por correo** — el invitador asocia el email de su pareja a un slot de parent sin vincular (columna `email`, ya existente, sin migración) vía `/api/invite-partner`; al crear la cuenta con ese correo, `join-family`/`onboarding` matchean por email y vinculan automáticamente; (3) `/api/onboarding` es idempotente: si el `authUserId` ya está vinculado o su email matchea un slot invitado, devuelve esa familia (`alreadyMember`) en vez de crear una nueva. Los matches de email usan `.eq()` con lowercase normalizado (no `.ilike()`, que trata `_`/`%` como comodines). `/chat` intenta unir SIEMPRE antes de caer en onboarding (el server resuelve por metadata o email)
- `family-write` distingue tablas con/sin columna `family_id`: `routines`, `routine_exceptions` y `families` están en `TABLES_WITHOUT_FAMILY_ID` y NO reciben scope automático en insert/update/delete (heredan acceso vía FK al hijo). Si se inyectara `family_id` en estas tablas, Postgres rechazaría el insert silenciosamente.
- Las rutinas son un concepto separado de eventos: las rutinas son horarios fijos recurrentes en `routines` (con `days_of_week INT[]`); las cancelaciones puntuales viven en `routine_exceptions` (referencia a `routine_id` + `date`). La agenda expande las rutinas activas por día y filtra excepciones canceladas
- El extractor LLM no es 100% confiable para crear rutinas; el `routine-detector` (regex determinístico) actúa como red de seguridad y reescribe el reply si encuentra patrón claro y el LLM no creó confirmation type=routine

### Diseño UI

- Color de acento único: `#7C3AED` (purple Apple)
- Tipografía: `Inter` via `next/font`
- **Patrón de edición: páginas full-screen con back arrow `size={26}`**, no popups ni bottom sheets. Excepción: confirms destructivos (logout, delete con doble-tap) son dialog modal centrado o confirm inline al pie
- Headers: white por defecto, purple eliminado salvo el avatar del hijo
- Inputs base: `padding: 8px 10px`, `font-size: 16px` (slim, alineado al composer del chat). Definido en `globals.css` `.input`
- Dark mode: auto vía `prefers-color-scheme`
- Componentes UI reutilizables: `app/src/components/ui/` (Button, Input, Sheet, Card, ListRow, Skeleton). El `Sheet` solo se usa para confirms destructivos, no para edición
- Animaciones: `.page-enter` al entrar a cada pantalla; respeta `prefers-reduced-motion`
- Escala de z-index: una sola fuente de verdad en `globals.css` (`--z-sticky:10` headers/composer, `--z-raised:30` FAB, `--z-nav:50` bottom nav, `--z-toast:55`, `--z-overlay:60` backdrop, `--z-modal:61` sheet, `--z-dialog:62` confirm centrado). Usar siempre el token (`z-[var(--z-…)]` en Tailwind o `var(--z-…)` en CSS), nunca valores numéricos sueltos. Excepción: stacking contexts locales (ej. avatares solapados del chat) pueden usar z chico relativo a sus hermanos. `landing` queda fuera (override de layout mobile)
- Edad de hijos: formato humano ("2 años y 11 meses" / "10 meses" / "1 año y 1 mes") via `app/src/lib/age.ts` `formatAge()` — usado en UI y en el contexto que recibe Nanny

### Documentación

- `CLAUDE.md` es el hub: contexto base + índice + resumen de planes activos
- Planes específicos viven en archivos `.md` separados (uno por plan)
- Cada cambio se refleja en el `.md` que corresponda en el mismo commit (ver sección 3)
