# Plan de Rediseño Apple-Inspired — Nanny

> **Documento de continuidad entre sesiones.** Este archivo contiene todo lo necesario para que una nueva sesión retome el rediseño en el batch 3 sin contexto previo.

**Branch de trabajo:** `claude/continue-markdown-docs-JmrP4`
**Fecha del plan:** 2026-04-26
**Estado global:** 2 de 7 batches completados (Foundation + Auth)

---

## 1. Requerimiento original

### 1.1 Auditoría UX/UI (rol: Senior Product Designer, 12 años en SaaS / mobile / growth)

Hallazgos consolidados pantalla por pantalla:

| Pantalla | Estado actual | Problemas clave |
|---|---|---|
| **Splash (`/`)** | Icono pulsante + "Cargando…" | Sin branding, sin nombre, redirect silencioso si falla la API |
| **Login (`/login`)** | Email/password con toggle Login/Registro | Sin "olvidé contraseña", botón reset en producción, sin indicador de fuerza, toggle sutil |
| **Onboarding (`/onboarding`)** | Página muerta → redirige a `/chat` | Sin progress, sin contexto visual, si LLM falla el usuario queda atrapado, extracción invisible |
| **Chat (`/chat`)** | Chat completo, swipe-to-reply, pending detections, medication confirmations, header menu | Buffering invisible (8s), intent badges confusos, pending detection en header se ignora, "thinking dots" sin contexto, menú hamburguesa esconde features importantes (Ponte al día), sin search, medication editor inline cluttered |
| **Hoy (`/hoy`)** | Dashboard diario con header purple, FAB | Empty states planos, sin feedback al crear, time picker nativo, FAB sin safe-area, reminders amber genéricos, icons 12px |
| **Semana (`/semana`)** | Day pills + cards + detail sheet | Day labels 10px ilegibles, sin overview "de un vistazo", tasks sin fecha al final, sin FAB, toggle confuso |
| **Hijos (`/hijo`)** | Lista de cards con avatar/nombre/edad | Sin botón agregar, badges sin label, sin indicador "necesita atención", layout demasiado básico |
| **Detalle Hijo (`/hijo/[id]`)** | Header purple + tabs (Info/Agenda/Rutinas) | Agenda limitada a 5 sin "ver más", rutinas read-only, allergias rojas alarman, sin acción, back no usa `router.back()` |
| **Perfil (`/perfil`)** | Familia, padres, hijos, invitación, logout — modales fullscreen | Modales fullscreen pierden contexto, logout sin confirmación, no se puede eliminar hijo, phone sin formato, sin feedback al guardar |
| **BottomNav** | 5 tabs con badges | Labels 11px al límite, badge chat heurístico, se oculta en `/chat`, sin tap feedback |

**Patrones cross-cutting detectados:**
- No hay design system reutilizable; cada página reimplementa cards/modals/buttons
- Inconsistencia en modales (fullscreen vs bottom sheet)
- Inconsistencia en headers (purple vs white vs sticky)
- Sin skeleton loaders
- A11y: `user-scalable=no` viola WCAG, swipe sin alternativa teclado, sin ARIA labels
- Performance: `chat/page.tsx` ~1000+ líneas, polling 3s, sin virtual scrolling

### 1.2 Filosofía de rediseño solicitada — "Apple-inspired"

**Objetivo:** Cada pantalla debe transmitir simplicidad sofisticada, sensación premium y tecnológica.

**Principios:**
- Minimalismo extremo, eliminar ruido visual
- Mucho espacio en blanco
- Jerarquía visual clara
- Tipografía refinada y legible
- Consistencia absoluta entre pantallas
- Animaciones suaves y naturales
- Diseño centrado en facilidad de uso

**UI / Estilo visual:**
- Bordes redondeados elegantes
- Sombras muy sutiles
- Transparencias ligeras (glass effect) donde tenga sentido
- Colores neutros predominantes (blanco, gris, negro) con acentos modernos
- Contraste impecable
- Iconografía simple y profesional
- Componentes grandes, cómodos, modernos
- Botones sobrios y elegantes
- Inputs limpios y minimalistas

**Tipografía:**
- Estilo SF Pro / moderna sans-serif
- Tamaños bien jerarquizados, peso visual equilibrado
- Muy buena legibilidad en móvil y desktop

**UX:**
- Navegación intuitiva, cero fricción
- Feedback visual inmediato
- Transiciones fluidas, microinteracciones elegantes
- Estados vacíos bien diseñados
- Loading states modernos
- Errores claros y discretos

**Frontend:** Código limpio y modular, componentes reutilizables, consistencia total del design system.

**Importante:** No copiar interfaces exactas de Apple — capturar la **filosofía** y nivel de detalle.

---

## 2. Decisiones ya tomadas (vinculantes para los batches restantes)

| Decisión | Detalle |
|---|---|
| **Color de acento único** | `#7C3AED` (purple) — el resto es paleta neutra Apple |
| **Logo** | `/icon-192.png` con sombra morada característica (usado en splash, login, onboarding) |
| **Tipografía** | `Inter` via `next/font` como fallback web; stack SF Pro nativo en iOS |
| **Zoom** | `maximumScale: 5` (fix WCAG) |
| **Glass effect** | Aplicado en bottom nav; aplicar también en headers/sheets donde aplique |
| **Reset de testing** | Solo visible si `NODE_ENV === 'development'` |
| **Forgot password** | Real, vía `supabase.auth.resetPasswordForEmail` |
| **Granularidad de commits** | Uno por archivo, mensaje en formato `feat(area): descripción` |
| **Modales** | Estandarizar a **bottom sheet** en toda la app (deprecar fullscreen) |
| **Headers** | Definir convención: ¿purple en perfil de hijo y secciones primarias, white en el resto? Confirmar en batch 7 |

---

## 3. Estado de los 7 batches

### ✅ Batch 1 — Foundation (HECHO)

| Commit | Archivo | Detalle |
|---|---|---|
| `308d34f` | `app/src/app/globals.css` | Design system completo (526 líneas): tokens Apple, tipografía HIG, buttons, inputs, cards, list rows, glass, sheets, skeletons, animaciones |
| `6cd0136` | `app/src/app/layout.tsx` | Inter via `next/font` + zoom WCAG habilitado + safe area `pb-nav` |
| `0fcd2c5` | `app/src/components/BottomNav.tsx` | Glass tab bar + badges con ring + ARIA labels |
| `32d4809` | `app/src/app/page.tsx` (splash) | Logo Nanny + tagline + spinner + retry tras 5s |

### ✅ Batch 2 — Auth (HECHO)

| Commit | Archivo | Detalle |
|---|---|---|
| `9b6b3c2` | `app/src/app/login/page.tsx` | Segmented control, forgot password real con Supabase, indicador de fuerza, errores con icono `AlertTriangle`, reset solo en `NODE_ENV=development` |
| `bf3023a` | `app/src/app/onboarding/page.tsx` | Bienvenida con 3 features animadas + CTA al chat (mantiene chat conversacional) |

### ⏳ Batch 3 — Daily / Week (PENDIENTE)

**Archivos:**
- `app/src/app/hoy/page.tsx` — 719 líneas
- `app/src/app/semana/page.tsx` — 432 líneas

**Cambios requeridos en `hoy/page.tsx`:**
- [ ] Header neutro estilo Apple (revisar convención purple vs white)
- [ ] Empty states con ilustración simple + CTA ("Cuéntale a Nanny qué tienes hoy")
- [ ] Toast de confirmación "Evento creado ✓" tras guardar
- [ ] Reminders rediseñados como cards individuales con acción (snooze/dismiss)
- [ ] FAB con `bottom: calc(5rem + env(safe-area-inset-bottom))`
- [ ] Event icons 16-18px con labels visibles
- [ ] Bottom sheet en lugar de modal fullscreen para creación
- [ ] Skeleton loader mientras carga
- [ ] Time picker custom (no HTML5 nativo)

**Cambios requeridos en `semana/page.tsx`:**
- [ ] Day labels a 12px mínimo, formato "Lun Mar Mié…" en lugar de letras solas
- [ ] Mini-timeline debajo de cada day pill mostrando bloques de color por horas ocupadas
- [ ] Tasks sin fecha como badge en el header con acceso rápido (no relegadas al final)
- [ ] FAB consistente con `/hoy`
- [ ] Cambiar toggle a selección radio (siempre un día seleccionado)
- [ ] Skeleton loader

### ⏳ Batch 4 — Hijos (PENDIENTE)

**Archivos:**
- `app/src/app/hijo/page.tsx` — 100 líneas
- `app/src/app/hijo/[id]/page.tsx` — 289 líneas

**Cambios requeridos en `hijo/page.tsx`:**
- [ ] Botón "+" flotante o en header para agregar hijo
- [ ] Badges con label ("2 eventos", "1 medicamento") en lugar de solo iconos
- [ ] Indicador visual si el hijo tiene algo urgente (punto rojo o borde amber)
- [ ] Rediseñar cards como mini-dashboards: avatar grande + nombre + fila de stats (eventos hoy / tareas / medicamentos)
- [ ] Skeleton loader

**Cambios requeridos en `hijo/[id]/page.tsx`:**
- [ ] "Ver agenda completa →" link debajo de los 5 eventos
- [ ] Edición de rutinas (botón "+ agregar rutina")
- [ ] Allergias en badge neutral (gray) con icono de alerta solo si severa
- [ ] Botón "Editar perfil" visible en el header
- [ ] Usar `router.back()` para navegación natural
- [ ] Tabs estilo Apple (segmented control)

### ⏳ Batch 5 — Perfil (PENDIENTE)

**Archivo:** `app/src/app/perfil/page.tsx` — 457 líneas

**Cambios:**
- [ ] Cambiar todos los modales fullscreen por bottom sheets
- [ ] Confirmación de logout ("¿Seguro que quieres salir?")
- [ ] Opción de eliminar hijo con confirmación doble (irreversible)
- [ ] Formato de teléfono con máscara (o al menos validación)
- [ ] Toast de confirmación "Cambios guardados ✓"
- [ ] Secciones con estilo Apple list row (chevron, ícono left, label clean)
- [ ] Color picker rediseñado más sobrio

### ⏳ Batch 6 — Chat (PENDIENTE — RECOMENDADO EN SESIÓN PROPIA)

**Archivo:** `app/src/app/chat/page.tsx` — **1548 líneas** (mucho más grande de lo estimado)

**Recomendación operativa:** Por tamaño, este batch debería tener su propia sesión dedicada. Considerar dividirlo en:
- 6a: Refactor estructural (extraer componentes a `app/src/components/chat/*`)
- 6b: Rediseño visual y UX

**Cambios requeridos:**
- [ ] **Buffering visible**: indicador "Nanny está leyendo tus mensajes…" con timer visual en lugar de "Puedes seguir escribiendo"
- [ ] **Intent badges**: rediseñar como card separada debajo del bubble con CTA claro ("Ver en agenda →")
- [ ] **Pending detection**: mover a banner sticky prominente debajo del header con CTA grande (no card amber en header)
- [ ] **Thinking**: mostrar "Nanny está pensando…" en texto, no solo dots
- [ ] **Menú hamburguesa**: items importantes (Ponte al día) accesibles sin abrir menú — banner proactivo
- [ ] **Search** en historial de mensajes
- [ ] **Medication confirmation** en bottom sheet, no inline en el bubble
- [ ] **Refactor**: dividir en componentes (`MessageBubble`, `IntentCard`, `MedicationSheet`, `PendingBanner`, `ChatHeader`, `ChatComposer`)
- [ ] **Real-time**: evaluar Supabase Realtime en lugar de polling 3s
- [ ] **A11y**: swipe-to-reply con alternativa de teclado, ARIA en regiones interactivas

### ⏳ Batch 7 — Cross-cutting (PENDIENTE)

**Cambios:**
- [ ] Componentes UI extraídos y reutilizables: `app/src/components/ui/{Button,Input,Card,Sheet,Toast,Skeleton,EmptyState,Avatar,Badge}.tsx`
- [ ] Skeleton loaders globales aplicados a todas las páginas data-driven
- [ ] A11y: ARIA labels en regiones interactivas, focus trapping en sheets
- [ ] Animaciones de transición entre páginas (Framer Motion o CSS view transitions)
- [ ] Dark mode (tokens CSS ya preparados en globals.css — aplicar `prefers-color-scheme`)
- [ ] Convención unificada de headers (purple vs white) auditada y documentada
- [ ] Auditoría final de consistencia (modales, espaciados, tipografía)

---

## 4. Arquitectura del proyecto (recordatorio)

```
/home/user/nanny/
├── CLAUDE.md                    ← contexto del proyecto (Vercel, tech stack, decisiones)
├── NANNY.md                     ← documento de producto (no tocar para rediseño)
├── REDESIGN-PLAN.md             ← este archivo
├── app/
│   ├── src/
│   │   ├── app/                 ← Next.js App Router
│   │   │   ├── globals.css      ← ✅ design system ya rediseñado
│   │   │   ├── layout.tsx       ← ✅ Inter + zoom + safe area
│   │   │   ├── page.tsx         ← ✅ splash rediseñado
│   │   │   ├── login/           ← ✅ rediseñado
│   │   │   ├── onboarding/      ← ✅ rediseñado
│   │   │   ├── hoy/             ← ⏳ Batch 3
│   │   │   ├── semana/          ← ⏳ Batch 3
│   │   │   ├── hijo/            ← ⏳ Batch 4
│   │   │   ├── perfil/          ← ⏳ Batch 5
│   │   │   └── chat/            ← ⏳ Batch 6
│   │   ├── components/
│   │   │   ├── BottomNav.tsx    ← ✅ rediseñado
│   │   │   └── (ui/ pendiente)  ← ⏳ Batch 7
│   │   └── lib/
│   └── package.json
└── supabase/
```

**Tech stack** (de `CLAUDE.md`):
- Next.js 15 App Router + TypeScript
- Supabase (Postgres + Auth)
- OpenAI `gpt-4o-mini` para chat
- Tailwind CSS 4 (mobile-first, max 430px)
- Deploy en Vercel desde `claude/analyze-parenting-whatsapp-app-cYaTb`

> **Atención:** Vercel deploya desde `claude/analyze-parenting-whatsapp-app-cYaTb`, no desde esta branch. El rediseño solo aterriza en producción cuando se merge.

---

## 5. Cómo continuar en una nueva sesión

### Paso 1 — Posicionarse
```bash
cd /home/user/nanny
git checkout claude/continue-markdown-docs-JmrP4
git pull origin claude/continue-markdown-docs-JmrP4
git log --oneline -8   # confirmar bf3023a como HEAD
```

### Paso 2 — Leer este archivo y los foundations
Leer en orden:
1. `REDESIGN-PLAN.md` (este archivo)
2. `app/src/app/globals.css` (entender tokens y clases disponibles)
3. `app/src/app/layout.tsx` y `app/src/components/BottomNav.tsx` (entender convenciones)
4. Pantalla del batch que toca trabajar

### Paso 3 — Implementar el batch siguiente (3)
Empezar por `app/src/app/hoy/page.tsx` (la pantalla más visitada). Aplicar los cambios de la checklist del Batch 3 sección por sección. Commit por archivo con formato `feat(area): descripción`.

### Paso 4 — Validar visualmente
Para cambios UI, levantar dev server y probar en navegador (mobile viewport ≤430px). Type-check y build no son suficientes para verificar feature-correctness.

### Paso 5 — Commit y push
```bash
git add app/src/app/hoy/page.tsx
git commit -m "feat(hoy): rediseño Apple — bottom sheets, FAB safe-area, empty states con CTA"
git push origin claude/continue-markdown-docs-JmrP4
```

### Paso 6 — Actualizar este archivo
Marcar tareas completadas con `[x]` y mover el batch a la sección "Hechos" con su(s) commit(s) correspondiente(s).

---

## 6. Convenciones de implementación

- **Idioma:** español en todo el UI (la app es para padres en LatAm)
- **No agregar features nuevas** — solo rediseño de las existentes
- **No tocar** lógica de negocio en `app/src/app/api/*` ni `app/src/lib/*` salvo necesidad por refactor estructural (Batch 6)
- **Reutilizar** clases del design system en `globals.css` antes de inventar nuevas
- **Tailwind** como utility primario, custom CSS solo cuando agrega valor (glass, animaciones complejas)
- **Mobile-first:** breakpoint principal `≤430px`; tablet/desktop son secundarios
- **Iconografía:** `lucide-react` (ya instalado), pesos consistentes
- **Sin emojis** en código ni commits, salvo que el contenido del UI lo requiera (mensajes de Nanny, etc.)

---

## 7. Riesgos y consideraciones

1. **Tamaño de `chat/page.tsx`** (1548 líneas): el batch 6 va a requerir refactor real, no solo rediseño. Presupuestar tiempo para extraer componentes antes de tocar UI.
2. **Vercel deploya desde otra branch:** ningún cambio del rediseño se ve en producción hasta merge. Confirmar con el equipo cuándo y cómo se hace ese merge.
3. **Lógica de chat acoplada al UI:** el chat tiene buffering, polling, intent detection y medication flow mezclados con render. El batch 6a (refactor) es prerequisito real para 6b (visual).
4. **Dark mode (Batch 7):** los tokens CSS están listos en `globals.css` pero ninguna pantalla usa `dark:` variants. Aplicar de forma sistemática al final.
5. **A11y:** `user-scalable=no` ya está corregido en layout, pero queda pendiente revisar contraste, focus visible, ARIA.

---

## 8. Glosario de archivos del design system (Batch 1)

Disponibles en `app/src/app/globals.css` para usar en los batches restantes:

| Clase | Uso |
|---|---|
| `.btn-primary`, `.btn-secondary`, `.btn-ghost` | Botones Apple-style |
| `.input-clean` | Input minimalista con borde sutil |
| `.card-elevated`, `.card-flat` | Cards con sombra muy sutil / sin sombra |
| `.list-row` | Fila estilo iOS list (chevron, padding, divider) |
| `.glass` | Efecto glass con `backdrop-filter` |
| `.sheet`, `.sheet-handle` | Bottom sheet con handle drag |
| `.skeleton` | Skeleton loader animado |
| `.fade-in`, `.slide-up` | Animaciones de entrada |
| `.text-title-1`, `.text-title-2`, `.text-body`, `.text-caption` | Tipografía HIG |

> Si una clase necesaria falta en `globals.css`, agregarla ahí en lugar de inline styles para mantener consistencia.

---

**Última actualización:** 2026-04-26 — fin de sesión de Foundation + Auth.
**Próximo paso:** Batch 3 (Hoy + Semana).
