# Plan de Implementación — Mejoras de Inteligencia del Agente

**Estado:** listo para ejecutar en sesión nueva
**Branch base:** `claude/review-nanny-docs-0Gyo0`
**Branch de despliegue (Vercel):** `claude/analyze-parenting-whatsapp-app-cYaTb` (NO main)
**Documento de contexto técnico previo:** `propuesta-mejoras-agente.txt`

---

## Objetivo

Resolver de raíz el caso "Pau tiene guarde de Lunes a viernes de 9 a 4:30" y la categoría completa de eventos recurrentes, multi-evento y rutinas. Además, migrar el agente principal de "JSON-by-prompt" a **OpenAI Function Calling** para eliminar pérdida silenciosa de detecciones.

## Alcance de esta sesión

### IN scope
- **Nivel 2 completo (backend)**: schema con recurrencia, `confirmations[]`, validación iterativa, prompt con capacidad "rutinas"
- **Nivel 3.1**: migración a Function Calling de OpenAI
- **Nivel 3.3**: self-critique para detecciones críticas (medication + recurring events)
- **Evals**: agregar 5 conversaciones nuevas que cubran rutinas y multi-evento, correr suite

### OUT of scope (sesiones futuras)
- **Nivel 2.5 — UI de recurrencia** (`/hoy`, `/semana` deben renderizar instancias generadas). Requiere iteración visual, mejor en sesión dedicada con browser testing.
- **Nivel 3.2 — Router + Specialists**. Prematuro hasta tener un cuarto dominio (emails del cole). Riesgo alto sin checkpoints de eval intermedios.
- **Nivel 3.4 — Family memory estructurada completa** (touca `family-data` API). Hacer pase parcial: solo agregar `routines[]` al contexto.
- **Nivel 3.5 — Migración a Claude con prompt caching**. Incompatible con 3.1 en una sesión: hay que elegir SDK. Posponer.

---

## Pre-requisitos antes de arrancar

```bash
# 1. Verificar branch y estado limpio
git status
git branch --show-current   # debe ser claude/review-nanny-docs-0Gyo0

# 2. Capturar baseline de evals (CRÍTICO)
cd app
npm run test:eval:save       # guarda run actual como referencia
# Apuntar el ID/score para comparar al final

# 3. Verificar acceso a Supabase
# Confirmar que SUPABASE_SERVICE_ROLE_KEY está en .env.local

# 4. Backup del prompt activo en BD
# Ejecutar en Supabase SQL editor:
# SELECT * FROM system_prompts WHERE is_active = true;
# Guardar el content como backup local
```

**Si el baseline de evals está <70%, hablar con el usuario antes de proceder.** Estamos asumiendo un sistema funcional como punto de partida.

---

## Fase 1 — Schema + Types (1.5 horas)

### Archivos
- **NEW:** `supabase-migration-recurrence.sql`
- **MODIFY:** `app/src/lib/types.ts`

### Cambios SQL

```sql
-- Agregar recurrencia y vínculos a events
ALTER TABLE events
  ADD COLUMN recurrence_rule jsonb,
  ADD COLUMN time_end time,
  ADD COLUMN linked_event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN parent_event_id uuid REFERENCES events(id) ON DELETE CASCADE;

-- Index para queries de instancias generadas
CREATE INDEX idx_events_parent ON events(parent_event_id) WHERE parent_event_id IS NOT NULL;
CREATE INDEX idx_events_recurrence ON events USING GIN (recurrence_rule) WHERE recurrence_rule IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN events.recurrence_rule IS 'JSON: { freq: weekly|daily|monthly|yearly, days: [mon,tue,...], until: ISO date, interval: number }';
COMMENT ON COLUMN events.linked_event_id IS 'Vínculo lógico (ej: dropoff <-> pickup del mismo día)';
COMMENT ON COLUMN events.parent_event_id IS 'Si este evento es una instancia generada de un evento recurrente';
```

### Cambios TypeScript en `app/src/lib/types.ts`

Agregar:

```ts
export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  days?: WeekDay[];           // solo para freq=weekly
  until?: string;             // ISO date
  interval?: number;          // default 1
}

// Extender FamilyEvent
export interface FamilyEvent {
  // ...campos existentes...
  recurrence_rule?: RecurrenceRule | null;
  time_end?: string | null;        // HH:MM
  linked_event_id?: string | null;
  parent_event_id?: string | null;
}
```

### Acceptance test Fase 1
- Migración aplica sin error en Supabase local
- `npm run lint` y `tsc --noEmit` pasan en `app/`
- Tabla `events` tiene 4 columnas nuevas

### Rollback
```sql
ALTER TABLE events
  DROP COLUMN recurrence_rule,
  DROP COLUMN time_end,
  DROP COLUMN linked_event_id,
  DROP COLUMN parent_event_id;
```

---

## Fase 2 — Function Calling Migration (3.5 horas)

### Archivos
- **NEW:** `app/src/lib/chat/tools.ts`
- **MODIFY:** `app/src/lib/chat/processChat.ts`
- **MODIFY:** `app/src/app/api/chat/route.ts` (mínimo)

### Tools a definir en `tools.ts`

```ts
import type OpenAI from 'openai';

export const NANNY_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_event',
      description: 'Crear un evento puntual (one-time). Usar para citas médicas, reuniones, eventos únicos.',
      parameters: {
        type: 'object',
        required: ['title', 'date_start', 'event_type'],
        properties: {
          title: { type: 'string' },
          event_type: { type: 'string', enum: ['doctor', 'school', 'birthday', 'activity', 'travel', 'other'] },
          date_start: { type: 'string', description: 'ISO 8601' },
          time_end: { type: 'string', description: 'HH:MM si aplica' },
          location: { type: 'string' },
          assigned_to: { type: 'string', enum: ['mama', 'papa'] },
          child: { type: 'string' },
          linked_to_tool_call_id: { type: 'string', description: 'Vincular a otro tool call de esta misma respuesta (drop-off ↔ pick-up)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_recurring_event',
      description: 'Crear un evento recurrente (rutina). Usar cuando se mencionan días de semana, frecuencias o instituciones rutinarias (guardería, cole, clases regulares).',
      parameters: {
        type: 'object',
        required: ['title', 'event_type', 'time_start', 'recurrence'],
        properties: {
          title: { type: 'string' },
          event_type: { type: 'string', enum: ['doctor', 'school', 'birthday', 'activity', 'travel', 'other'] },
          time_start: { type: 'string', description: 'HH:MM' },
          time_end: { type: 'string', description: 'HH:MM si aplica' },
          recurrence: {
            type: 'object',
            required: ['freq'],
            properties: {
              freq: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
              days: { type: 'array', items: { type: 'string', enum: ['mon','tue','wed','thu','fri','sat','sun'] } },
              start_date: { type: 'string' },
              until: { type: 'string' },
            },
          },
          location: { type: 'string' },
          assigned_to: { type: 'string', enum: ['mama', 'papa'] },
          child: { type: 'string' },
          linked_to_tool_call_id: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Crear una tarea (con o sin fecha límite).',
      parameters: { /* análogo */ },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_medication',
      description: 'Crear un tratamiento médico con dosis y horarios.',
      parameters: { /* análogo a la estructura actual de medication */ },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_existing_event',
      description: 'Actualizar un evento ya registrado (cambio de hora, asignar responsable, etc.)',
      parameters: { /* event_id obligatorio + campos a actualizar */ },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_for_missing_info',
      description: 'No hay datos suficientes para crear nada. Preguntar específicamente.',
      parameters: {
        type: 'object',
        required: ['detection_summary', 'missing_fields'],
        properties: {
          detection_summary: { type: 'string' },
          missing_fields: { type: 'array', items: { type: 'string' } },
          question_to_ask: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_health_observation',
      description: 'Registrar síntoma o condición sin tratamiento (fiebre, tos, etc.)',
      parameters: { /* síntoma + hijo */ },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stay_silent',
      description: 'No hay nada accionable. Conversación casual.',
      parameters: { type: 'object', properties: {} },
    },
  },
];
```

### Refactor de `processChat.ts`

```ts
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  max_tokens: 1500,
  temperature: 0.2,
  tools: NANNY_TOOLS,
  tool_choice: 'auto',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: input.message },
  ],
});

const toolCalls = response.choices[0]?.message?.tool_calls || [];
const replyText = response.choices[0]?.message?.content || '';

// Mapear tool_calls → ChatResponse con confirmations[]
const confirmations = toolCalls
  .filter(tc => ['create_event', 'create_recurring_event', 'create_task', 'create_medication'].includes(tc.function.name))
  .map(tc => ({
    type: mapToolNameToType(tc.function.name),
    data: JSON.parse(tc.function.arguments),
    tool_call_id: tc.id,
  }));
```

### Cambios al ChatResponse type

```ts
export interface ChatResponse {
  should_respond: boolean;
  reply: string;
  intent: string;
  confirmations: Array<{ type: 'event' | 'recurring_event' | 'task' | 'medication'; data: Record<string, unknown>; tool_call_id?: string; linked_to?: string }>;
  pending_detection: { ... } | null;
  // mantener `confirmation` (singular) deprecated por compat — el frontend puede leer confirmations[0] mientras transiciona
}
```

### Acceptance test Fase 2
- Eval suite corre sin regresiones (delta < 5%)
- Test manual: "Pediatra mañana a las 10" → llama `create_event` con datos correctos
- Test manual: caso guardería → llama `create_recurring_event` 2 veces, vinculadas

### Riesgo principal
**Pérdida de detecciones que hoy funcionan por JSON-by-prompt.** Mitigación: mantener fallback al parser JSON anterior si `tool_calls` viene vacío Y `content` parece JSON. Borrar fallback solo cuando 2 corridas seguidas de eval pasen sin tocarlo.

---

## Fase 3 — Validation Refactor (1.5 horas)

### Archivos
- **MODIFY:** `app/src/lib/validation.ts`

### Cambios

1. Renombrar `validateNannyResponse` → mantener para compat, internamente delegar a:
2. **NEW:** `validateConfirmations(items, ...)` — itera array, valida coherencia entre vinculados
3. **NEW:** `validateRecurrenceRule(rule)` — valida `until > start`, `days` no vacío si freq=weekly, `interval >= 1`
4. **NEW:** `validateRecurringEventData(...)` — equivalente a `validateEventData` pero para rutinas
5. **MODIFY:** `validateEventData` → agregar check de `time_end > date_start` cuando ambos existen
6. **NEW:** Coherence check: si dos items tienen `linked_to`, validar que tipos sean compatibles (drop-off + pick-up del mismo día/rutina, no medication+event)

### Acceptance test Fase 3
- Unit tests nuevos pasan
- Caso: `pickup.time < dropoff.time` → invalid
- Caso: `recurrence.until` en el pasado → invalid
- Caso: `linked_to` que apunta a un id inexistente en el array → invalid

---

## Fase 4 — Prompt Rewrite (3 horas)

### Archivos
- **MODIFY:** `app/src/lib/chat/processChat.ts` (constante `SYSTEM_PROMPT`)
- **DB:** insertar nueva versión en `system_prompts` con `is_active = true` (después de validar con evals)

### Cambios en el prompt

1. **Eliminar** la sección "FORMATO DE RESPUESTA" que describe el JSON. Con tools, el formato lo controla OpenAI. Mantener solo descripción de cuándo usar cada tool.

2. **Agregar CAPACIDAD 6: DETECTAR RUTINAS Y MULTI-EVENTOS** con el texto completo del documento de propuesta.

3. **Agregar 3 ejemplos few-shot:**

```
EJEMPLO RUTINA — DROP-OFF + PICK-UP:
Mensaje: "Pau tiene guarde de Lunes a viernes de 9 a 4:30"
Tool calls esperados:
1. create_recurring_event({ title: "Llevar Pau a guardería", event_type: "school", time_start: "09:00", recurrence: { freq: "weekly", days: ["mon","tue","wed","thu","fri"], until: "2026-07-15" }, child: "Pau", linked_to_tool_call_id: "call_2" })
2. create_recurring_event({ title: "Recoger Pau de guardería", event_type: "school", time_start: "16:30", recurrence: { freq: "weekly", days: ["mon","tue","wed","thu","fri"], until: "2026-07-15" }, child: "Pau", linked_to_tool_call_id: "call_1" })

EJEMPLO RUTINA SIMPLE:
Mensaje: "Pau tiene fútbol martes y jueves a las 5"
Tool call: create_recurring_event({ title: "Fútbol Pau", event_type: "activity", time_start: "17:00", recurrence: { freq: "weekly", days: ["tue","thu"] }, child: "Pau" })

EJEMPLO MULTI-EVENTO INDEPENDIENTE:
Mensaje: "Pediatra martes a las 10 y dentista jueves a las 4"
Tool calls:
1. create_event({ title: "Pediatra Pau", event_type: "doctor", date_start: "2026-XX-XXT10:00", child: "Pau" })
2. create_event({ title: "Dentista Pau", event_type: "doctor", date_start: "2026-XX-XXT16:00", child: "Pau" })
```

4. **Mantener** las capacidades 1-5 actuales (intent, contexto temporal, intervención, etc.) — siguen siendo válidas.

5. **Acortar** secciones redundantes. El prompt actual tiene ~340 líneas; objetivo: <250 líneas con tools haciendo parte del trabajo de estructura.

### Versionado del prompt
1. Antes de activar: insertar nueva versión en `system_prompts` con `is_active = false`
2. Correr eval contra esa versión
3. Solo si pasa: marcar `is_active = true` y desactivar la anterior
4. Mantener la anterior como `is_active = false` para rollback rápido

### Acceptance test Fase 4
- Eval suite con prompt nuevo: score >= baseline - 3%
- Caso guardería en eval: `create_recurring_event` x2 vinculados
- Caso "antibiótico cada 8h durante 10 días": sigue funcionando (no regresión)

---

## Fase 5 — Self-critique (1.5 horas)

### Archivos
- **NEW:** `app/src/lib/chat/critique.ts`
- **MODIFY:** `app/src/lib/chat/processChat.ts`

### Cuándo aplicar
Solo para tool calls de **alto costo de error**:
- `create_recurring_event` (genera muchas instancias, errores se multiplican)
- `create_medication` (riesgo de salud)

NO aplicar para `create_task`, `create_event` puntual, `ask_for_missing_info`, `stay_silent` (overhead innecesario).

### Implementación

```ts
async function critiqueDetection(originalMessage: string, proposedToolCall: { name: string; args: any }): Promise<{ ok: boolean; issue?: string }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 200,
    temperature: 0,
    messages: [
      { role: 'system', content: 'Eres revisor crítico. Solo encuentras inconsistencias. Responde "OK" o describe el problema en una línea.' },
      { role: 'user', content: `Mensaje original: "${originalMessage}"\n\nAcción propuesta: ${proposedToolCall.name}(${JSON.stringify(proposedToolCall.args)})\n\n¿Hay alguna inconsistencia, fecha imposible, hora ambigua, o falta información clave?` }
    ],
  });
  const verdict = response.choices[0]?.message?.content?.trim() || '';
  return verdict.startsWith('OK') ? { ok: true } : { ok: false, issue: verdict };
}
```

Si `ok: false` → convertir el tool call a `ask_for_missing_info` con el `issue` como guía.

### Acceptance test Fase 5
- Caso ambiguo "antibiótico" sin frecuencia → critique cataloga como falta de info
- Caso recurring_event con `until` en el pasado → critique lo bloquea
- Casos válidos pasan critique en <1s extra

---

## Fase 6 — Evals + Sign-off (2 horas)

### Archivos
- **NEW:** `app/src/lib/eval/conversations/routines.json` (5 conversaciones nuevas)

### Conversaciones a agregar
1. **guarderia-basico**: caso del usuario, espera 2 recurring events vinculados
2. **futbol-multidias**: "Pau tiene fútbol martes y jueves a las 5"
3. **multi-evento-independiente**: "Pediatra martes a las 10 y dentista jueves a las 4"
4. **rango-fechas**: "Inscripciones del 10 al 15" (event con date_end)
5. **excursion-vinculados**: "Excursión sábado 8am, regreso lunes 6pm" (2 eventos vinculados)

Cada conversación define `expected.detections` con la estructura nueva (multi-item, recurrence, links).

### Correr suite final

```bash
cd app
npm run test:eval:save
```

### Criterios de sign-off
- Score global >= baseline (con margen de -3% aceptable por agregar casos nuevos más exigentes)
- Caso guardería pasa al 100%
- Casos de medicación existentes no regresan
- Tiempo total por mensaje < 4s p95 (function calling + critique no debe pasar de eso)

---

## Despliegue

**IMPORTANTE:** El branch `claude/review-nanny-docs-0Gyo0` NO es el branch de producción. Vercel deploya desde `claude/analyze-parenting-whatsapp-app-cYaTb`.

Flujo de deploy:
1. Trabajo terminado en `claude/review-nanny-docs-0Gyo0`
2. Push a remoto (con todos los commits de fase)
3. **Pedir aprobación al usuario** antes de hacer merge a la branch de producción
4. Merge de `claude/review-nanny-docs-0Gyo0` → `claude/analyze-parenting-whatsapp-app-cYaTb`
5. Vercel deploya automáticamente

**Antes del merge a deploy:**
- Migración SQL ya aplicada en Supabase prod (sin esto, las queries fallan)
- Variables de entorno verificadas
- Rollback plan documentado (revert + rollback SQL listo)

---

## Estructura de commits sugerida

```
feat(schema): add recurrence_rule and event linking to events table
feat(types): add RecurrenceRule and extend FamilyEvent
feat(agent): migrate processChat to OpenAI Function Calling
feat(validation): support confirmations array and recurrence validation
feat(prompt): add routines capability and few-shot examples for recurring events
feat(agent): add self-critique pass for high-stakes detections
test(eval): add 5 conversations for routines and multi-event detection
chore: bump prompt version, sign off eval baseline
```

Un commit por fase. Permite rollback granular.

---

## Riesgos y mitigaciones

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Schema migration falla en prod | Alta | Aplicar primero en Supabase de staging (si existe) o probar localmente con dump |
| Function calling regresiones silenciosas | Alta | Mantener fallback JSON parser en transición; eval baseline obligatorio |
| Prompt nuevo regresa en casos existentes | Media | Versionado en `system_prompts`; activación solo tras eval verde |
| Self-critique aumenta latencia >2s | Media | Aplicar solo a high-stakes; ejecutar en paralelo con response (no secuencial) si es posible |
| UI rompe porque espera `confirmation` singular | Media | Backend devuelve ambos: `confirmation` (legacy, primer item) + `confirmations[]` |
| Caso edge: rutina sin fecha de inicio explícita | Baja | Default a "próximo lunes" o fecha actual + 1 día |

---

## Checklist de handoff a sesión nueva

Al iniciar la sesión nueva, leer en este orden:
1. `CLAUDE.md` — contexto del proyecto
2. `propuesta-mejoras-agente.txt` — análisis técnico
3. `PLAN-IMPLEMENTACION.md` — este documento
4. Estado actual: `git log --oneline -10` y `git status`

Comandos para arrancar:
```bash
cd /home/user/nanny
git status
git branch --show-current
cd app
npm run test:eval:save     # baseline
```

Una vez con baseline, ejecutar Fase 1 → 6 en orden. NO saltarse fases. Cada fase tiene acceptance test que debe pasar antes de la siguiente.

---

## Estimación total

- Fase 1: 1.5h
- Fase 2: 3.5h
- Fase 3: 1.5h
- Fase 4: 3h
- Fase 5: 1.5h
- Fase 6: 2h
- **Total: ~13h** (sesión larga, factible si se mantiene foco)

Si la sesión empieza a alargarse más allá de Fase 4 sin acceptance, **parar y commitear**. Es preferible dejar 4 fases completas que 6 a medias.
