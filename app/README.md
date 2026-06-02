# Nanny — Asistente Familiar Inteligente

Web app mobile-first donde mamá, papá y un asistente AI conviven en un chat familiar. Nanny escucha la conversación, extrae eventos/tareas/medicamentos, organiza el calendario y avisa proactivamente.

> **Producto**: ver `../NANNY.md` para la visión y posicionamiento.
> **Contexto técnico**: ver `../CLAUDE.md` para arquitectura y decisiones.

---

## Setup rápido

### 1. Variables de entorno

```bash
cp .env.local.example .env.local
```

Edita `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
OPENAI_API_KEY=tu-openai-key
CRON_SECRET=cualquier-string-largo   # opcional, autentica el cron de Vercel
```

### 2. Base de datos (Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com)
2. En **SQL Editor**, ejecuta en orden:
   - `../supabase-schema.sql` — schema base (familias, hijos, eventos, tareas, mensajes, rutinas)
   - `../supabase-migration-auth.sql` — tabla parents + RLS por `auth_user_id`
   - `../supabase-migration-medications.sql` — tabla medicamentos
3. Aplicar las migraciones de `../supabase/migrations/`:

   **Recomendado:** usar el helper:
   ```bash
   ../scripts/db-migrate.sh           # aplica las pendientes
   ../scripts/db-migrate.sh --status  # ver qué falta
   ../scripts/db-migrate.sh --dry     # listar pendientes sin aplicar
   ```
   Requiere `SUPABASE_DB_URL` en `app/.env.local`. Tracking en tabla `_nanny_migrations`.

   **Manual:** ejecutar cada `.sql` por fecha en SQL Editor. Lista completa en `../CLAUDE.md` sección 10.

### 3. Instalar y correr

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). La UI está optimizada para mobile (max-width 430px).

---

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Dev server (Next.js 15, App Router) |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build |
| `npm run lint` | ESLint |
| `npm run test:eval` | Corre las 10 conversaciones de eval contra el pipeline |
| `npm run test:eval:save` | Igual, pero guarda el run en `evaluation_runs` |
| `npm run test:eval:diagnose` | Eval + diagnóstico AI de fallos + guarda |

Para correr eval offline (análisis manual sin OpenAI): `npx tsx src/lib/eval/run-eval-offline.ts`.

---

## Pantallas

**Bottom nav (4 tabs):** Chat, Agenda, Tareas, Hijos. Configuración vía gear ⚙ en headers.

### Tabs principales

| Ruta | Descripción |
|------|-------------|
| `/chat` | Chat familiar principal con Nanny AI |
| `/agenda` | Línea temporal: eventos + tareas con fecha + rutinas semanales + tomas |
| `/tareas` | Backlog completo de tareas, agrupadas |
| `/hijo` | Lista de hijos |

### Detalle / edición (full-screen, back arrow)

| Ruta | Descripción |
|------|-------------|
| `/evento/[id]` | Editar/eliminar evento |
| `/tarea/[id]` | Editar/eliminar tarea (vista paraguas si tiene sub-actividades) |
| `/tratamiento/[id]` | Detalle de tratamiento médico + acciones inline |
| `/hijo/[id]` | Perfil del hijo (Info / Agenda / Salud / Rutinas) |
| `/hijo/[id]/rutina/nueva` | Crear rutina semanal manualmente |
| `/perfil` | Hub de configuración familiar (solo navegación) |
| `/perfil/familia` | Editar nombre + zona horaria |
| `/perfil/padre/[id]` | Editar mamá/papá |
| `/perfil/hijo/[id]` | Editar hijo (datos + delete) |
| `/perfil/hijo/nuevo` | Agregar hijo |

### Auth + admin

| Ruta | Descripción |
|------|-------------|
| `/` | Landing / redirect según auth |
| `/login` | Auth email/password (Supabase Auth) |
| `/onboarding` | Setup conversacional de familia (chat-driven) |
| `/admin/testing` | Dashboard de evaluación + autopilot |
| `/admin/testing/[runId]` | Detalle de un run de eval |

### Deprecated (back-compat con bookmarks)

| Ruta | Descripción |
|------|-------------|
| `/hoy`, `/semana` | Redirigen a `/agenda` |
| `/mas`, `/red-apoyo`, `/insights` | Fuera del nav |

---

## API Routes

### Chat y onboarding
| Ruta | Descripción |
|------|-------------|
| `POST /api/chat` | Pipeline AI streaming SSE: classifier → extractor → routine-detector → postprocess |
| `POST /api/chat-catchup` | Resumen de mensajes perdidos |
| `POST /api/onboarding` | Crea familia + padre (admin client) |
| `POST /api/onboarding-chat` | Chat conversacional del onboarding |
| `GET /api/check-family` | Verifica vínculo parent ↔ family |
| `POST /api/join-family` | Unirse a familia existente por código |
| `GET /api/family-data` | Lee datos (acepta `?tables=...` con `family,parents,children,events,tasks,messages,medications,routines,routine_exceptions`) |
| `POST /api/family-write` | Escribe datos. Tablas sin `family_id` (`routines`, `routine_exceptions`, `families`) NO reciben scope automático |
| `GET /api/medication/[id]` | Tratamiento + sus tomas |

### Push notifications
| Ruta | Descripción |
|------|-------------|
| `POST /api/push-subscribe` | Registra suscripción del dispositivo |
| `POST /api/push-notify` | Envía notificación push |

### Evaluación / Autopilot
| Ruta | Descripción |
|------|-------------|
| `POST /api/eval/run` | Ejecuta eval mensaje por mensaje |
| `POST /api/eval/run/finalize` | Cierra y guarda el run |
| `GET /api/eval/runs` | Lista runs históricos |
| `GET /api/eval/runs/[runId]` | Detalle de un run |
| `POST /api/eval/save` | Persiste resultado de eval |
| `GET /api/eval/autopilot` | Status del autopilot (read-only) |
| `POST /api/eval/autopilot` | Inicia un job de autopilot |
| `DELETE /api/eval/autopilot` | Cancela el job activo |
| `POST /api/eval/diagnose` | Diagnóstico AI sobre un run |
| `GET/POST/PUT/DELETE /api/eval/prompt` | CRUD de reglas dinámicas del prompt |
| `GET /api/cron/autopilot` | Cron (cron-job.org, cada 1 min): autopilot |
| `GET /api/cron/morning-brief` | Cron (cron-job.org, cada 1 hora): brief matutino por TZ local |
| `GET /api/cron/nightly-catchup` | Cron (cron-job.org, cada 1 hora): catchup automático a las 4am locales |

---

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS 4** (mobile-first, max 430px)
- **Supabase** — PostgreSQL + Auth (email/password) + RLS por familia
- **OpenAI** `gpt-4o-mini` (clasificación, extracción, respuesta) con `temperature 0.3`
- **web-push** para notificaciones push
- **lucide-react** para iconos
- **date-fns** para fechas
- **tsx** para scripts de eval

Deploy: **Vercel Hobby** (`maxDuration` 60s, cron cada 1 min).

---

## Estructura del proyecto

```
app/
├── package.json
├── vercel.json              # framework: nextjs (crons externos en cron-job.org)
├── next.config.ts
├── public/
└── src/
    ├── middleware.ts        # auth middleware (Supabase SSR)
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx         # landing / redirect
    │   ├── globals.css      # design system (.input slim, .sheet, .btn, .glass...)
    │   ├── login/
    │   ├── onboarding/
    │   ├── chat/            # ~1900 líneas, refactor pendiente
    │   ├── agenda/          # tab 2: eventos + tareas + rutinas expandidas
    │   ├── tareas/          # tab 3: backlog
    │   ├── hijo/
    │   │   ├── page.tsx     # tab 4: lista
    │   │   └── [id]/
    │   │       ├── page.tsx          # perfil del hijo (Info/Agenda/Salud/Rutinas)
    │   │       └── rutina/nueva/     # crear rutina manualmente
    │   ├── evento/[id]/     # detalle/edit evento
    │   ├── tarea/[id]/      # detalle/edit tarea (incluye paraguas)
    │   ├── tratamiento/[id]/ # detalle medicación + acciones
    │   ├── perfil/
    │   │   ├── page.tsx              # hub navegación
    │   │   ├── familia/               # editar nombre + TZ
    │   │   ├── padre/[id]/
    │   │   ├── hijo/[id]/             # edit + delete
    │   │   └── hijo/nuevo/
    │   ├── hoy/             # redirect → /agenda (back-compat)
    │   ├── semana/          # redirect → /agenda (back-compat)
    │   ├── admin/testing/
    │   │   ├── page.tsx
    │   │   └── [runId]/
    │   └── api/
    │       ├── chat/                  # pipeline streaming SSE
    │       ├── chat-catchup/
    │       ├── onboarding/
    │       ├── onboarding-chat/
    │       ├── check-family/
    │       ├── join-family/
    │       ├── family-data/
    │       ├── family-write/
    │       ├── medication/[id]/
    │       ├── push-subscribe/
    │       ├── push-notify/
    │       ├── reset-user/
    │       ├── cron/
    │       │   ├── autopilot/
    │       │   ├── morning-brief/
    │       │   └── nightly-catchup/
    │       └── eval/
    │           ├── run/
    │           ├── runs/
    │           ├── save/
    │           ├── autopilot/
    │           ├── diagnose/
    │           └── prompt/
    ├── components/
    │   ├── BottomNav.tsx
    │   ├── TaskList.tsx
    │   └── ui/              # Button, Input, Sheet, Card, ListRow, Skeleton
    └── lib/
        ├── supabase.ts      # getSupabase() + getSupabaseAdmin()
        ├── types.ts         # Family, Parent, Child, Routine, RoutineException, ...
        ├── store.ts         # capa de datos (cache + fetch + write)
        ├── chat-stream.ts   # callChatStream() para el endpoint SSE
        ├── age.ts           # formatAge() — "2 años y 11 meses"
        ├── task-grouping.ts # buildGroupedTasks() — paraguas + sub-actividades
        ├── timezone.ts      # detectBrowserTimezone()
        ├── validation.ts
        ├── push.ts
        ├── demo-data.ts
        ├── chat/            # pipeline AI
        │   ├── processChat.ts
        │   ├── classifier.ts
        │   ├── extractor.ts
        │   ├── responder.ts
        │   ├── postprocess.ts
        │   ├── pipeline.ts
        │   ├── prompt-rules.ts
        │   ├── correction-rules.ts
        │   ├── routine-detector.ts        # red de seguridad regex
        │   └── routine-detector.test.ts   # tsx test runner
        └── eval/            # sistema de evaluación + autopilot
            ├── conversations/   # 10 conversaciones de test
            ├── profiles.ts
            ├── runner.ts
            ├── run-eval.ts
            ├── run-eval-offline.ts
            ├── scorer.ts
            ├── diagnosis.ts
            ├── autopilot-worker.ts
            ├── types.ts
            └── EVAL-ANALYSIS.md
```

---

## Pipeline de chat AI

Cada mensaje pasa por `src/lib/chat/pipeline.ts` (el `processChat.ts` legacy queda solo para eval offline):

1. **classifier** — decide si el mensaje es accionable y qué intent (EVENT_*, TASK_*, MEDICATION, SCHEDULE_CHANGE, ...) + `silent_action` flag
2. **extractor** — saca eventos / tareas / medicamentos / **rutinas semanales** / **excepciones de rutinas** / cambios de plan
3. **routine-detector** — red de seguridad determinística (regex). Si el extractor LLM no creó `confirmation: type=routine` y el mensaje matchea patrón claro de horario semanal (hijo + actividad + días + horario), fuerza la creación. Tests en `routine-detector.test.ts`
4. **postprocess** — valida, deduplica, normaliza fechas, fija `assigned_to` a "mama"/"papa"
5. **responder** — solo se invoca si el mensaje NO es accionable (saludos, preguntas, concerns)

El endpoint `/api/chat` devuelve **Server-Sent Events**:
- `event: will_respond` apenas el classifier decide → cliente prende los 3 puntos solo si va a haber respuesta real
- `event: response` con el `ChatResponse` completo
- `event: done` o `event: error` cierran el stream

Cliente: `src/lib/chat-stream.ts` con `callChatStream(payload, callbacks)`.

Las reglas del prompt viven en Supabase (`prompt_rules_state`, fila singleton `id=1`) y se editan vía `/api/eval/prompt` o desde el dashboard de testing. Esto sobrevive entre invocaciones serverless.

---

## Autopilot

Sistema 100% server-side que ejecuta:

```
evaluation (10 convs) → saving → diagnosis (AI) → reeval (10 convs) → complete
```

- Corre via **Vercel Cron** (`app/vercel.json` en la raíz del repo, cada 1 min)
- Cada invocación procesa ~45s de trabajo (budget seguro bajo `maxDuration=60s`)
- Job locking con `locked_until` (TTL 70s) para evitar doble ejecución
- Yield entre fases pesadas → cada fase arranca con budget completo
- Stuck detection: jobs sin heartbeat >5 min o creados hace >30 min se expiran
- Estado en tabla `autopilot_jobs`; un ciclo completo toma ~10-15 min

Ver `../CLAUDE.md` (sección Autopilot) para detalles de la arquitectura.

---

## Evaluación

10 conversaciones sintéticas en `src/lib/eval/conversations/` cubren casos como:
- Eventos simples / múltiples
- Medicamentos con frecuencia y duración
- Coordinación entre padres (assigned_to)
- Cambios de plan
- Conversaciones bilingües
- Logística doble (escuela + guardería)

Métricas: precision, recall, F1 por categoría (eventos, tareas, medicamentos, schedule_changes).

```bash
npm run test:eval              # solo correr y mostrar scores
npm run test:eval:save         # guardar en evaluation_runs
npm run test:eval:diagnose     # eval + diagnóstico AI + save
```

Estado actual (abril 2026): ~70% overall, precision ~52%, recall ~80%. Ver `src/lib/eval/EVAL-ANALYSIS.md` para análisis detallado.

---

## Troubleshooting

**El chat no responde / da errores 500**
- Verifica `OPENAI_API_KEY` en `.env.local`
- Revisa que las migraciones de Supabase estén aplicadas
- Mira logs en `vercel logs` o consola del navegador

**Autopilot se queda atascado**
- Desde `/admin/testing` puedes cancelar el job activo (DELETE)
- Si persiste: `UPDATE autopilot_jobs SET status='failed' WHERE status='running'` en SQL Editor
- Verifica que el cron esté corriendo (Vercel → Settings → Cron Jobs)

**RLS bloquea queries**
- Las API routes deben usar `getSupabaseAdmin()` (service role)
- El cliente browser usa `getSupabase()` (anon, respeta RLS)
- RLS filtra por `parents.auth_user_id = auth.uid()`

**Build falla por tipo en Next 15**
- Asegúrate de usar `await` en `cookies()` y `params` (cambio en Next 15)

---

## Deployment

- Vercel Hobby plan
- Branch de producción: ver `../CLAUDE.md`
- Cron jobs definidos en `app/vercel.json` en la raíz del monorepo
- `maxDuration` máximo: **60s** por serverless function
