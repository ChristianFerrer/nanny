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
| `NANNY.md` | Si necesitás contexto de producto / user stories | Documento de producto, estable |
| `REDESIGN-PLAN.md` | Si trabajás en UI/UX o querés ver el plan de rediseño | Plan del rediseño Apple-inspired (cerrado, archivo histórico) |
| `CHAT-REFACTOR-PLAN.md` | Si vas a refactorizar el chat | Plan vivo de refactor del chat (pendiente) |
| `app/README.md` | Onboarding rápido al stack | README de Next.js del app |

---

## 1. Branches y Deployment

### Branches activas

| Branch | Rol |
|---|---|
| `claude/continue-previous-session-OleqU` | **Producción Vercel.** Cualquier push acá deploya. Es la branch a la que apuntan los pushes de cambios validados. |
| `claude/continue-markdown-docs-JmrP4` | Branch del rediseño UI. Mantener en sync con la de producción (fast-forward) cuando hay cambios. |
| `claude/refactor-chat-into-components` | Pendiente de crear cuando arranque la sesión dedicada del refactor del chat. Ver `CHAT-REFACTOR-PLAN.md`. |

### Deployment

- **Vercel** despliega desde `claude/continue-previous-session-OleqU` (NO desde `main`)
- **Preview deploys** activos por default en cada branch que no sea producción
- NO sugerir cambiar a `main` ni crear branch `main`
- Cron jobs configurados en `app/vercel.json`
- Plan **Hobby**: `maxDuration = 60s` para serverless functions

---

## 2. Trabajos en curso (resumen)

### Rediseño Apple-inspired — ✅ Cerrado

14/14 micro-batches completados. Toda la app tiene el nuevo design system, animaciones de entrada, dark mode auto, bottom sheets, headers Apple-style. Detalle completo en `REDESIGN-PLAN.md`.

**Tareas adicionales completadas post-rediseño:**
- Feature de color del hijo completa (DB + tipo + UI)
- Bottom sheet para editor de horarios de medicación
- Animación `page-enter` en cada pantalla
- Componentes UI reutilizables en `app/src/components/ui/` (Button, Input, Sheet, Card, ListRow, Skeleton)

### Refactor del chat — ⏳ Pendiente (sesión dedicada)

`app/src/app/chat/page.tsx` tiene 1609 líneas con 30 useStates. Plan en 7 fases para extraer componentes y hooks. Plan completo en `CHAT-REFACTOR-PLAN.md`.

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
- **OpenAI** `gpt-4o-mini` para el chat AI
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
- `CRON_SECRET` (opcional, para autenticar cron de Vercel)

---

## 6. Páginas

| Ruta | Descripción |
|------|-------------|
| `/` | Landing / redirect |
| `/login` | Auth email/password |
| `/onboarding` | Setup inicial de familia |
| `/chat` | Chat familiar principal (Nanny AI) |
| `/hoy` | Vista del día |
| `/semana` | Vista semanal |
| `/hijo` | Lista de hijos |
| `/hijo/[id]` | Perfil de hijo |
| `/perfil` | Perfil del padre |
| `/admin/testing` | Dashboard de testing/eval |
| `/admin/testing/[runId]` | Detalle de un run de evaluación |

---

## 7. API Routes

| Ruta | Descripción |
|------|-------------|
| `/api/chat` | Procesa mensajes del chat (pipeline AI) |
| `/api/chat-catchup` | Resumen de mensajes perdidos |
| `/api/onboarding` | Crea familia y padres |
| `/api/onboarding-chat` | Chat conversacional del onboarding |
| `/api/family-data` | Lee datos de la familia |
| `/api/family-write` | Escribe datos de la familia |
| `/api/check-family` | Verifica si el usuario tiene familia |
| `/api/join-family` | Unirse a familia existente |
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
| `/api/cron/autopilot` | Cron endpoint (Vercel, cada 1 min) |

---

## 8. Pipeline de Chat AI (`app/src/lib/chat/`)

1. `processChat.ts` — orquestador principal
2. `classifier.ts` — clasifica intención del mensaje (gpt-4o-mini)
3. `extractor.ts` — extrae datos estructurados (eventos, tareas, medicamentos)
4. `responder.ts` — genera respuesta de Nanny
5. `postprocess.ts` — post-procesamiento
6. `pipeline.ts` — pipeline completo
7. `prompt-rules.ts` — reglas dinámicas persistidas en Supabase (`prompt_rules_state`)

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

### Estado del autopilot (abril 2026)

- ✅ La evaluación (10/10 conversaciones) funciona correctamente
- ✅ Las fases de saving y diagnosis completan OK
- ⏳ La fase reeval estaba fallando por timeout (yield fix desplegado, pendiente de verificar con un run completo)
- 📊 Scores recientes: ~70% overall, precision ~52%, recall ~80%
- ⚠️ Diagnóstico AI propone ajustes pero los scores no mejoran significativamente aún

### Problemas conocidos / áreas de mejora

1. **Reeval pendiente de verificar**: el yield fix (`5c9182c`) debería resolver el timeout en reeval. Verificar con un run completo.
2. **Scores bajos en precision (52%)**: el extractor tiene dificultades con `assigned_to`, fechas, y detección de múltiples eventos en mensajes complejos.
3. **Conversaciones difíciles**: "Coordinación bilingüe español-inglés" (38%) y "Logística doble: primaria y guardería" (39%) son las peores.
4. **prompt_version**: las eval runs del autopilot usan `'autopilot-pre'`/`'autopilot-post'` pero no diferencian qué reglas estaban activas.

---

## 10. Migraciones SQL requeridas

Aplicar en orden en el SQL Editor de Supabase:

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

### Diseño UI

- Color de acento único: `#7C3AED` (purple Apple)
- Tipografía: `Inter` via `next/font`
- Modales: bottom sheet en toda la app (deprecar fullscreen)
- Headers: white por defecto, purple eliminado salvo el avatar del hijo
- Dark mode: auto vía `prefers-color-scheme`
- Componentes UI reutilizables: `app/src/components/ui/` (Button, Input, Sheet, Card, ListRow, Skeleton)
- Animaciones: `.page-enter` al entrar a cada pantalla; respeta `prefers-reduced-motion`

### Documentación

- `CLAUDE.md` es el hub: contexto base + índice + resumen de planes activos
- Planes específicos viven en archivos `.md` separados (uno por plan)
- Cada cambio se refleja en el `.md` que corresponda en el mismo commit (ver sección 3)
