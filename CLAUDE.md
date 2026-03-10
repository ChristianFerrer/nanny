# Nanny - Contexto del Proyecto

## Deployment
- **Vercel** está configurado para deployar desde la branch `claude/analyze-parenting-whatsapp-app-cYaTb` (NO desde main)
- La production branch en Vercel YA apunta a esta branch
- NO sugerir cambiar a main ni crear branch main

## Tech Stack
- Next.js 15 (App Router) + TypeScript
- Supabase (PostgreSQL + Auth con email/password)
- OpenAI gpt-4o-mini para el chat AI
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
