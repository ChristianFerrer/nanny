# Nanny MVP - Asistente Familiar Inteligente

Web app mobile-first para coordinar la crianza entre mamá y papá con ayuda de IA.

## Setup rápido (5 minutos)

### 1. Variables de entorno

```bash
cp .env.local.example .env.local
```

Edita `.env.local` con tus credenciales:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
OPENAI_API_KEY=tu-openai-key
```

### 2. Base de datos (Supabase)

1. Ve a tu proyecto en [supabase.com](https://supabase.com)
2. Abre el **SQL Editor**
3. Pega el contenido de `../supabase-schema.sql` y ejecuta
4. Esto crea todas las tablas + datos demo de una familia con 2 hijos

### 3. Instalar y correr

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu móvil o navegador.

### 4. Modo demo (sin Supabase)

La app funciona sin Supabase con datos demo en memoria. Solo necesitas la OpenAI API key para que el chat con Nanny use IA real. Sin ella, Nanny responde con respuestas mock inteligentes.

## Pantallas

| Pantalla | Ruta | Descripción |
|----------|------|-------------|
| Chat | `/chat` | Chat familiar con Nanny. Detecta eventos y tareas automáticamente |
| Hoy | `/hoy` | Agenda del día, tareas urgentes y pendientes |
| Semana | `/semana` | Vista semanal con navegación entre semanas |
| Hijos | `/hijo` | Lista de hijos con acceso a sus perfiles |
| Perfil hijo | `/hijo/[id]` | 3 pestañas: Identidad, Operativo, Rutinas |

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** (mobile-first, max 430px)
- **Supabase** (PostgreSQL + Auth + RLS)
- **OpenAI GPT-4o** (procesamiento de lenguaje natural)
- **Lucide React** (iconos)

## Estructura

```
app/src/
├── app/
│   ├── api/chat/route.ts    # API endpoint para OpenAI
│   ├── chat/page.tsx        # Chat familiar
│   ├── hoy/page.tsx         # Pantalla Hoy
│   ├── semana/page.tsx      # Vista semanal
│   ├── hijo/
│   │   ├── page.tsx         # Lista de hijos
│   │   └── [id]/page.tsx    # Perfil detallado
│   ├── layout.tsx           # Layout con nav
│   └── globals.css          # Estilos globales
├── components/
│   └── BottomNav.tsx        # Navegación inferior
└── lib/
    ├── supabase.ts          # Cliente Supabase
    ├── types.ts             # Tipos TypeScript
    ├── store.ts             # Estado + data layer
    └── demo-data.ts         # Datos demo
```
