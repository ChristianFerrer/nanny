# Nanny

## Tú cuidas a tus hijos. Nanny cuida los detalles.

**Nanny** es un asistente inteligente de familia que vive dentro del grupo de WhatsApp de los papás. Escucha, recuerda y actúa sobre todos los detalles que los padres mencionan en su conversación natural — medicinas, eventos escolares, tallas, alergias, horarios, cumpleaños — para que ningún detalle se pierda entre el caos de la crianza.

No es una app más que hay que abrir, llenar y mantener. Es un miembro silencioso del chat familiar que **entiende contexto, conecta puntos y avisa a tiempo**.

---

## ¿Qué es Nanny?

### El Problema

Los padres de niños pequeños manejan cientos de micro-detalles diarios:

- "¿Qué marca de pañales usa Mati?" → Nadie recuerda
- "El lunes hay día de disfraces" → Se olvida hasta el domingo en la noche
- "La cita del pediatra es a las 4" → Conflicto con natación que nadie vio
- "Le toca antibiótico cada 8 horas" → ¿Quién le dio la última dosis?

Estos detalles viven dispersos en conversaciones de WhatsApp, notas mentales y buena voluntad. No existe un sistema que los capture y organice **sin esfuerzo adicional**.

Las apps de familia existentes (Cozi, FamilyWall, OurHome) fallan porque:
1. **Requieren entrada manual** — otro lugar más que mantener actualizado
2. **Nadie las abre** — la familia ya vive en WhatsApp
3. **No entienden contexto** — son calendarios glorificados, no asistentes inteligentes

### La Solución

Nanny vive **donde la familia ya habla**: en el grupo de WhatsApp. No requiere que los padres cambien su comportamiento. Simplemente:

1. **Escucha** las conversaciones naturales entre mamá y papá
2. **Extrae** automáticamente detalles relevantes (fechas, medicinas, eventos, preferencias)
3. **Organiza** todo en perfiles por hijo y un calendario familiar unificado
4. **Avisa** proactivamente cuando algo necesita atención

**Ejemplo real del demo:**
> **Mamá**: "Necesito pañales para Mati"
> **Papá**: "¿Cuáles le compramos?"
> **Nanny**: "Mati usa Huggies Etapa 3. ¿Quieres que lo agregue a la lista de compras?"

Nanny no solo responde — **anticipa**. Si el lunes hay día de disfraces y hoy es jueves, Nanny avisa el jueves, no el domingo a las 11pm.

---

## ¿Qué ofrece Nanny?

### Funcionalidades Core

| Función | Descripción |
|---------|-------------|
| **Memoria Familiar** | Recuerda cada detalle mencionado: alergias, tallas, marcas, preferencias, maestros |
| **Calendario Inteligente** | Extrae fechas de conversaciones y las organiza automáticamente |
| **Recordatorios Proactivos** | Avisa con anticipación, no en el último momento |
| **Coordinación de Padres** | Detecta conflictos de horarios entre mamá y papá y propone soluciones |
| **Seguimiento de Medicinas** | Rastrea dosis, horarios y responsables |
| **Resumen Semanal** | Envía un reporte con tareas completadas, pendientes y plan de la semana |
| **Perfil por Hijo** | Ficha completa: escuela, maestra, alergias, actividades, tallas, fórmula |

### Interfaces

1. **Chat** — Conversación natural dentro del grupo de WhatsApp familiar
2. **Dashboard "Hoy"** — Vista rápida de la agenda del día y pendientes
3. **Vista Semanal** — Plan de 7 días con responsables asignados (mamá/papá/ambos)
4. **Perfil de Hijos** — Tarjeta completa con toda la información de cada niño
5. **Notificaciones Push** — Alertas para medicina, eventos urgentes y recordatorios

---

## ¿Cómo funciona técnicamente?

### Arquitectura de Integración con WhatsApp

La integración con WhatsApp usa el patrón de **reenvío iniciado por el usuario** (el mismo que usan Gether y Ohai). Nanny **no accede directamente** a los grupos de WhatsApp porque:

- La API oficial de WhatsApp **no puede unirse a grupos existentes** del usuario
- La API de Grupos solo permite crear grupos nuevos de máximo 8 personas
- Desde enero 2026, Meta **prohibió asistentes AI de propósito general** en WhatsApp
- Las APIs no oficiales (Whapi.Cloud, Unipile) violan los Terms of Service y arriesgan baneos

#### El Flujo Técnico

```
Grupo de WhatsApp de la Familia
        │
        │  (reenvío manual vía Share Sheet / Export Chat)
        ▼
Canal de Ingesta (Email dedicado / SMS / Upload en App)
        │
        ▼
Pipeline de Procesamiento (NLP + LLM)
        │
        ├── Extracción de entidades (fechas, nombres, productos, medicinas)
        ├── Clasificación de intención (evento, tarea, información, pregunta)
        ├── Resolución de referencias ("le toca" → ¿a cuál hijo?)
        └── Detección de conflictos (horarios cruzados)
        │
        ▼
Base de Datos Familiar
        │
        ├── Perfiles de hijos (alergias, tallas, escuela, actividades)
        ├── Calendario familiar (eventos con responsables)
        ├── Lista de tareas (pendientes con prioridad)
        └── Historial de medicinas (dosis, horarios, responsable)
        │
        ▼
Motor de Notificaciones
        │
        ├── Recordatorios proactivos (con anticipación configurable)
        ├── Alertas de medicina (cada X horas)
        ├── Resumen semanal (domingo noche)
        └── Conflictos detectados (en tiempo real)
        │
        ▼
Salida Multi-Canal
        ├── Push notifications (app nativa)
        ├── Mensaje formateado para compartir a WhatsApp
        └── Dashboard in-app
```

### Stack Técnico Actual (Fase 1 — Prototipo)

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML5 + CSS3 + Vanilla JS (SPA, sin frameworks) |
| Diseño | Mobile-first, iPhone frame (375×812px) |
| Idioma | Español (es) |
| Backend | No existe aún (demo con datos hardcodeados) |
| Base de datos | No existe aún |
| Despliegue | Archivo HTML estático |

### Stack Técnico Propuesto (Fase 2+)

| Capa | Tecnología |
|------|-----------|
| Frontend | React Native o Flutter (app nativa iOS/Android) |
| Backend | Node.js / Python (API REST + WebSockets) |
| AI/NLP | Claude API (extracción de entidades, clasificación, generación de respuestas) |
| Base de datos | PostgreSQL (datos estructurados) + Vector DB (memoria conversacional) |
| Ingesta | Email parsing (SendGrid Inbound Parse) + Share Extension nativa |
| Notificaciones | Firebase Cloud Messaging (FCM) / APNs |
| Calendario | iCal sync + Google Calendar API |

### Modelo de Datos Conceptual

```
Family
  ├── id, name, created_at
  │
  ├── Parents[]
  │     ├── id, name, role (mama/papa), phone, email
  │     └── notification_preferences
  │
  ├── Children[]
  │     ├── id, name, age, emoji
  │     ├── school, teacher, grade
  │     ├── allergies[], medical_conditions[]
  │     ├── activities[] (name, days, time)
  │     ├── preferences (diaper_brand, formula, clothing_size)
  │     └── medications[] (name, dose, frequency, start, end)
  │
  ├── Events[]
  │     ├── id, title, date, time, child_id
  │     ├── type (school, medical, activity, social, errand)
  │     ├── assigned_to (mama/papa/both)
  │     ├── reminder_days_before
  │     └── status (pending, done, missed)
  │
  ├── Tasks[]
  │     ├── id, description, priority, child_id
  │     ├── assigned_to, due_date
  │     └── status (pending, in_progress, done)
  │
  └── MessageLog[]
        ├── id, raw_text, source (whatsapp_forward, email, manual)
        ├── extracted_entities[]
        ├── processed_at
        └── actions_generated[]
```

---

## ¿Cuándo? — Roadmap por Fases

### Fase 1: Demo Interactivo ✅ (Completada)
**Objetivo**: Validar el concepto y la narrativa de producto.

- [x] Prototipo HTML con onboarding conversacional
- [x] Simulación de primera semana (7 días de interacción familiar)
- [x] Dashboard "Hoy" con agenda y pendientes
- [x] Vista semanal con responsables
- [x] Notificaciones simuladas (medicina, WhatsApp share)
- [x] Perfil de hijo con información completa

**Entregable**: Demo funcional para presentar a inversionistas y early adopters.

### Fase 2: MVP Funcional
**Objetivo**: Primera versión usable con familias reales.

- [ ] Backend con API REST
- [ ] Autenticación y gestión de familias
- [ ] Ingesta de mensajes por email forwarding
- [ ] Procesamiento NLP con Claude API (extracción de entidades)
- [ ] Base de datos con perfiles de hijos y calendario
- [ ] Notificaciones push reales
- [ ] App nativa básica (o PWA)

**Métrica de éxito**: 10 familias usando Nanny activamente durante 30 días.

### Fase 3: Inteligencia Proactiva
**Objetivo**: Nanny que anticipa, no solo responde.

- [ ] Detección automática de conflictos de horarios
- [ ] Recordatorios con anticipación inteligente (basada en tipo de evento)
- [ ] Sugerencias de coordinación entre padres
- [ ] Resumen semanal automático con insights
- [ ] Integración con Google Calendar / Apple Calendar
- [ ] Memoria conversacional (recordar contexto de semanas anteriores)

**Métrica de éxito**: Reducción de "se me olvidó" en 80% (medido por encuesta).

### Fase 4: Escala y Monetización
**Objetivo**: Producto sostenible con modelo de negocio validado.

- [ ] Onboarding self-service
- [ ] Plan freemium (1 hijo gratis, premium para familias grandes)
- [ ] Partnerships con escuelas (comunicados escolares → calendario automático)
- [ ] Marketplace de servicios (pediatras, actividades, tiendas de bebé)
- [ ] Multi-idioma (español, inglés, portugués)

---

## Diferenciadores Clave

| | Apps Tradicionales | Nanny |
|---|---|---|
| **Entrada de datos** | Manual (formularios) | Automática (de la conversación) |
| **Dónde vive** | App separada | En el chat de WhatsApp |
| **Tipo de inteligencia** | Calendario pasivo | Asistente proactivo |
| **Esfuerzo del usuario** | Alto (hay que mantenerlo) | Mínimo (habla como siempre) |
| **Coordinación** | Cada padre ve lo suyo | Vista unificada familia |

---

## Resumen Ejecutivo

**Nanny** es un asistente familiar inteligente que se alimenta de las conversaciones naturales de WhatsApp entre padres para organizar automáticamente la vida de sus hijos. No es una app que hay que llenar — es una inteligencia que escucha, recuerda y avisa.

**Mercado**: Padres de niños 0-10 años que usan WhatsApp como canal principal de coordinación familiar (prácticamente toda Latinoamérica y Europa).

**Modelo técnico**: Reenvío de mensajes de WhatsApp → procesamiento con IA → calendario y recordatorios inteligentes → notificaciones proactivas.

**Estado actual**: Prototipo demo funcional (Fase 1 completada). Siguiente paso: MVP con backend real y 10 familias piloto.
