# Plan de Refactor del Chat — Sesión Dedicada

> ⚠️ **OBSOLETO — superseded por `AGENT-REWRITE-PLAN.md`** (14 mayo 2026).
>
> Este plan proponía refactor del chat para extraer componentes y hooks. Con el rediseño "Nanny como Asistente Real" iniciado en mayo 2026, el chat va a sufrir cambios mucho más profundos (paradigma reactivo → agente con criterio temporal). Los problemas que este plan resolvía (1900 líneas, 32 useStates) se resuelven naturalmente como parte del rediseño.
>
> **No usar este plan.** Para trabajo en el pipeline AI o el cliente del chat, ver `AGENT-REWRITE-PLAN.md`.
>
> Se mantiene este archivo como histórico.
>
> ---

> **Documento autocontenido para una sesión de Claude Code dedicada al refactor de `app/src/app/chat/page.tsx`.** Si arrancás esta sesión sin contexto previo, lee este archivo de principio a fin antes de tocar código.

---

## 1. Contexto

`app/src/app/chat/page.tsx` tiene **~1900 líneas**, **~32 useStates**, y mezcla render con lógica de negocio (buffering, polling, intent detection, medication flow, swipe-to-reply, search, catch-up, onboarding mode, **routines + routine_exceptions** agregados en abril 2026).

El plan original de rediseño Apple-inspired (`REDESIGN-PLAN.md`) marcó esto como **alto riesgo, sesión dedicada**. Esa es esta sesión.

### Por qué refactorizar (cuantificado)

| Métrica | Hoy | Después |
|---|---|---|
| Líneas en `chat/page.tsx` | ~1900 | ~700 |
| Re-renders por keystroke en input | 50+ (todos los mensajes) | 0 (con `React.memo`) |
| Tamaño de PR típico | 200-500 líneas | 50-100 |
| Cobertura de tests viable | ~0% | 70%+ |
| Tiempo onboarding nuevo dev | ~1 hora | ~15 min |

### Por qué es riesgoso

State acoplado entre 30 piezas. Romper una sutileza puede dejar el chat —el corazón de la app— inutilizable. Por eso refactorizamos **incremental con validación visual en cada paso**.

---

## 2. Setup del entorno (Claude Code web)

### Branch dedicada

```
claude/refactor-chat-into-components
```

Crear desde `claude/continue-previous-session-OleqU` (la branch de producción de Vercel) **al inicio** de la sesión:

```bash
git checkout claude/continue-previous-session-OleqU
git pull origin claude/continue-previous-session-OleqU
git checkout -b claude/refactor-chat-into-components
```

**No** trabajar directo sobre la branch de Vercel — si algo se rompe, queda fuera de prod hasta el merge final.

### Playwright MCP

El repo ya tiene `.mcp.json` en la raíz registrando Playwright MCP. En la sesión web te aparece un diálogo de "trust workspace" la primera vez — aprobalo.

Tools disponibles (prefijo `mcp__playwright__`): `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, `browser_take_screenshot`, `browser_wait_for`, etc.

### Plan B si Playwright falla en el sandbox web

Hay riesgo conocido de que el sandbox web no soporte la descarga de Chromium (timeouts, disk limits). Si Playwright no levanta:

1. El usuario abre Vercel preview deploy en su browser
2. El usuario valida los 13 checks manualmente por fase
3. El usuario reporta OK / falla en el chat
4. Avanzamos / revertimos

Es más lento pero funcional.

### Variables de entorno

`.env.local` (en el sandbox de Claude Code) debe tener:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Si faltan, el dev server arranca pero el chat falla en runtime.

### Cuenta de prueba

Usar una familia/cuenta de prueba en Supabase (NO la cuenta real del usuario). Si no existe, crear una con `demoChildren` de `app/src/lib/demo-data.ts` o vía la UI de onboarding.

---

## 3. Estado actual del archivo

`app/src/app/chat/page.tsx` — **~1900 líneas**

### Estados (~32 total)

```ts
// Datos cargados
messages, parents, children, events, tasks, medications, routines, routineExceptions,
familyId, currentParent

// UI/Input
input, showHeaderMenu, showSearch, searchQuery, replyingTo

// Feedback
feedbackGiven (Record<msgId, 'up'|'down'>)

// Push notifications
pushStatus, toast

// Medication flow (acoplado, ahora inline en el bubble)
pendingMedConfirm, editingMedTimes

// Pending detection / catch-up
pendingDetection, catchingUp

// Loading/thinking states
nannyThinking, nannyWaiting, dataLoaded

// Onboarding mode (chat usado en /onboarding)
onboardingMode, onboardingExtracted, onboardingSending, onboardingSaving,
onboardingAuthUserId, onboardingAuthEmail
```

> **Cambio post-plan original:** se agregaron `routines` y `routineExceptions` cuando se introdujo la feature de rutinas semanales (abril 2026). El handler de `confirmation: type=routine` y `type=routine_exception` está en el callback de `callChatStream`. El editor de horarios de medicación se pasó de bottom sheet a inline dentro del bubble (para alinearse con el patrón "no popups").

### Refs y timers

- `containerRef` — wrapper principal del chat
- Polling de mensajes nuevos cada 3s
- Buffering timer 8s
- Visual viewport listener para keyboard mobile

### Componentes inline a extraer

1. **`MessageBubble`** — el bubble de un mensaje individual (líneas 1399-1530 aprox)
2. **`IntentCard`** — las cards de intent EVENT/TASK/MEDICATION (función `renderIntentBadge` actual)
3. **`MedicationConfirmFlow`** — los 3 botones del bubble + bottom sheet del editor (líneas 1431-1506 + 1590-1683)
4. **`SwipeableMessage`** — wrapper con touch events para swipe-to-reply (líneas 60-99)
5. **`HeaderMenu`** — el menú hamburguesa con MenuItem (líneas 1188-1211)
6. **`PendingDetectionBanner`** — banner sticky de pending detection (líneas 1245-1265)
7. **`PushPrompt`** — prompt de habilitar notificaciones (líneas 1282-1301)

### Hooks custom a extraer (Fase 5)

- `useMedicationFlow` — encapsula `pendingMedConfirm`, `editingMedTimes`, `handleMedicationConfirm`
- `useChatPolling` — encapsula el polling y buffering
- `useSwipeReply` — encapsula los touch events del swipe

---

## 4. Las 7 fases

Cada fase = **1 commit** con build verde + screenshots de validación.

### Fase 0 — Smoke test (20 min)

**Objetivo:** confirmar que Playwright funciona y tomar screenshots baseline del chat actual.

Pasos:
1. `npm install` (si no está instalado)
2. `npm run dev` en background
3. Verificar que `localhost:3000` responde
4. Si Playwright MCP está disponible:
   - Navegar al chat
   - Tomar screenshot baseline de cada flujo (los 13 checks abajo)
   - Guardar screenshots como referencia
5. Si Playwright NO está disponible (Plan B):
   - Pedir al usuario que abra el chat en Vercel preview
   - Pedir que confirme cada uno de los 13 checks "antes del refactor"
6. Commit: `chore(chat): baseline screenshots antes del refactor`

### Fase 1 — Extraer `MessageBubble` (45 min)

**Objetivo:** sacar el JSX del bubble individual a `app/src/components/chat/MessageBubble.tsx`.

Reglas:
- Componente **puro de presentación** (props in / JSX out, sin `useState`)
- Sin `pendingMedConfirm`, sin `editingMedTimes`, sin handlers internos
- Recibe: `message`, `sender` (Parent | 'nanny'), `isCurrentParent`, `onReply?`, `children?` (slot para badges/medication/feedback)
- `React.memo` para evitar re-renders innecesarios

Pasos:
1. Crear `app/src/components/chat/MessageBubble.tsx` con la API de props definida
2. En `chat/page.tsx`: reemplazar el JSX del bubble (~líneas 1399-1430) por `<MessageBubble {...} />`
3. Mover los addons (intent badge, medication, feedback) como `children` o slots separados
4. `npm run build` verde
5. Validar visualmente: enviar mensaje, recibir respuesta, ver bubble igual
6. Commit: `refactor(chat): extraer MessageBubble como componente puro`

### Fase 2 — Extraer `IntentCard` (30 min)

**Objetivo:** sacar la función `renderIntentBadge` a `app/src/components/chat/IntentCard.tsx`.

Reglas:
- Pure component (sin state)
- Props: `intent`, `pendingMedConfirm` (boolean), `data` (event/task/medication)
- Toda la lógica de "qué CTA mostrar" según intent

Pasos:
1. Crear `app/src/components/chat/IntentCard.tsx`
2. Mover `renderIntentBadge` y la lógica relacionada
3. Reemplazar la llamada en `MessageBubble`
4. Build verde + validar visual: cada tipo de intent renderea bien
5. Commit: `refactor(chat): extraer IntentCard`

### Fase 3 — Extraer `MedicationConfirmFlow` (60 min) — RIESGO MEDIO

**Objetivo:** mover los 3 botones inline + bottom sheet del editor a un componente con state local.

Reglas:
- Tiene state local: `editingTimes` (antes era `editingMedTimes` en page.tsx)
- Recibe del padre: `pendingMedConfirm`, `onConfirm(action)`, `onUpdateTimes(times)`
- Encapsula los 3 botones del bubble (Sí, Editar, No) y el sheet del editor

Pasos:
1. Crear `app/src/components/chat/MedicationConfirmFlow.tsx`
2. Mover state `editingMedTimes` adentro
3. En page.tsx: quitar el state `editingMedTimes` y pasar handlers
4. Build verde
5. Validar TODOS los flujos: confirm directo, confirm con edit, reject, cancel del sheet
6. Commit: `refactor(chat): extraer MedicationConfirmFlow con state local`

### Fase 4 — Extraer `SwipeableMessage` (45 min) — RIESGO MEDIO

**Objetivo:** mover el wrapper con touch events para swipe-to-reply.

Reglas:
- Touch events + refs adentro
- Props: `children`, `onReply()`
- Mantener la animación CSS y el botón de fallback (a11y)

Pasos:
1. Crear `app/src/components/chat/SwipeableMessage.tsx`
2. Mover los touch handlers
3. En page.tsx: envolver `<MessageBubble>` con `<SwipeableMessage>`
4. Build verde
5. Validar: swipe en mobile (Playwright touch events), botón de fallback en focus
6. Commit: `refactor(chat): extraer SwipeableMessage`

### Fase 5 — Extraer hooks custom (90 min) — RIESGO ALTO

**Objetivo:** sacar lógica de negocio de page.tsx a hooks reutilizables.

Hooks a crear:
- `useMedicationFlow()` — encapsula `pendingMedConfirm`, `handleMedicationConfirm`
- `useChatPolling(familyId)` — encapsula polling y buffering
- `useSwipeReply()` — encapsula gesture state

Pasos (uno por hook, commit por hook):
1. Crear hook con tests
2. Migrar page.tsx para usar el hook
3. Build verde + validar flujos relacionados
4. Commit: `refactor(chat): extraer useXxx hook`

### Fase 6 — Validación final (30 min)

**Objetivo:** correr suite completa de Playwright (o validación manual del usuario).

Pasos:
1. Si Playwright funciona: correr los 13 checks contra el código nuevo, comparar con baseline de Fase 0
2. Si no: pedir validación manual al usuario
3. Si todo pasa: push final + opcional merge a `claude/continue-previous-session-OleqU`
4. Si algo falla: revertir esa fase específica con `git revert <commit>`, diagnosticar, fix, repetir

---

## 5. Los 13 checks de validación

En cada fase, estos flujos deben seguir funcionando idénticos. Son el **contrato del refactor**.

| # | Check | Cómo validar |
|---|---|---|
| 1 | Mandar mensaje y recibir respuesta de Nanny | Type input → Enter → ver bubble Nanny aparecer |
| 2 | Intent EVENT → IntentCard con CTA | Mensaje "tenemos cita martes 3pm" → ver card "Ver en agenda →" |
| 3 | Intent TASK → IntentCard con CTA | Mensaje "comprar leche" → ver card de tarea |
| 4 | Intent MEDICATION → 3 botones (Sí, Editar, No) | Mensaje "Pau toma jarabe 3 veces al día" → ver bubble con 3 botones y resumen de horarios |
| 5 | Click "Editar horarios" → bottom sheet abre | Click → sheet con inputs de hora aparece |
| 6 | Editar horarios y guardar | Cambiar 08:00 a 09:00 → click Guardar → sheet cierra → resumen del bubble actualizado |
| 7 | Confirmar medicación con horarios editados | Después de #6 → click Sí, crear → medicación aparece en `/hijo/[id]` |
| 8 | Rechazar medicación | Click No → bubble vuelve a estado normal sin botones |
| 9 | Swipe izquierda en mensaje → reply preview | Touch swipe → ver banner "Respondiendo a..." |
| 10 | Click botón reply (alternativa swipe a11y) | Tab focus → botón visible → Enter → mismo efecto |
| 11 | Buscar "doctor" → mensajes filtrados | Click search → type → ver mensajes con highlight |
| 12 | "Ponte al día" → resumen aparece | Click → ver resumen de mensajes perdidos |
| 13 | Feedback up/down → ícono cambia | Click thumbs up → "Gracias" persiste tras reload |

Adicional opcional:
- 14 - Dark mode: toggle SO → contraste correcto
- 15 - Onboarding mode: chat funciona desde `/onboarding`

---

## 6. Comandos de recuperación

### Si una fase falla y querés revertirla

```bash
git log --oneline -5  # encuentra el commit de la fase
git revert <hash>     # crea un commit que deshace la fase
git push origin claude/refactor-chat-into-components
```

**Nunca** hacer `git reset --hard` después de pushear — usar revert.

### Si querés abandonar todo el refactor

```bash
git checkout claude/continue-previous-session-OleqU
git branch -D claude/refactor-chat-into-components  # solo si no hay commits que querés conservar
```

### Si Playwright cuelga el sandbox

```bash
pkill -f playwright
pkill -f chromium
```

Luego cambiar a Plan B (validación manual del usuario en Vercel preview).

---

## 7. Prompt inicial para arrancar la sesión

**Copia y pega esto al iniciar la nueva sesión de Claude Code:**

```
Empezá la sesión dedicada de refactor del chat.

1. Lee CHAT-REFACTOR-PLAN.md de principio a fin antes de tocar código
2. Crea la branch claude/refactor-chat-into-components desde claude/continue-previous-session-OleqU
3. Verifica que Playwright MCP esté disponible (.mcp.json en el repo lo registra)
4. Ejecuta la Fase 0 (smoke test) y muéstrame los screenshots o el reporte de validación
5. Después de Fase 0, esperá mi OK antes de avanzar con la Fase 1

Si Playwright no funciona en el sandbox, usá el Plan B y avísame para que valide
manualmente en Vercel preview deploys.
```

---

## 8. Decisiones tomadas (vinculantes)

| Decisión | Detalle |
|---|---|
| Branch | `claude/refactor-chat-into-components` (nueva, NO la de prod) |
| Carpeta destino | `app/src/components/chat/*` |
| Granularidad | 1 commit por fase, build verde obligatorio |
| Validación | Playwright si funciona, sino usuario en Vercel preview |
| API de props | Pure components con `React.memo` donde aplique |
| Hooks custom | En `app/src/lib/chat/hooks/*` |
| Tests E2E | Opcional pero recomendado escribirlos en Fase 0 |
| Recovery | `git revert` por commit, nunca `--hard` |

---

## 9. Estado y tracking

### Estado al cierre de la sesión 2026-04-26

- ✅ `.mcp.json` creado y commiteado
- ✅ `CHAT-REFACTOR-PLAN.md` creado (este archivo)
### Estado al cierre de la sesión 2026-04-26

- ✅ `.mcp.json` creado y commiteado
- ✅ `CHAT-REFACTOR-PLAN.md` creado (este archivo)
- ✅ **Setup E2E completo** (PR #1 mergeado, commit `7843a75`):
  - Playwright + workflow GitHub Actions corriendo en cada push a `claude/**`
  - 5 tests E2E críticos del chat verde en CI
  - Mocks de Supabase + OpenAI sin secrets reales
  - Bypass de auth vía `E2E_TEST_MODE` / `NEXT_PUBLIC_E2E_TEST_MODE`
- ⏳ Sesión dedicada de refactor **pendiente de iniciar**
- ⏳ Fase 1-6: pendientes (Fase 0 ya cubierta por el setup E2E)

### Cierre por fase (a llenar durante la sesión dedicada)

| Fase | Status | Commit | Validación |
|---|---|---|---|
| 0 — Smoke test | ✅ | `7843a75` | CI verde, 6/6 tests pasaron |
| 1 — MessageBubble | ⏳ | — | — |
| 2 — IntentCard | ⏳ | — | — |
| 3 — MedicationConfirmFlow | ⏳ | — | — |
| 4 — SwipeableMessage | ⏳ | — | — |
| 5 — Hooks custom | ⏳ | — | — |
| 6 — Validación final | ⏳ | — | — |
