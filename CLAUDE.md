# Nanny - Contexto del Proyecto

## Deployment
- **Vercel** está configurado para deployar desde la branch `claude/analyze-parenting-whatsapp-app-cYaTb` (NO desde main)
- La production branch en Vercel YA apunta a esta branch
- NO sugerir cambiar a main ni crear branch main

## Tech Stack
- Next.js 15 (App Router) + TypeScript
- Supabase (PostgreSQL + Auth con email/password)
- OpenAI gpt-4o-mini para el chat AI (gpt-4o solo para diagnóstico de evals)
- Tailwind CSS 4 (mobile-first, max 430px)
- Deployed en Vercel

## Arquitectura
- App directory: `/app/src/app/`
- API routes usan `getSupabaseAdmin()` (service role key, bypasa RLS) para operaciones server-side
- Cliente browser usa `getSupabase()` (anon key, respeta RLS)
- RLS aísla datos por familia usando `parents.auth_user_id = auth.uid()`

## Variables de Entorno (Vercel + .env.local)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

## Decisiones Tomadas
- Onboarding API usa admin client para poder crear familia antes de que exista el vínculo parent-family
- Auth con email/password (sin confirmación de email para MVP)
- El idioma de la app es español

---

## Posicionamiento Estratégico

- **Mercado primario:** LATAM hispanohablante. NO competir en US/EN — los competidores con financiación (Nori, Maple, Ohai, Sense, Peggy) dominan ahí.
- **Tesis del producto:** Nanny absorbe el trabajo de coordinación parental que WhatsApp estructuralmente no puede hacer. NO reemplaza WhatsApp; convive con él.
- **Foso defendible:** chat-as-input + red de apoyo extendida (abuela/niñera) + cultura LATAM + idioma español + que WhatsApp Business API no permite bots en grupos (cierra esa puerta a competidores).
- **Métrica madre Fase 2:** % de familias con AMBOS padres activos a las 4 semanas (>=60%). Si solo mamá usa, el thesis falla.

---

## Estado del Agente IA (a 2026-04-28)

**Arquitectura actual:** un solo agente principal monolítico, NO multi-agente.

| Cerebro | Archivo | Modelo | Función |
|---|---|---|---|
| Agente principal (chat real-time) | `app/src/lib/chat/processChat.ts` | gpt-4o-mini | Clasificar + extraer + decidir + next_action en un solo JSON |
| Agente catch-up (re-análisis batch) | `app/src/app/api/chat-catchup/route.ts` | gpt-4o-mini | Re-leer historial completo y rescatar items |
| Agente diagnóstico (eval interno) | `app/src/lib/eval/diagnosis.ts` | gpt-4o | Analizar fallos de evals y proponer ajustes al prompt |

**Salida del agente principal:** JSON con `intent` (15 valores), `next_action` (9 valores), `confirmation` (singular), `pending_detection` para state conversacional. Validación TS posterior en `app/src/lib/validation.ts` antes de persistir.

**Evals:** suite de conversaciones sintéticas en `app/src/lib/eval/`. Prompt versionado en tabla `system_prompts` con fallback al hardcoded.

---

## Limitaciones Conocidas del Agente

1. **Sin recurrencia:** schema de `events` solo soporta `date_start` único. Casos como "guarde L-V de 9 a 4:30" o "fútbol martes y jueves" no se modelan correctamente — se guarda 1 evento puntual y se pierde info.
2. **Sin multi-evento por mensaje:** `confirmation` es objeto único, no array. No puede crear drop-off + pick-up vinculados desde una sola mención.
3. **Sin tool calling:** todo el formato es JSON-by-prompt, frágil. Cuando el modelo malforma el JSON, el `try/catch` devuelve `intent: CHAT` silenciosamente (detecciones perdidas no observables).
4. **Prompt monolítico de ~340 líneas:** colisiones de reglas al agregar dominios nuevos. Próximo cuello de botella arquitectural cuando se agregue email cole, red de apoyo o conflictos avanzados.

---

## Próxima Fase de Trabajo

**Plan ejecutable:** ver `PLAN-IMPLEMENTACION.md` (raíz del repo).

**Resumen del plan:**
- Nivel 2 backend completo (recurrencia + multi-evento + validación)
- Nivel 3.1 (migración a OpenAI Function Calling)
- Nivel 3.3 (self-critique para detecciones high-stakes)
- 5 conversaciones de eval nuevas

**Fuera de scope hasta nueva sesión:**
- UI para renderizar recurrencia en `/hoy` y `/semana`
- Split a Router + Specialists (esperar a tener cuarto dominio)
- Migración a Claude (incompatible con function calling de OpenAI en una sola sesión)

---

## Documentos relevantes en el repo

- `NANNY.md` — vision de producto completa (~2000 líneas, no implementación)
- `PLAN-IMPLEMENTACION.md` — runbook ejecutable de la siguiente fase del agente
- `propuesta-mejoras-agente.txt` — análisis técnico que motivó el plan
- `app/src/lib/chat/processChat.ts` — agente principal (prompt + lógica)
- `app/src/lib/validation.ts` — validación de respuestas del LLM antes de BD
- `app/src/lib/eval/` — suite de evals + diagnóstico AI
