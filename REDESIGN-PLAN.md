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

> **NOTA (sesión 2026-04-26):** El plan original de 7 batches se reorganizó en **14 micro-batches** (A1-A4, B1-B2, C1-C2, D1-D2, E1-E5, F1) tras detectar que `Write` de archivos completos causaba timeouts. Estrategia nueva: `Edit` quirúrgico + 1 commit por micro-batch.

### ✅ Grupo A — Hoy (HECHO)

| Micro-batch | Commit | Detalle |
|---|---|---|
| **A1** | `2e44744` | Header Apple-style large title + skeleton loader |
| **A2** | `dec4e17` | Empty states con CTA + toast confirmación |
| **A3** | `23aa552` | Reminders rediseñados como cards individuales con acciones (snooze/Listo) |
| **A4** | `a5c3520` | Bottom sheet de creación + FAB safe-area + event icons 18px |

### ✅ Grupo B — Semana (HECHO)

| Micro-batch | Commit | Detalle |
|---|---|---|
| **B1** | `57b3ab1` | Day pills 12px + formato 3-letras + radio selection + skeleton + glass header |
| **B2** | `c544615` | Mini-timeline 6 segmentos por día + FAB de creación + tasks-sin-fecha como badge |

### ✅ Grupo C — Hijos (HECHO)

| Micro-batch | Commit | Detalle |
|---|---|---|
| **C1** | `ff0e770` | Lista mini-dashboard + FAB add + skeleton + empty state + indicador urgencia |
| **C2** | `5e666d7` | Detalle: segmented tabs + ver agenda completa + allergies neutras + skeleton |

### ✅ Grupo D — Perfil (HECHO)

| Micro-batch | Commit | Detalle |
|---|---|---|
| **D1** | `ed2f611` | Bottom sheets + header Apple + list-rows + query params (?addChild, ?editChild) |
| **D2** | `47bcce5` | Confirm logout/delete + phone mask + toast saved + `deleteChild` en store |

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
