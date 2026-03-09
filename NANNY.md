# Nanny

## Tu cuidas a tus hijos. Nanny cuida los detalles.

**Nanny** es una app con su propio chat familiar donde mama, papa y un asistente inteligente llamado Nanny conviven en un mismo espacio. Los padres hablan entre ellos de forma natural — sobre pañales, medicinas, disfraces, citas — y Nanny, que esta ahi escuchando, recuerda todo, organiza todo y avisa a tiempo.

No es un bot de WhatsApp. No es un calendario que hay que llenar. Es **una app independiente con un chat de grupo familiar** donde la inteligencia artificial es un miembro mas del grupo que trabaja en silencio para que nada se olvide.

---

## ¿Que es Nanny?

### El Problema

Los padres de niños pequeños viven ahogados en micro-detalles:

- "¿Que marca de pañales usa Mati?" → Nadie recuerda en el momento
- "El lunes hay dia de disfraces" → Se olvida hasta el domingo en la noche
- "La cita del pediatra es a las 4" → Conflicto con natacion que nadie vio
- "Le toca antibiotico cada 8 horas" → ¿Quien le dio la ultima dosis?

Estos detalles viven dispersos entre conversaciones, notas mentales y buena voluntad. Las apps de familia existentes (Cozi, FamilyWall, OurHome) no resuelven esto porque:

1. **Requieren entrada manual** — otro lugar mas que mantener actualizado
2. **Nadie las abre** — agregan friccion en vez de quitarla
3. **No entienden contexto** — son calendarios glorificados, no asistentes inteligentes

### La Solucion

Nanny es **su propia app** con un chat de grupo familiar. Mama y Papa conversan ahi naturalmente, y Nanny — el tercer miembro del grupo — hace el trabajo pesado:

1. **Escucha** las conversaciones entre mama y papa
2. **Extrae** automaticamente los detalles relevantes (fechas, medicinas, eventos, preferencias)
3. **Organiza** todo en perfiles por hijo y un calendario familiar unificado
4. **Avisa** proactivamente cuando algo necesita atencion
5. **Comparte** agendas y resumenes a WhatsApp con un tap (salida, no entrada)

### Ejemplo Real (del demo)

> **Mama**: "Mati ya casi no tiene pañales, puedes pasar a comprar?"
> **Papa**: "Si paso. Cuales eran?"
> **Nanny**: "Huggies Etapa 3" + agrega recordatorio a Papa en 20 min

Nanny no solo responde — **anticipa**. Si el lunes hay dia de disfraces y hoy es jueves, Nanny avisa el jueves (no el domingo a las 11pm). Si el sabado hay cumpleaños y tambien hay que preparar el disfraz, Nanny detecta el conflicto y propone reorganizar.

---

## ¿Que ofrece Nanny?

### Funcionalidades Core

| Funcion | Descripcion |
|---------|-------------|
| **Chat Familiar Propio** | Grupo privado dentro de la app: Mama + Papa + Nanny conversando naturalmente |
| **Memoria Familiar** | Recuerda cada detalle mencionado: alergias, tallas, marcas, preferencias, maestros |
| **Calendario Inteligente** | Extrae fechas de las conversaciones y las organiza automaticamente |
| **Recordatorios Proactivos** | Avisa con anticipacion, no en el ultimo momento |
| **Coordinacion de Padres** | Detecta conflictos de horarios y propone soluciones |
| **Seguimiento de Medicinas** | Rastrea dosis, horarios y quien es responsable |
| **Resumen Semanal** | Reporte con tareas completadas, pendientes y plan de la proxima semana |
| **Perfil por Hijo** | Ficha completa: escuela, maestra, alergias, actividades, tallas, formula |
| **Compartir a WhatsApp** | Exporta agendas y resumenes formateados para enviar por WhatsApp |

### Las 5 Pantallas

1. **Chat** — El corazon de la app. Conversacion natural entre Mama, Papa y Nanny. Mensajes color-coded (rosa mama, verde papa, morado nanny). Nanny interviene solo cuando aporta.
2. **Dashboard "Hoy"** — Agenda del dia con horarios y responsables + lista de pendientes priorizados.
3. **Vista Semanal** — Plan de 7 dias con eventos, responsables (mama/papa/ambos) y alertas destacadas.
4. **Perfil de Hijos** — Tarjeta completa por hijo: escuela, maestra, medico, alergias, actividades, tallas, medicinas activas.
5. **Notificaciones** — Alertas push para medicinas, eventos urgentes y recordatorios con acciones rapidas (marcar como hecho, posponer, editar).

### La Primera Semana (Narrativa del Demo)

El prototipo simula 7 dias de vida familiar para demostrar el valor:

| Dia | Que pasa | Que hace Nanny |
|-----|----------|----------------|
| **Lunes (Dia 1)** | Mama pide pañales, Papa no recuerda la marca | Nanny dice "Huggies Etapa 3" y pone recordatorio |
| **Miercoles (Dia 3)** | Nadie se acuerda del disfraz del lunes | Nanny avisa 4 dias antes, se planea para el sabado |
| **Viernes (Dia 5)** | Cumpleaños de Sofia + disfraz chocan el sabado AM | Nanny reorganiza: Papa compra regalo camino al cumple, Mama prepara disfraz |
| **Domingo (Dia 7)** | Fin de semana | Resumen: 12 tareas, 0 olvidos, 6 recordatorios. Plan de proxima semana |

**Resultado**: una semana donde no se olvido nada. Sin formularios, sin esfuerzo extra.

---

## ¿Como funciona tecnicamente?

### Arquitectura Conceptual

```
┌─────────────────────────────────────────────┐
│              APP NANNY (Propia)              │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │     Chat Familiar (Mama+Papa+Nanny) │    │
│  │                                     │    │
│  │  Mama: "Mati necesita pañales"      │    │
│  │  Papa: "Cuales eran?"               │    │
│  │  Nanny: "Huggies E3 🛒"            │    │
│  └──────────────┬──────────────────────┘    │
│                 │                            │
│                 ▼                            │
│  ┌─────────────────────────────────────┐    │
│  │   Motor AI (Procesamiento en Tiempo │    │
│  │              Real)                  │    │
│  │                                     │    │
│  │  • Extraccion de entidades          │    │
│  │    (fechas, productos, medicinas)   │    │
│  │  • Clasificacion de intencion       │    │
│  │  • Resolucion de contexto           │    │
│  │    ("le toca" → ¿a cual hijo?)      │    │
│  │  • Deteccion de conflictos          │    │
│  └──────────────┬──────────────────────┘    │
│                 │                            │
│                 ▼                            │
│  ┌─────────────────────────────────────┐    │
│  │      Base de Datos Familiar         │    │
│  │                                     │    │
│  │  Perfiles hijos │ Calendario        │    │
│  │  Tareas         │ Medicinas         │    │
│  │  Preferencias   │ Historial         │    │
│  └──────────────┬──────────────────────┘    │
│                 │                            │
│                 ▼                            │
│  ┌─────────────────────────────────────┐    │
│  │     Motor de Notificaciones         │    │
│  │                                     │    │
│  │  • Recordatorios proactivos         │    │
│  │  • Alertas de medicina              │    │
│  │  • Resumen semanal                  │    │
│  │  • Conflictos detectados            │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │           Interfaces                │    │
│  │                                     │    │
│  │  Chat │ Hoy │ Semana │ Hijos        │    │
│  └─────────────────────────────────────┘    │
│                                             │
└──────────────────┬──────────────────────────┘
                   │
                   ▼ (Salida opcional)
        ┌─────────────────────┐
        │  WhatsApp (Share)   │
        │  Agenda formateada  │
        │  para compartir     │
        └─────────────────────┘
```

**Punto clave**: WhatsApp es solo un canal de **salida** (compartir agendas/resumenes). Toda la conversacion, procesamiento y logica vive **dentro de la app Nanny**.

### Stack Tecnico Actual (Fase 1 — Prototipo)

| Capa | Tecnologia |
|------|-----------|
| Frontend | HTML5 + CSS3 + Vanilla JS — un solo archivo (`index.html`, ~1500 lineas) |
| Diseño | Mobile-first, iPhone frame (375x812px) |
| Idioma | Español |
| Backend | No existe (demo con datos hardcodeados y flujo scriptado) |
| Base de datos | No existe (datos simulados en arrays JS) |
| Despliegue | Archivo HTML estatico |

**El prototipo es un demo interactivo**, no una app funcional. Simula la experiencia completa con mensajes pre-scriptados y auto-avance para demostrar el valor de Nanny sin necesitar backend.

### Stack Tecnico Propuesto (Fase 2+)

| Capa | Tecnologia |
|------|-----------|
| App | React Native o Flutter (iOS + Android nativo) |
| Backend | Node.js o Python (API REST + WebSockets para chat en tiempo real) |
| AI | Claude API — analisis de mensajes, extraccion de entidades, generacion de respuestas |
| Base de datos | PostgreSQL (datos estructurados) + Vector DB (memoria conversacional) |
| Notificaciones | Firebase Cloud Messaging (FCM) / Apple Push Notifications (APNs) |
| Calendario | Sync con Google Calendar / Apple Calendar via API |
| Share | Share Extension nativa para exportar a WhatsApp |
| Auth | Phone number + OTP (sin passwords) |

### Modelo de Datos

```
Family
  ├── id, name, created_at
  │
  ├── Parents[]
  │     ├── id, name, role (mama/papa), phone
  │     └── notification_preferences
  │
  ├── Children[]
  │     ├── id, name, age, emoji
  │     ├── school, teacher, grade
  │     ├── allergies[], medical_conditions[]
  │     ├── activities[] (name, days, time)
  │     ├── preferences (diaper_brand, formula, clothing_size, shoe_size)
  │     └── medications[] (name, dose, frequency, start_date, end_date)
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
  └── Messages[]
        ├── id, sender (mama/papa/nanny), text, timestamp
        ├── extracted_entities[] (lo que Nanny entendio)
        └── actions_generated[] (lo que Nanny hizo con eso)
```

### Flujo de un Mensaje en el Chat

```
1. Mama escribe: "Le toca antibiotico a Pau a las 2"
                    │
                    ▼
2. Backend recibe el mensaje via WebSocket
                    │
                    ▼
3. Claude API analiza:
   - Entidad: medicamento (antibiotico)
   - Sujeto: Pau
   - Hora: 14:00
   - Accion implicita: crear recordatorio
                    │
                    ▼
4. Nanny responde en el chat:
   "Listo, te aviso a las 1:55pm. Quedan 3 dias de tratamiento."
                    │
                    ▼
5. Se crea:
   - Evento en calendario (14:00, antibiotico Pau)
   - Notificacion push programada (13:55)
   - Actualizacion en perfil de Pau (medicamento activo)
```

---

## ¿Cuando? — Roadmap

### Fase 1: Demo Interactivo ✅ (Completada)
**Objetivo**: Validar el concepto y la narrativa de producto.

- [x] Onboarding conversacional (Nanny pregunta, usuario responde con taps)
- [x] Simulacion de primera semana (7 dias de interaccion Mama-Papa-Nanny)
- [x] Dashboard "Hoy" con agenda y pendientes
- [x] Vista semanal con responsables
- [x] Notificaciones simuladas (medicina, compartir a WhatsApp)
- [x] Perfil de hijo con informacion completa
- [x] UI mobile-first con look & feel de app nativa

**Entregable**: Demo funcional para presentar a inversionistas y early adopters.

### Fase 2: MVP Funcional
**Objetivo**: Primera version usable con familias reales.

- [ ] Backend con API REST y WebSockets (chat en tiempo real)
- [ ] Autenticacion por numero de telefono
- [ ] Chat funcional entre padres con Nanny como participante AI
- [ ] Procesamiento de mensajes con Claude API
- [ ] Base de datos con perfiles de hijos y calendario
- [ ] Notificaciones push reales
- [ ] App nativa basica (React Native / Flutter) o PWA

**Metrica de exito**: 10 familias usando Nanny activamente durante 30 dias.

### Fase 3: Inteligencia Proactiva
**Objetivo**: Nanny que anticipa, no solo responde.

- [ ] Deteccion automatica de conflictos de horarios
- [ ] Recordatorios con anticipacion inteligente (segun tipo de evento)
- [ ] Sugerencias de coordinacion entre padres
- [ ] Resumen semanal automatico con insights
- [ ] Sincronizacion con Google Calendar / Apple Calendar
- [ ] Memoria conversacional (recordar contexto de semanas anteriores)

**Metrica de exito**: Reduccion de "se me olvido" en 80%.

### Fase 4: Escala y Monetizacion
**Objetivo**: Producto sostenible con modelo de negocio validado.

- [ ] Onboarding self-service
- [ ] Plan freemium (1 hijo gratis, premium para familias grandes)
- [ ] Partnerships con escuelas (comunicados escolares → calendario automatico)
- [ ] Ingesta opcional de WhatsApp (forwarding de mensajes al chat de Nanny)
- [ ] Multi-idioma (español, ingles, portugues)

---

## Diferenciadores

| | Apps Tradicionales | Nanny |
|---|---|---|
| **Entrada de datos** | Manual (formularios) | Natural (conversacion en chat) |
| **Donde vive** | App que nadie abre | Chat propio que es el hub familiar |
| **Inteligencia** | Calendario pasivo | Asistente que anticipa y conecta puntos |
| **Esfuerzo** | Alto (hay que mantenerlo) | Minimo (hablas como siempre, Nanny extrae) |
| **Coordinacion** | Cada padre ve lo suyo | Vista unificada familia con responsables |
| **WhatsApp** | No se integra | Exporta agendas formateadas para compartir |

---

## Resumen Ejecutivo

**Nanny** es una app con un chat familiar propio donde mama, papa y un asistente AI conversan. Los padres hablan entre ellos naturalmente y Nanny — el tercer miembro del chat — recuerda, organiza y avisa proactivamente sobre todo lo relacionado con sus hijos.

**Diferencia clave**: No es un bot dentro de WhatsApp (imposible tecnicamente y prohibido por Meta). Es su propia app con su propio chat, dashboard, calendario y perfiles. WhatsApp es solo un canal de salida para compartir agendas.

**Mercado**: Padres de niños 0-10 años que necesitan coordinar la logistica diaria de crianza.

**Estado actual**: Demo interactivo funcional (Fase 1). Siguiente paso: MVP con backend real y 10 familias piloto.
