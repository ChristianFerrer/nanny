# Nanny - Contexto del Proyecto

## Deployment
- **Vercel** despliega desde la branch `claude/continue-previous-session-OleqU` (NO desde main)
- La production branch en Vercel YA apunta a esta branch
- NO sugerir cambiar a main ni crear branch main
- Cron jobs configurados en `app/vercel.json`

## Tech Stack
- Next.js 15 (App Router) + TypeScript
- Supabase (PostgreSQL + Auth con email/password)
- OpenAI gpt-4o-mini para el chat AI
- Tailwind CSS 4 (mobile-first, max 430px)
- Deployed en Vercel (Hobby plan: maxDuration=60s para serverless functions)

## Arquitectura

### Directorios
- App directory: `app/src/app/`
- Lib compartido: `app/src/lib/`
- API routes: `app/src/app/api/`
- Migraciones SQL: `supabase/migrations/`
- Config Vercel: `app/vercel.json`

### Supabase
- API routes usan `getSupabaseAdmin()` (service role key, bypasa RLS) para operaciones server-side
- Cliente browser usa `getSupabase()` (anon key, respeta RLS)
- RLS aísla datos por familia usando `parents.auth_user_id = auth.uid()`

### Variables de Entorno (Vercel + .env.local)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `CRON_SECRET` (opcional, para autenticar cron de Vercel)

## Páginas
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

## API Routes
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

## Pipeline de Chat AI (`app/src/lib/chat/`)
1. `processChat.ts` — orquestador principal
2. `classifier.ts` — clasifica intención del mensaje (gpt-4o-mini)
3. `extractor.ts` — extrae datos estructurados (eventos, tareas, medicamentos)
4. `responder.ts` — genera respuesta de Nanny
5. `postprocess.ts` — post-procesamiento
6. `pipeline.ts` — pipeline completo
7. `prompt-rules.ts` — reglas dinámicas persistidas en Supabase (`prompt_rules_state`)

## Sistema de Evaluación (`app/src/lib/eval/`)
- 10 conversaciones de test en `conversations/01..10-*.ts`
- `profiles.ts` — perfiles de familias ficticias para eval
- `scorer.ts` — scoring de resultados (precision, recall, etc.)
- `runner.ts` / `run-eval.ts` — ejecución de evaluaciones
- `diagnosis.ts` — diagnóstico AI de fallos (propone ajustes al prompt)
- `types.ts` — tipos compartidos

## Autopilot — Arquitectura y Estado Actual

### Qué es
Sistema automatizado que evalúa el pipeline AI, diagnostica fallos, aplica ajustes al prompt, y re-evalúa para verificar mejoras. Corre 100% en el servidor via Vercel Cron, independiente del browser.

### Pipeline de fases
```
evaluation (10 convs) → saving → diagnosis (OpenAI) → reeval (10 convs) → complete
```

### Archivos clave
- `app/src/lib/eval/autopilot-worker.ts` — worker compartido (processOneUnit, processUntilBudget, claimJob, findRunningJob)
- `app/src/app/api/eval/autopilot/route.ts` — API (GET status, POST iniciar, DELETE cancelar)
- `app/src/app/api/cron/autopilot/route.ts` — Cron endpoint (Vercel, cada 1 min, budget 45s)
- `app/src/app/admin/testing/page.tsx` — UI del dashboard

### Tablas Supabase
- `autopilot_jobs` — estado del job (status, phase, current_conversation, conversation_scores, locked_until, last_heartbeat, etc.)
- `prompt_rules_state` — reglas del prompt persistidas (fila singleton id=1, campos: active_rules JSONB, snapshot JSONB, version_counter)
- `evaluation_runs` — resultados guardados de evaluaciones

### Mecanismo de concurrencia
- **Job locking**: compare-and-swap en `locked_until` (70s TTL). Dos UPDATEs atómicos secuenciales (no usar `.or()` de Supabase con ISO timestamps — rompe el parser PostgREST).
- **Stuck detection**: `expireIfStale()` checa `last_heartbeat` (>5 min) y `created_at` (>30 min). Solo `findRunningJob` (cron) expira jobs; el GET es read-only.
- **Yield entre fases**: `processOneUnit` retorna `'yield'` entre fases pesadas (saving→diagnosis, diagnosis→reeval) para que cada fase arranque en una invocación fresca del cron con budget completo. Esto evita exceder maxDuration=60s.
- **Idempotencia**: fase `saving` checa si `eval_run_id` ya existe antes de insertar.

### Restricciones de Vercel Hobby
- maxDuration = 60s para serverless functions
- Cron cada 1 minuto (configurado en `app/vercel.json`)
- Cada invocación del cron procesa ~45s de trabajo (2 conversaciones aprox.)
- Un ciclo completo (eval 10 + diagnosis + reeval 10) toma ~10-15 min con cron delays

### Migraciones requeridas (aplicar en SQL Editor de Supabase)
| Archivo | Descripción |
|---------|-------------|
| `20260312_push_subscriptions.sql` | Suscripciones push |
| `20260318_evaluation_runs.sql` | Resultados de evaluación |
| `20260318_system_prompts.sql` | System prompts |
| `20260408_autopilot_jobs.sql` | Tabla de jobs de autopilot |
| `20260409_autopilot_jobs_lock.sql` | Columnas locked_until + last_heartbeat |
| `20260409_prompt_rules.sql` | Tabla prompt_rules_state (singleton) |

### Estado actual del autopilot (abril 2026)
- La evaluación (10/10 conversaciones) funciona correctamente
- La fase de saving y diagnosis completan OK
- La fase reeval estaba fallando por timeout (yield fix desplegado, pendiente de verificar)
- Scores recientes: ~70% overall, precision ~52%, recall ~80%
- Diagnóstico AI propone ajustes pero los scores no mejoran significativamente aún

### Problemas conocidos / áreas de mejora
1. **Reeval pendiente de verificar**: el yield fix (`5c9182c`) debería resolver el timeout en reeval. Verificar con un run completo.
2. **Scores bajos en precision (52%)**: el extractor tiene dificultades con assigned_to, fechas, y detección de múltiples eventos en mensajes complejos.
3. **Conversaciones difíciles**: "Coordinación bilingüe español-inglés" (38%) y "Logística doble: primaria y guardería" (39%) son las peores.
4. **prompt_version**: las eval runs del autopilot usan 'autopilot-pre'/'autopilot-post' pero no diferencian qué reglas estaban activas.

## Decisiones Tomadas
- Onboarding API usa admin client para crear familia antes de que exista el vínculo parent-family
- Auth con email/password (sin confirmación de email para MVP)
- El idioma de la app es español
- El autopilot es 100% server-side (Vercel Cron), no depende del browser
- prompt-rules se persisten en Supabase (no en memoria) para sobrevivir entre invocaciones serverless
- Job locking usa dos UPDATEs atómicos secuenciales en vez de `.or()` de Supabase
- Fases pesadas se separan con `yield` para no exceder maxDuration=60s de Vercel
