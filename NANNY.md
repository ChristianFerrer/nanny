# Nanny

> **Estado de implementación (2026-04-28):** Este documento describe la visión completa del producto. El estado real de la app está en `CLAUDE.md` (sección "Estado del Agente IA") y la siguiente fase de trabajo en `PLAN-IMPLEMENTACION.md`. Funciones implementadas a hoy: chat con extracción IA, perfiles de hijos, hoy, semana, medicamentos. Funciones aún no implementadas: red de apoyo, integración email del cole, sincronización Google/Apple Calendar, insights, resumen semanal automático.

## Tu cuidas a tus hijos. Nanny cuida los detalles.

**Nanny** es una app con su propio chat familiar donde mama, papa y un asistente inteligente conviven en un mismo grupo. Los padres hablan entre ellos de forma natural — sobre medicinas, disfraces, citas, pañales — y Nanny, el tercer miembro del chat, escucha, recuerda, organiza y **actua**.

No es un bot de WhatsApp. No es un calendario que hay que llenar. Es un chat familiar con inteligencia integrada donde **la conversacion es la entrada de datos** y Nanny hace el trabajo pesado: recordar, avisar, coordinar, contactar.

---

## ¿Que es Nanny?

### El Problema: La Carga Mental

Los padres de niños pequeños cargan con una **carga mental invisible**: recordar, coordinar, anticipar y mantener todo bajo control. Cientos de micro-detalles diarios que viven dispersos entre conversaciones, notas mentales y buena voluntad:

- "¿Que marca de pañales usa Mati?" → Nadie recuerda en el momento
- "El lunes hay dia de disfraces" → Se olvida hasta el domingo en la noche
- "La cita del pediatra es a las 4" → Conflicto con natacion que nadie vio
- "Le toca antibiotico cada 8 horas" → ¿Quien le dio la ultima dosis?
- "Mañana ni tu ni yo podemos recoger a Pau" → ¿A quien le pedimos?
- "El cole mando un email sobre la reunion de padres" → Nadie lo leyo

La carga mental no es solo "tener cosas que hacer" — es el peso de ser quien **siempre esta pensando** en todo. Nanny existe para cargar ese peso.

Las apps de familia existentes (Cozi, FamilyWall, OurHome) no resuelven esto porque:

1. **Requieren entrada manual** — otro lugar mas que mantener actualizado
2. **Nadie las abre** — agregan friccion en vez de quitarla
3. **No entienden contexto** — son calendarios glorificados
4. **No actuan** — registran datos pero no hacen nada con ellos

### La Solucion: Reducir la Carga Mental

Nanny es **su propia app** con un chat familiar. Mama y Papa conversan ahi naturalmente sobre sus hijos, y Nanny — el tercer miembro del grupo — absorbe la carga mental haciendo todo lo demas:

1. **Escucha** las conversaciones entre mama y papa
2. **Recuerda** cada detalle mencionado (marcas, alergias, tallas, horarios)
3. **Organiza** todo en perfiles por hijo y un calendario familiar unificado
4. **Avisa** proactivamente con notificaciones push antes de que sea tarde
5. **Coordina** detectando conflictos de horarios y proponiendo soluciones
6. **Actua** contactando a la red de apoyo (abuela, tia, niñera) cuando los padres necesitan ayuda
7. **Integra** emails del colegio, doctor y actividades para centralizar toda la informacion

---

## ¿Como funciona? — La Primera Semana

La magia de Nanny se demuestra en los primeros 7 dias. Desde el dia 1 genera valor, y cada dia refuerza el habito.

### DIA 1 (Instalacion)

Mama instala Nanny, crea el grupo familiar, invita a Papa. Durante el onboarding conversacional, Nanny pregunta lo basico: cuantos hijos, edades, algo urgente esta semana.

Mama menciona que Pau esta con antibiotico cada 8 horas.

```
🔔 5:55pm  "💊 Antibiotico Pau en 5 min"
🔔 10:00pm "💊 Antibiotico Pau en 5 min"
```

**Mama piensa: "que bueno que me aviso."** Valor inmediato, dia 1.

### DIA 2

```
🔔 6:00am "💊 Antibiotico Pau"
🔔 2:00pm "💊 Antibiotico Pau"

🤖 Nanny en el chat:
   "¿Como sigue Pau del antibiotico? ¿Algun sintoma?"

👩 Mama: "Mejor, ya no tiene fiebre"

🤖 Nanny: "Anotado en su historial medico ✅
   Quedan 3 dias de tratamiento"
```

**Primera interaccion en el chat sin forzarla.** Nanny pregunto algo relevante, mama respondio naturalmente, y esa respuesta quedo registrada en el historial medico de Pau.

### DIA 3

Papa abre Nanny y ve que Mama escribio sobre Pau. Escribe:

```
👨 Papa: "Hay que comprar el disfraz de Pau"

🤖 Nanny: "Disfraz de animal para el lunes.
   ¿Que animal? ¿Lo compran o lo arman?"

👨 Papa: "Lo armamos, de leon"

🤖 Nanny: "🛒 Lista disfraz leon:
   - Ropa color cafe/naranja
   - Orejas (cartulina/fieltro)
   - Pintura facial
   ¿Tienen esto en casa o hay que comprar?"
```

**Nanny demostro que no es un chat — es un asistente.** No solo registro "disfraz de leon", genero una lista accionable.

### DIA 5 (Viernes)

```
🔔 "Ultimo dia de antibiotico de Pau 🎉
   Ultima toma a las 2pm.
   ¿Tiene control con el pediatra?"

👩 Mama: "Si, la semana que viene"

🤖 Nanny: "¿Que dia y hora?"

👩 Mama: "Martes 10am"

🤖 Nanny: "📅 Martes 10am — Control pediatra Pau
   ¿Quien la lleva?"
```

**La conversacion fluye naturalmente.** Nanny no fuerza formularios — hace preguntas logicas en el momento justo y arma el calendario con las respuestas.

### DIA 7 (Domingo 8pm)

```
🔔 Resumen semanal:

"Semana de Pau y Mati:
 ✅ Antibiotico completado
 ✅ Disfraz de leon (listo)

 Proxima semana:
 📅 Lunes — Disfraz de leon (cole)
 📅 Martes 10am — Control pediatra (sin asignar)
 🧷 ¿Necesitan pañales de Mati?

 [Responder en Nanny]"
```

**Resultado de la semana**: 0 olvidos, medicinas al dia, disfraz resuelto, cita agendada, proxima semana planificada. Todo desde conversaciones naturales.

---

## Vision Completa — Mas alla del Chat

Nanny empieza como chat + recordatorios, pero la vision es ser el **sistema operativo de la familia**.

### Integracion con Email (Colegio, Doctor, Actividades)

Los padres reciben decenas de emails que contienen informacion critica enterrada en parrafos largos. Nanny los procesa automaticamente.

```
📧 Nanny detecta email del cole:

🤖 Nanny en el chat:
   "El cole convoco reunion de padres jueves 5pm."

   Nanny revisa el calendario de ambos padres:
   → Papa: libre
   → Mama: junta de trabajo 4-6pm

🤖 Nanny:
   "Mama tiene junta hasta las 6.
    Papa esta libre.

    ¿Va Papa solo o Mama mueve su junta?
    [👨 Va Papa] [👩 Muevo mi junta] [👨👩 Vamos los dos]"
```

Esto aplica para:
- **Colegio**: reuniones, dias sin clase, eventos, circulares, listas de materiales
- **Pediatra/Doctor**: recordatorios de citas, resultados, vacunas pendientes
- **Actividades**: cambios de horario de natacion, piano, futbol
- **Cumpleaños**: invitaciones que llegan por email → Nanny extrae fecha, hora, lugar

### Red de Contactos de Apoyo

Cuando los padres no pueden cubrir algo, Nanny coordina con la red de apoyo familiar.

```
👩 Mama: "Mañana ni tu ni yo podemos recoger a Pau"

🤖 Nanny: "Contactos disponibles:
   👵 Abuela Carmen — ¿Le pregunto?
   👩‍🦰 Tia Laura — ¿Le pregunto?
   🧑 Niñera Maria — Cobra $200 extra

   [👵 Abuela] [👩‍🦰 Tia] [🧑 Niñera]"

👩 Mama: [👵 Abuela]

🤖 Nanny envia WhatsApp/SMS a Abuela Carmen:
   "Hola Carmen, soy Nanny el asistente de la familia.
    ¿Podrias recoger a Pau mañana del cole a las 2:30pm?
    Direccion: Colegio Montessori, Av. Reforma 123"

👵 Abuela responde: "Si claro, ahi estare"

🤖 Nanny en el chat:
   "Abuela Carmen confirmo ✅
    Recoge a Pau mañana 2:30pm.
    Le comparti la direccion del cole."
```

Nanny no solo registra — **resuelve**.

### Sincronizacion de Calendarios

Nanny se conecta con Google Calendar / Apple Calendar de ambos padres para:
- Detectar conflictos antes de que ocurran
- Saber quien esta libre para cada tarea
- Proponer asignaciones inteligentes ("Papa esta libre a las 3, ¿el lleva a natacion?")

---

## Funcionalidades Core

| Funcion | Descripcion |
|---------|-------------|
| **Chat Familiar** | Grupo privado Mama + Papa + Nanny. La conversacion ES la entrada de datos |
| **Memoria Familiar** | Recuerda cada detalle: alergias, tallas, marcas, preferencias, maestros |
| **Notificaciones Proactivas** | Avisa con anticipacion, no en el ultimo momento. Medicinas al minuto |
| **Calendario Inteligente** | Se arma solo desde las conversaciones y emails. Detecta conflictos |
| **Coordinacion de Padres** | Sabe quien esta libre, propone quien hace que |
| **Seguimiento Medico** | Medicinas, dosis, sintomas, historial, citas de control |
| **Integracion Email** | Procesa emails del cole, doctor, actividades automaticamente |
| **Red de Apoyo** | Contacta abuelos, tios, niñera cuando los padres necesitan ayuda |
| **Resumen Semanal** | Balance de la semana + plan de la siguiente |
| **Perfil por Hijo** | Ficha completa: escuela, maestra, medico, alergias, actividades, tallas |
| **Compartir a WhatsApp** | Exporta agendas y resumenes formateados con un tap |

## Pantallas y Navegacion

### Principio de Diseño

> La app debe sentirse como **"WhatsApp + asistente familiar"**, no como una app compleja de gestion.
> El chat es el centro del producto. El usuario casi nunca deberia crear eventos manualmente — Nanny los detecta desde la conversacion.

### Las Pantallas

**Tab Bar (5 tabs siempre visibles):**

1. **Chat** (💬) — El corazon. Mama + Papa + Nanny conversando
2. **Hoy** (📋) — Lo que necesitas saber al despertar
3. **Hijos** (👶) — Perfil completo: ver y editar en el mismo lugar
4. **Tareas** (✅) — Todo lo pendiente, con o sin fecha
5. **Mas** (☰) — Semana, Red de apoyo, Insights, Config

**Acceso desde header:**
- Notificaciones (🔔) — Alertas push con acciones rapidas

### Navegacion General

```
┌─────────────────────────────────────────┐
│  Familia Ferrer              🔔  👥     │
│                                          │
│         ┌──────────────┐                │
│         │  Contenido   │                │
│         │  de pantalla │                │
│         │              │                │
│         │              │                │
│         │              │                │
│         └──────────────┘                │
│                                          │
│  ┌─────┬─────┬──────┬──────┬──────┐    │
│  │ 💬  │ 📋  │  👶  │  ✅  │  ☰   │    │
│  │Chat │ Hoy │Hijos │Tareas│ Mas  │    │
│  └─────┴─────┴──────┴──────┴──────┘    │
│         Tab bar (siempre visible)       │
└─────────────────────────────────────────┘
```

**Dentro de "Mas" (☰):**
```
┌─────────────────────────────────────────┐
│  ☰ Mas                                  │
├─────────────────────────────────────────┤
│                                         │
│  📅  Semana                        >   │
│      Plan de 7 dias, conflictos        │
│                                         │
│  👥  Red de apoyo                  >   │
│      Abuela, niñera, contactos         │
│                                         │
│  📊  Insights                      >   │
│      Patrones y resumen familiar       │
│                                         │
│  ⚙️  Configuracion                 >   │
│      Familia, integraciones, cuenta    │
│                                         │
│  💬    📋     👶     ✅     ☰          │
│  Chat  Hoy   Hijos  Tareas  Mas       │
└─────────────────────────────────────────┘
```

### Flujo entre Pantallas

```
                    ┌──────────┐
                    │ ONBOARD  │ (solo primera vez)
                    │ Chat con │
                    │  Nanny   │
                    └────┬─────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                   TAB BAR                            │
│                                                      │
│   ┌────────┐    ┌────────┐    ┌────────┐            │
│   │  CHAT  │◄──►│  HOY   │◄──►│ HIJOS  │            │
│   │  (💬)  │    │  (📋)  │    │  (👶)  │            │
│   └───┬────┘    └───┬────┘    └────────┘            │
│       │             │                                │
│       │ detecta     │ tarea                          │
│       │ tarea       │ sin hora                       │
│       ▼             ▼                                │
│   ┌──────────────────────┐                          │
│   │     TAREAS (✅)       │                          │
│   │  Pendientes con y    │                          │
│   │  sin fecha           │                          │
│   └──────────────────────┘                          │
│                                                      │
│                   MENU "MAS"                         │
│   ┌────────┐  ┌────────┐  ┌────────┐  ┌──────┐    │
│   │ SEMANA │  │RED DE  │  │INSIGHTS│  │CONFIG│    │
│   │  (📅)  │  │APOYO👥 │  │  (📊)  │  │ (⚙️) │    │
│   └────────┘  └────────┘  └────────┘  └──────┘    │
│                                                      │
│   ┌──────────────────────┐                          │
│   │ NOTIFICACIONES (🔔)  │──► tap ──► Pantalla     │
│   │ Acceso desde header  │          relevante       │
│   └──────────────────────┘                          │
│                                                      │
└─────────────────────────────────────────────────────┘

Flujo clave:
  Chat → Nanny detecta info → Actualiza Hijos/Tareas/Hoy
  Push notification → tap → Pantalla relevante
  Hoy (evento sin asignar) → tap → Resolver en Chat
  Hijos (ver perfil) → tap ✏️ → Editar inline
  Semana (conflicto) → tap → Resolver en Chat
```

---

### Pantalla 1: Chat (💬)

El corazon de la app. Siempre abre aqui. Mama y papa conversan naturalmente y Nanny participa como tercer miembro inteligente.

```
┌─────────────────────────────────────────┐
│  Familia Ferrer              🔔  👥     │
├─────────────────────────────────────────┤
│                                         │
│       ┌──────────────────────────┐      │
│       │ 👩 Mama            9:15am│      │
│       │ Pau amanecio con tos    │      │
│       └──────────────────────────┘      │
│                                         │
│       ┌──────────────────────────┐      │
│       │ 🤖 Nanny           9:16am│      │
│       │ ¿Tiene fiebre? ¿Le      │      │
│       │ damos algo o esperamos?  │      │
│       └──────────────────────────┘      │
│                                         │
│       ┌──────────────────────────┐      │
│       │ 👩 Mama            9:17am│      │
│       │ No tiene fiebre, solo   │      │
│       │ tos seca                │      │
│       └──────────────────────────┘      │
│                                         │
│       ┌──────────────────────────┐      │
│       │ 🤖 Nanny           9:17am│      │
│       │ Anotado en salud de Pau │      │
│       │ ✅ Tos seca, sin fiebre  │      │
│       │                          │      │
│       │ ¿Quieres que le avise a │      │
│       │ la maestra del cole?     │      │
│       │                          │      │
│       │ [Si, avisa] [No, asi ok]│      │
│       └──────────────────────────┘      │
│                                         │
│       ┌──────────────────────────┐      │
│       │ 👨 Papa            9:30am│      │
│       │ Yo la llevo al cole hoy │      │
│       └──────────────────────────┘      │
│                                         │
│       ┌──────────────────────────┐      │
│       │ 🤖 Nanny           9:30am│      │
│       │ ✅ Papa lleva a Pau hoy  │      │
│       │ Salir antes de 7:40     │      │
│       │ para llegar a las 8:00  │      │
│       └──────────────────────────┘      │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Escribe un mensaje...     📎 ▶│    │
│  └─────────────────────────────────┘    │
│                                         │
│  💬    📋     👶     ✅     ☰          │
│  Chat  Hoy   Hijos  Tareas  Mas       │
└─────────────────────────────────────────┘
```

**Elementos clave:**
- Mensajes color-coded: rosa (mama), verde (papa), morado (nanny)
- Nanny interviene solo cuando aporta valor (no en cada mensaje)
- Botones de accion rapida inline (confirmaciones, opciones)
- Nanny confirma lo que entendio con ✅ para transparencia
- Header con nombre de familia + icono notificaciones + miembros

**Nanny NO interviene cuando:**
- Los padres hablan de temas personales no relacionados con hijos
- El mensaje es una respuesta corta sin info nueva ("ok", "jaja", "va")
- Ya confirmo la misma info recientemente
- Mensajes emocionales sin contexto accionable ("que cansado estoy", "Pau estuvo feliz hoy")

**Nanny SI interviene cuando:**
- Detecta info nueva sobre un hijo (salud, evento, necesidad)
- Hay un conflicto de horarios
- Falta una decision ("¿quien la lleva?")
- Puede anticipar un problema ("mañana no hay cole")

**Nanny registra sin intervenir cuando:**
- Mensajes emocionales con posible impacto en hijo ("Pau estuvo llorando toda la noche")
- Info contextual que no requiere accion inmediata pero enriquece el perfil

---

### Pantalla 2: Hoy (📋)

Vista rapida del dia actual. Lo que necesitas saber al despertar.

```
┌─────────────────────────────────────────┐
│  Hoy — Lunes 10 mar              🔔    │
├─────────────────────────────────────────┤
│                                         │
│  MAÑANA                                │
│  ┌─────────────────────────────────┐    │
│  │ 7:40  🚗 Llevar Pau al cole    │    │
│  │       👨 Papa                   │    │
│  │       ⚠️ Avisar maestra: tos    │    │
│  ├─────────────────────────────────┤    │
│  │ 8:00  🏫 Dia de disfraces      │    │
│  │       👧 Pau — Disfraz de leon  │    │
│  │       ✅ Listo                   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  TARDE                                  │
│  ┌─────────────────────────────────┐    │
│  │ 2:30  🏫 Recoger Pau           │    │
│  │       ❓ Sin asignar            │    │
│  │       [Yo voy] [Pedir ayuda]   │    │
│  ├─────────────────────────────────┤    │
│  │ 3:00  🏊 Natacion Pau          │    │
│  │       Club Acuatico            │    │
│  │       ❓ ¿Misma persona recoge  │    │
│  │       y lleva a natacion?       │    │
│  └─────────────────────────────────┘    │
│                                         │
│  TRATAMIENTOS ACTIVOS                   │
│  ┌─────────────────────────────────┐    │
│  │ 💊 Pau — sin tratamientos       │    │
│  │ 💊 Mati — Vitamina D 2 gotas   │    │
│  │    Proxima: 8:00pm              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  💬    📋     👶     ✅     ☰          │
│  Chat  Hoy   Hijos  Tareas  Mas       │
└─────────────────────────────────────────┘
```

**Elementos clave:**
- Bloques por franja horaria (mañana/tarde/noche)
- Cada evento muestra: hora, tipo, hijo, responsable
- Items sin asignar resaltados con ❓ y botones de accion
- Tratamientos activos del dia con proxima toma
- Tap en un evento → abre detalle (o Chat si necesita decision)
- Tap en un hijo → abre Pantalla 3 (Hijos)

**Nota:** Los pendientes sin hora ("comprar pañales") ya no aparecen aqui — estan en Tareas (Pantalla 4). Hoy solo muestra lo que tiene hora o franja del dia.

---

### Pantalla 3: Hijos (👶)

Perfil completo por hijo. **Se ve y se edita en el mismo lugar** — sin separacion artificial entre "consultar" y "administrar". Tap en ✏️ junto a cualquier campo para editarlo inline.

```
┌─────────────────────────────────────────┐
│  Hijos                             🔔   │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────┐ ┌───────────────┐   │
│  │     👧         │ │     👶         │   │
│  │    Pau         │ │    Mati       │   │
│  │   6 años       │ │   1 año       │   │
│  └───────┬────────┘ └───────────────┘   │
│          │ tap                           │
│          ▼                              │
├─────────────────────────────────────────┤
│  👧 Pau Ferrer                   6 años │
│                                         │
│  ┌──────┐┌──────┐┌──────┐┌──────┐      │
│  │ Info ││Salud ││Activ.││Histor│      │
│  └──┬───┘└──────┘└──────┘└──────┘      │
│     ▼                                   │
│  🏫 COLE                                │
│  Montessori · Miss Carmen · 1ro    ✏️  │
│  Tel cole: 55-9999-0000            ✏️  │
│                                         │
│  ⚠️ ALERGIAS                            │
│  🥜 Mani (severa)                  ✏️  │
│  [+ Agregar alergia]                   │
│                                         │
│  💊 TRATAMIENTOS ACTIVOS                │
│  Ninguno actualmente                    │
│  [+ Agregar tratamiento]               │
│                                         │
│  🏃 ACTIVIDADES                          │
│  🏊 Natacion — Mar/Jue 3pm        ✏️  │
│  🎹 Piano — Jue 5pm               ✏️  │
│  [+ Agregar actividad]                 │
│                                         │
│  🏥 MEDICO                               │
│  Dr. Rodriguez — 55-1111-2222      ✏️  │
│  Proxima cita: Mar 11, 10am            │
│                                         │
│  👟 TALLAS                               │
│  Ropa: 6 · Zapato: 19             ✏️  │
│                                         │
│  📋 PROXIMOS EVENTOS                    │
│  Lun 10 — Disfraces (leon)             │
│  Mar 11 — Pediatra 10am                │
│                                         │
│  💬    📋     👶     ✅     ☰          │
│  Chat  Hoy   Hijos  Tareas  Mas       │
└─────────────────────────────────────────┘
```

**Las 4 pestañas del perfil:**

**Info** — Datos generales, colegio, tallas, preferencias. Todo editable con ✏️.

**Salud** — Medico, alergias (permanentes), tratamientos activos (temporales). Cada dato muestra fuente y fecha de registro.

```
┌─────────────────────────────────────────┐
│  👧 Pau Ferrer > Salud                  │
├─────────────────────────────────────────┤
│                                         │
│  🏥 MEDICO HABITUAL                     │
│  Dr. Rodriguez                     ✏️  │
│  Tel: 55-1111-2222                 ✏️  │
│                                         │
│  ⚠️ ALERGIAS Y CONDICIONES (permanente) │
│  ┌─────────────────────────────────┐    │
│  │ 🥜 Alergia al mani — severa    │    │
│  │    Registrado: 8 mar (chat mama)│    │
│  │              [Editar] [Eliminar]│    │
│  └─────────────────────────────────┘    │
│  [+ Agregar alergia/condicion]          │
│                                         │
│  💊 TRATAMIENTOS ACTIVOS (temporal)     │
│  ┌─────────────────────────────────┐    │
│  │ Antibiotico cada 8hrs           │    │
│  │ Inicio: 9 mar → Fin: 14 mar    │    │
│  │ Confirmado: ✅ mama              │    │
│  │              [Editar] [Eliminar]│    │
│  └─────────────────────────────────┘    │
│  [+ Agregar tratamiento]               │
│                                         │
└─────────────────────────────────────────┘
```

**Actividades** — Rutinas vigentes con horarios y ubicacion.

```
┌─────────────────────────────────────────┐
│  👧 Pau Ferrer > Actividades            │
├─────────────────────────────────────────┤
│                                         │
│  🏊 Natacion                            │
│  Mar y Jue 3:00pm — Club Acuatico  ✏️  │
│  Vigente desde: ene 2026               │
│                                         │
│  🎹 Piano                               │
│  Jue 5:00pm — Academia Mozart      ✏️  │
│  Vigente desde: mar 2026               │
│                                         │
│  [+ Agregar actividad]                  │
│                                         │
└─────────────────────────────────────────┘
```

**Historial** — Log cronologico de todo lo que Nanny ha registrado sobre este hijo. Es el audit log (Capa 0) presentado de forma amigable.

```
┌─────────────────────────────────────────┐
│  👧 Pau Ferrer > Historial              │
├─────────────────────────────────────────┤
│                                         │
│  Hoy, 9 mar                            │
│  ┌─────────────────────────────────┐    │
│  │ 10:23  Nanny registro:          │    │
│  │ 💊 Antibiotico cada 8hrs        │    │
│  │ Fuente: chat mama               │    │
│  │ Confirmado: ✅ mama              │    │
│  │ Vigencia: hasta 14 mar          │    │
│  │           [Editar] [Eliminar]   │    │
│  ├─────────────────────────────────┤    │
│  │ 09:15  Nanny registro:          │    │
│  │ 📅 Dia de disfraces lunes       │    │
│  │ Fuente: chat papa               │    │
│  │ Confirmado: ✅ papa              │    │
│  │ Caduca: 10 mar                  │    │
│  │           [Editar] [Eliminar]   │    │
│  ├─────────────────────────────────┤    │
│  │ 08:00  Nanny registro:          │    │
│  │ 🏥 Alergia al mani              │    │
│  │ Fuente: chat mama               │    │
│  │ Confirmado: ✅ mama              │    │
│  │ Permanente                      │    │
│  │           [Editar] [Eliminar]   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Ver semana anterior]                  │
│                                         │
└─────────────────────────────────────────┘
```

Cada entrada del historial muestra:
- **Que** registro Nanny (dato + categoria)
- **Fuente** — de donde lo extrajo (chat mama, chat papa, email cole)
- **Confirmacion** — si fue confirmado y por quien
- **Vigencia** — permanente o con fecha de caducidad
- **Acciones** — editar o eliminar si Nanny entendio mal

Esto le da al padre **visibilidad total y control** sobre lo que Nanny sabe de su hijo.

**[+ Añadir hijo]** — Boton al final de la lista de hijos para agregar un nuevo hijo. Abre un flujo conversacional en el Chat donde Nanny pregunta los datos basicos.

---

### Pantalla 4: Tareas (✅)

Pantalla dedicada a todo lo pendiente. Las tareas no siempre tienen fecha u hora — "comprar pañales" es atemporal. Merecen su propio espacio separado de la agenda.

```
┌─────────────────────────────────────────┐
│  Tareas                            🔔   │
├─────────────────────────────────────────┤
│                                         │
│  URGENTE                                │
│  ┌─────────────────────────────────┐    │
│  │ □ Comprar pañales Mati          │    │
│  │   Huggies E3 — quedan ~2 dias  │    │
│  │   [🙋 Yo] [👤 Asignar]         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ESTA SEMANA                            │
│  ┌─────────────────────────────────┐    │
│  │ □ Confirmar cita pediatra Pau   │    │
│  │   Martes 10am — llamar al Dr.  │    │
│  │   👩 Mama                       │    │
│  ├─────────────────────────────────┤    │
│  │ □ Pagar excursion Pau           │    │
│  │   $350 — fecha limite viernes  │    │
│  │   ❓ Sin asignar                │    │
│  ├─────────────────────────────────┤    │
│  │ □ Llevar uniforme futbol       │    │
│  │   Para el jueves               │    │
│  │   👨 Papa                       │    │
│  └─────────────────────────────────┘    │
│                                         │
│  SIN FECHA                              │
│  ┌─────────────────────────────────┐    │
│  │ □ Buscar clases de ingles Pau   │    │
│  │ □ Actualizar cartilla vacunas  │    │
│  │   Mati                          │    │
│  └─────────────────────────────────┘    │
│                                         │
│  COMPLETADAS                            │
│  ┌─────────────────────────────────┐    │
│  │ ✔ Comprar disfraz de leon       │    │
│  │ ✔ Llevar uniforme futbol       │    │
│  │ ✔ Antibiotico Pau (7 dias)     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [+ Nueva tarea]                        │
│                                         │
│  💬    📋     👶     ✅     ☰          │
│  Chat  Hoy   Hijos  Tareas  Mas       │
└─────────────────────────────────────────┘
```

**Elementos clave:**
- Agrupadas por urgencia: Urgente > Esta semana > Sin fecha > Completadas
- Cada tarea muestra: descripcion, contexto, responsable asignado
- Tareas sin asignar tienen botones [Yo] [Asignar]
- La mayoria de tareas **vienen del chat automaticamente** (Nanny las detecta)
- Boton [+ Nueva tarea] para crear manualmente (poco comun)
- Completadas se colapsan abajo con historial

**Origen de las tareas:**
```
Chat → Nanny detecta "hay que comprar pañales"
     → Crea tarea automaticamente
     → Aparece en Tareas con contexto

Push notification → Padre marca "Ya compre"
                 → Tarea se completa

Padre crea manual → [+ Nueva tarea]
                  → Poco comun, la mayoria vienen del chat
```

---

### Pantalla 5: Notificaciones (🔔)

Centro de alertas. Acceso desde el icono 🔔 en el header (todas las pantallas). Cada notificacion tiene acciones rapidas para resolver sin abrir otra pantalla.

```
┌─────────────────────────────────────────┐
│  Notificaciones                         │
├─────────────────────────────────────────┤
│                                         │
│  AHORA                                  │
│  ┌─────────────────────────────────┐    │
│  │ 💊 Vitamina D de Mati           │    │
│  │    Son las 8pm — le toca 2 gotas│    │
│  │                                 │    │
│  │    [✅ Ya se la di] [⏰ En 30min]│    │
│  └─────────────────────────────────┘    │
│                                         │
│  HOY                                    │
│  ┌─────────────────────────────────┐    │
│  │ ❓ ¿Quien recoge a Pau a las    │    │
│  │    2:30? Sin asignar            │    │
│  │                                 │    │
│  │    [🙋 Yo voy] [👥 Pedir ayuda] │    │
│  ├─────────────────────────────────┤    │
│  │ ⚠️ Conflicto detectado           │    │
│  │    Jue: reunion cole 5pm        │    │
│  │    vs piano Pau 5pm             │    │
│  │                                 │    │
│  │    [💬 Resolver en chat]        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ESTA SEMANA                            │
│  ┌─────────────────────────────────┐    │
│  │ 📅 Recordatorio: cita pediatra  │    │
│  │    Pau — martes 10am            │    │
│  │    ❓ Sin asignar — ¿quien va?  │    │
│  │                                 │    │
│  │    [🙋 Yo] [👤 Papa] [💬 Chat]  │    │
│  ├─────────────────────────────────┤    │
│  │ 📧 Email del cole procesado     │    │
│  │    Junta padres jueves 5pm      │    │
│  │    Agregado al calendario ✅     │    │
│  │                                 │    │
│  │    [👀 Ver detalle]             │    │
│  └─────────────────────────────────┘    │
│                                         │
│  RESUELTAS                              │
│  ┌─────────────────────────────────┐    │
│  │ ✅ Disfraz de leon — listo       │    │
│  │ ✅ Antibiotico Pau — completado  │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

**Elementos clave:**
- Agrupadas por urgencia: Ahora > Hoy > Esta semana > Resueltas
- Cada notificacion tiene **botones de accion rapida** (resolver sin cambiar de pantalla)
- Tipos de notificacion:
  - 💊 Medicinas/tratamientos (accion: confirmar toma)
  - ❓ Decisiones pendientes (accion: asignarse o delegar)
  - ⚠️ Conflictos (accion: ir al chat a resolver)
  - 📅 Recordatorios (accion: confirmar o posponer)
  - 🛒 Compras/necesidades (accion: marcar hecho)
  - 📧 Emails procesados (accion: ver detalle)
- Notificaciones resueltas se colapsan abajo
- Badge con contador en el icono 🔔 del header

**Las 5 notificaciones que generan engagement:**

Estas son las notificaciones proactivas que Nanny envia para crear habito y reducir carga mental:

| # | Tipo | Ejemplo | Efecto |
|---|------|---------|--------|
| 1 | **Agenda del dia** (7:30 AM) | "Hoy: Pau → futbol 17:00, Mati → guarderia" | Crea habito diario |
| 2 | **Pregunta logistica** | "¿Quien recoge hoy a Pau?" | Dispara conversacion |
| 3 | **Recordatorio contextual** | "Disfraz de Pau para el lunes. ¿Ya lo tienen?" | Previene olvidos |
| 4 | **Conflicto de agenda** | "Mama tiene reunion 4-6pm. Futbol de Pau es a las 5. Papa esta libre. ¿Papa lo lleva?" | Resuelve problemas antes de que sean crisis |
| 5 | **Resumen semanal** (Dom 8pm) | "Eventos completados, proximos, tareas pendientes" | Cierra el ciclo de organizacion |

La agenda del dia y el resumen semanal son automaticos. Las otras 3 se disparan segun contexto detectado en el chat o en los eventos proximos.

**Flujo de push notification (app cerrada):**
```
Push llega al telefono
        │
        ▼
"💊 Vitamina D de Mati — 2 gotas"
        │
        ├── Tap en accion rapida ──► Marca hecho sin abrir app
        │
        └── Tap en notificacion ──► Abre Nanny en la
                                    pantalla relevante
                                    (Chat si necesita
                                    decision, Hoy si es
                                    un evento)
```

---

### Pantalla 6: Semana (📅) — dentro de "Mas"

Plan de 7 dias con vista de pajaro. Para anticipar y coordinar. Accesible desde el menu "Mas".

```
┌─────────────────────────────────────────┐
│  ← Semana 10–16 mar              🔔    │
├─────────────────────────────────────────┤
│                                         │
│  LUN 10                                │
│  ┌─────────────────────────────────┐    │
│  │ 🏫 Disfraces (Pau)    👨 Papa   │    │
│  │ 🏊 Natacion 3pm       —        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  MAR 11                                │
│  ┌─────────────────────────────────┐    │
│  │ 🏥 Pediatra 10am (Pau) ❓       │    │
│  │ 🏊 Natacion 3pm                │    │
│  │ ⚠️ Conflicto: pediatra + cole   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  MIE 12                                │
│  ┌─────────────────────────────────┐    │
│  │ Sin eventos agendados           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  JUE 13                                │
│  ┌─────────────────────────────────┐    │
│  │ 🏫 Reunion padres 5pm  ❓       │    │
│  │ 🏊 Natacion 3pm                │    │
│  │ 🎹 Piano 5pm                   │    │
│  │ ⚠️ Conflicto: reunion + piano   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  VIE 14 · SAB 15 · DOM 16             │
│  ┌─────────────────────────────────┐    │
│  │ Sin eventos agendados           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  RESUMEN SEMANA                         │
│  ┌─────────────────────────────────┐    │
│  │ 📊 8 eventos | 2 conflictos    │    │
│  │ ❓ 2 sin asignar                │    │
│  │ ✅ 4 tareas pendientes          │    │
│  └─────────────────────────────────┘    │
│                                         │
│  💬    📋     👶     ✅     ☰          │
│  Chat  Hoy   Hijos  Tareas  Mas       │
└─────────────────────────────────────────┘
```

**Elementos clave:**
- Un bloque por dia con eventos compactos
- Iconos de tipo (escuela, medico, actividad)
- Responsable asignado o ❓ si falta
- ⚠️ Conflictos detectados automaticamente
- Resumen inferior con contadores clave
- Tap en dia → expande detalle tipo "Hoy"
- Tap en conflicto → abre Chat con sugerencia de Nanny
- Swipe izquierda/derecha para cambiar semana

---

### Pantalla 7: Red de Apoyo (👥) — dentro de "Mas"

Las personas fuera del nucleo familiar que ayudan con los hijos. Nanny puede coordinar activamente con ellos — no es solo una libreta de contactos, es funcionalidad.

```
┌─────────────────────────────────────────┐
│  ← Red de Apoyo                   🔔   │
├─────────────────────────────────────────┤
│                                         │
│  FAVORITOS                              │
│  ┌─────────────────────────────────┐    │
│  │ 👵 Abuela Carmen               │    │
│  │    📱 55-2222-3333              │    │
│  │    Disponible: tardes           │    │
│  │    Contacto: WhatsApp           │    │
│  │    Ultima vez: recogio Pau      │    │
│  │    el viernes 7 mar             │    │
│  ├─────────────────────────────────┤    │
│  │ 👩 Maria (niñera)              │    │
│  │    📱 55-4444-5555              │    │
│  │    Disponible: con aviso 24hrs  │    │
│  │    Costo: $150/hora             │    │
│  │    Contacto: WhatsApp           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  OTROS CONTACTOS                        │
│  ┌─────────────────────────────────┐    │
│  │ 👩 Tia Laura                    │    │
│  │    Disponible: fines de semana  │    │
│  ├─────────────────────────────────┤    │
│  │ 👨 Vecina Rocio                 │    │
│  │    Disponible: emergencias      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  EMERGENCIA (orden de prioridad)        │
│  ┌─────────────────────────────────┐    │
│  │ 1. Abuela Carmen  📞           │    │
│  │ 2. Tia Laura      📞           │    │
│  │ 3. Maria          📞           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [+ Añadir contacto]                   │
│                                         │
│  💬    📋     👶     ✅     ☰          │
│  Chat  Hoy   Hijos  Tareas  Mas       │
└─────────────────────────────────────────┘
```

**Elementos clave:**
- No es solo una libreta — cada contacto tiene disponibilidad y metodo preferido
- Costo por hora para niñeras/cuidadores
- Historial de ultima vez que ayudaron
- Lista de emergencia con orden de prioridad
- Nanny puede sugerir: "Nadie puede recoger a Pau — ¿le aviso a la abuela?"

**Como usa Nanny la red de apoyo:**
```
Nanny en el chat:
"Nadie esta asignado para recoger a Pau a las 2:30.
Abuela Carmen esta disponible por las tardes.
¿Quieren que le mande un WhatsApp para preguntar?"

[Si, preguntale] [No, yo resuelvo]
```

---

### Pantalla 8: Insights (📊) — dentro de "Mas"

Datos utiles para la **familia** + metricas internas para el equipo. Los padres ven patrones de su organizacion familiar, no numeros tecnicos.

```
┌─────────────────────────────────────────┐
│  ← Insights                       🔔   │
├─────────────────────────────────────────┤
│                                         │
│  ESTA SEMANA                            │
│  ┌─────────────────────────────────┐    │
│  │ 👧 Pau                          │    │
│  │ 3 actividades · 1 cita medica  │    │
│  │ Antibiotico completado ✅       │    │
│  ├─────────────────────────────────┤    │
│  │ 👶 Mati                         │    │
│  │ Pañales: quedan ~2 dias        │    │
│  │ Vitamina D: al dia ✅           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ORGANIZACION FAMILIAR                  │
│  ┌─────────────────────────────────┐    │
│  │ ✅ 7 tareas completadas         │    │
│  │ ❓ 2 sin resolver               │    │
│  │ 📅 0 eventos olvidados         │    │
│  │ ⚠️ 1 conflicto pendiente        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  PARTICIPACION                          │
│  ┌─────────────────────────────────┐    │
│  │ 👩 Mama: 12 tareas resueltas    │    │
│  │ 👨 Papa: 8 tareas resueltas     │    │
│  │ 👵 Abuela: ayudo 2 veces       │    │
│  └─────────────────────────────────┘    │
│                                         │
│  RESUMEN SEMANAL                        │
│  ┌─────────────────────────────────┐    │
│  │ "Semana de Pau y Mati:          │    │
│  │  ✅ Antibiotico completado       │    │
│  │  ✅ Disfraz de leon listo        │    │
│  │                                 │    │
│  │  Proxima semana:                │    │
│  │  📅 Lun — Disfraz cole          │    │
│  │  📅 Mar 10am — Pediatra Pau    │    │
│  │  🛒 Comprar pañales Mati"      │    │
│  │                                 │    │
│  │  [📤 Compartir a WhatsApp]      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  💬    📋     👶     ✅     ☰          │
│  Chat  Hoy   Hijos  Tareas  Mas       │
└─────────────────────────────────────────┘
```

**Elementos clave para padres:**
- Resumen por hijo: que paso esta semana, que viene
- Organizacion: tareas completadas, olvidadas, pendientes
- Participacion: quien hizo que (sin ser competitivo — es visibilidad)
- Resumen semanal con boton de compartir a WhatsApp
- Se genera automaticamente los domingos 8pm

---

### Pantalla 9: Configuracion (⚙️) — dentro de "Mas"

Ajustes de la cuenta familiar. Lo que antes era "Admin" pero sin los perfiles de hijos (que ahora viven en Pantalla 3).

```
┌─────────────────────────────────────────┐
│  ← Configuracion                  🔔   │
├─────────────────────────────────────────┤
│                                         │
│  FAMILIA                                │
│  ┌─────────────────────────────────┐    │
│  │ 👩 Mama: Ana Ferrer             │    │
│  │    📱 55-1234-5678          ✏️  │    │
│  │    📧 ana@email.com         ✏️  │    │
│  ├─────────────────────────────────┤    │
│  │ 👨 Papa: Carlos Ferrer          │    │
│  │    📱 55-8765-4321          ✏️  │    │
│  │    📧 carlos@email.com      ✏️  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  INTEGRACIONES                          │
│  ┌─────────────────────────────────┐    │
│  │ 📅 Google Calendar      🟢 On  │    │
│  │ 📅 Apple Calendar       🟢 On  │    │
│  │ 📧 Email cole           🟢 On  │    │
│  │ [+ Conectar servicio]          │    │
│  └─────────────────────────────────┘    │
│                                         │
│  NOTIFICACIONES                         │
│  ┌─────────────────────────────────┐    │
│  │ Horario activo: 7am - 10pm     │    │
│  │ Frecuencia: Normal             │    │
│  │ Medicinas: Siempre alertar     │    │
│  └─────────────────────────────────┘    │
│                                         │
│  CUENTA                                 │
│  ┌─────────────────────────────────┐    │
│  │ Zona horaria: CDMX (GMT-6)    │    │
│  │ Plan: Familiar                  │    │
│  │ Cerrar sesion                   │    │
│  └─────────────────────────────────┘    │
│                                         │
│  💬    📋     👶     ✅     ☰          │
│  Chat  Hoy   Hijos  Tareas  Mas       │
└─────────────────────────────────────────┘
```

---

### Metricas Internas (📊) — Solo Equipo, Fase 2

Panel interno para el equipo de producto durante la Fase 2 (10 familias piloto). **No es visible para los padres** — es para medir si el MVP funciona antes de escalar. Se accede desde un menu oculto o panel web separado.

```
┌─────────────────────────────────────────┐
│  📊 Metricas MVP — Fase 2              │
│  Periodo: 1-31 mar 2026                │
├─────────────────────────────────────────┤
│                                         │
│  ADOPCION                               │
│  ┌────────┐ ┌────────┐ ┌────────┐      │
│  │ 8/10   │ │  23    │ │ 18     │      │
│  │familias│ │ dias   │ │msgs/dia│      │
│  │activas │ │promedio│ │promedio│      │
│  │30 dias │ │retencion│ │x familia│     │
│  └────────┘ └────────┘ └────────┘      │
│                                         │
│  ENGAGEMENT                             │
│  ┌─────────────────────────────────┐    │
│  │ ¿Como abren la app?             │    │
│  │ ██████████░░ 68% por push       │    │
│  │ ████░░░░░░░░ 32% por iniciativa │    │
│  │                                 │    │
│  │ Dias consecutivos activos:      │    │
│  │ ████████████████░░ avg 12 dias  │    │
│  │                                 │    │
│  │ Mensajes mama vs papa:          │    │
│  │ ████████████░░░░ 62% mama       │    │
│  │ ██████░░░░░░░░░░ 38% papa      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  CALIDAD IA                             │
│  ┌─────────────────────────────────┐    │
│  │ Extracciones correctas: 94%     │    │
│  │ Confirmaciones aceptadas: 89%   │    │
│  │ Correcciones manuales: 12       │    │
│  │ Falsos positivos: 3             │    │
│  │ Datos eliminados por padres: 2  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  COSTO                                  │
│  ┌─────────────────────────────────┐    │
│  │ Tokens totales: 45.2M           │    │
│  │ Costo Claude API: $38.50        │    │
│  │ Costo por familia: $3.85        │    │
│  │ Costo por mensaje: $0.021       │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

#### Metricas que se trackean

**Adopcion (¿usan Nanny o regresan a WhatsApp?)**

| Metrica | Que mide | Meta Fase 2 |
|---------|----------|-------------|
| Familias activas 30 dias | Retencion bruta | 8 de 10 |
| Mensajes por dia por familia | Volumen de uso | >10 msgs/dia |
| Dias consecutivos activos | Frecuencia de habito | >20 dias |
| Apertura por push vs iniciativa | Dependencia de notificaciones | <60% push |

**Efectividad del core (¿Nanny detecta automaticamente o los padres hacen el trabajo?)**

| Metrica | Que mide | Meta Fase 2 |
|---------|----------|-------------|
| Eventos detectados auto / total eventos | Deteccion automatica de eventos | >80% automaticos |
| Tareas detectadas auto / total tareas | Deteccion automatica de tareas | >80% automaticas |
| Intervenciones utiles / total intervenciones | Calidad de las intervenciones de Nanny (medido con 👍👎) | >80% utiles |
| Recordatorios con accion / total recordatorios | Efectividad de notificaciones proactivas | >60% generan accion |

Si la mayoria de eventos y tareas se crean manualmente, el core del producto falla. Si las intervenciones de Nanny no son utiles, se convierte en ruido.

**Engagement (¿que tan profundo es el uso?)**

| Metrica | Que mide | Meta Fase 2 |
|---------|----------|-------------|
| % mensajes mama vs papa | Balance de participacion | Ambos >30% |
| Mensajes accionables vs ruido | Calidad del chat | >50% accionables |
| Interacciones con respuestas de Nanny | Engagement con la IA | >70% responden |
| Ediciones manuales en perfil hijo | Confianza en el sistema | <15% correcciones |
| Tiempo en app por sesion | Sesiones con proposito | 2-5 min promedio |

**Calidad de la IA (¿Nanny entiende bien?)**

| Metrica | Que mide | Meta Fase 2 |
|---------|----------|-------------|
| Extracciones correctas | Precision de entidades | >90% |
| Confirmaciones aceptadas | Nanny entendio bien | >85% |
| Correcciones manuales en perfil | Errores que el padre corrige | <20/mes total |
| Datos eliminados por padres | Nanny registro algo incorrecto | <5/mes total |
| Tiempo de respuesta de Claude | Latencia percibida | <3 seg |

**Costo (¿es sostenible?)**

| Metrica | Que mide | Meta Fase 2 |
|---------|----------|-------------|
| Costo por familia/mes | Sostenibilidad | <$5 USD |
| Costo por mensaje procesado | Eficiencia | <$0.03 USD |
| Tokens input vs output | Ratio de eficiencia | <10:1 |
| % mensajes que requieren LLM | Efectividad del filtro | <60% |

#### Señales para pivotar

```
🔴 ALERTA ROJA (pivotar o cambiar enfoque):
   • <5 familias activas despues de 2 semanas
   • <5 mensajes/dia promedio por familia
   • Padres reportan que prefieren WhatsApp

🟡 ALERTA AMARILLA (ajustar):
   • >80% aperturas solo por push (no hay habito)
   • >25% correcciones manuales (IA no es confiable)
   • Solo mama usa la app (papa no participa)

🟢 SEÑAL VERDE (escalar a Fase 3):
   • 8+ familias activas 30 dias
   • >10 msgs/dia y ambos padres participan
   • <15% correcciones y >85% confirmaciones aceptadas
```

#### Captura de Feedback Cualitativo

Las metricas cuantitativas miden el **que**. El feedback cualitativo explica el **por que**. Con 10 familias piloto, lo cualitativo es mas valioso que los numeros.

Principio: **el feedback debe ser tan natural como el chat.** Los padres no van a llenar encuestas. Nanny ya es un chat — usemos eso.

##### 1. Feedback Implicito (sin friccion, automatico)

Lo que los padres ya hacen nos dice todo:

| Señal | Interpretacion |
|---|---|
| Padre corrige un evento creado por Nanny | Nanny entendio mal |
| Padre elimina un dato del perfil | Nanny registro algo incorrecto |
| Padre ignora una pregunta de Nanny | La pregunta no era relevante o molesto |
| Padre responde "no" a una confirmacion | Extraccion incorrecta |
| Padre no abre el resumen semanal | El resumen no aporta valor |
| Padre desactiva notificaciones | Las notificaciones molestan |

Trackear especificamente: preguntas ignoradas por los padres y desactivaciones de notificaciones. El resto ya se cubre con las metricas de calidad de IA.

##### 2. Micro-feedback Contextual (1 tap, en el momento)

Despues de que Nanny resuelve algo concreto, preguntar **una sola cosa**:

```
✅ Pediatra Pau martes 10am — confirmado

¿Te sirvio este recordatorio?
[👍]  [👎]
```

Reglas:
- Solo despues de acciones completadas, nunca a mitad de flujo
- Maximo **1 micro-feedback al dia** — no mas
- Si el padre da 👎, Nanny pregunta opcionalmente: "¿Que puedo mejorar?" (respuesta libre en el chat)
- Si el padre ignora, no insistir

##### 3. Check-in Semanal (dentro del resumen)

El resumen semanal del domingo ya existe. Agregar **una pregunta al final**:

```
Resumen de la semana:
✅ 8 eventos gestionados
✅ 3 recordatorios utiles
⏳ 1 tarea pendiente: comprar pañales

¿Como fue la semana con Nanny?
[😊 Bien]  [😐 Regular]  [😕 Mal]
```

Si responden Regular o Mal, Nanny abre conversacion: "¿Que puedo hacer mejor la proxima semana?"

##### 4. Feedback Directo del Equipo (fuera de la app)

Con 10 familias piloto, complementar con:
- **1 llamada de 15 min** por familia en la semana 2 y la semana 4
- **Grupo de WhatsApp con las 10 familias** para feedback informal rapido

##### Lo que NO hacer

- **No NPS.** Con 10 familias hablas directamente con ellas, no necesitas escalas del 1 al 10
- **No encuestas in-app.** Agregan friccion y nadie las completa
- **No pop-ups de rating.** Es una app de padres estresados, no un juego movil
- **No canal de feedback separado.** Si tienen que salir de Nanny para dar feedback, no lo daran

##### Resumen de mecanismos de feedback

| Mecanismo | Friccion | Frecuencia | Que captura |
|---|---|---|---|
| Feedback implicito | Cero | Continuo | Errores, relevancia, engagement |
| Micro-feedback 👍👎 | 1 tap | Max 1/dia | Satisfaccion puntual |
| Check-in semanal | 1 tap + texto opcional | 1/semana | Sentimiento general |
| Llamadas directas | Alta (pero valiosa) | 2 en 4 semanas | Insights profundos |

---

## Arquitectura Tecnica

### Diagrama General

```
┌──────────────────────────────────────────────────────────┐
│                     APP NANNY                            │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │          Chat Familiar (Mama + Papa + Nanny)       │  │
│  │                                                    │  │
│  │  👩 Mama: "Mañana no puedo recoger a Pau"          │  │
│  │  👨 Papa: "Yo tampoco, tengo junta"                │  │
│  │  🤖 Nanny: "¿Le pregunto a Abuela Carmen?"        │  │
│  └───────────────────┬────────────────────────────────┘  │
│                      │                                   │
│                      ▼                                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Motor AI (Claude API)                 │  │
│  │                                                    │  │
│  │  • Comprension de mensajes en lenguaje natural     │  │
│  │  • Extraccion de entidades (fechas, medicinas...)  │  │
│  │  • Resolucion de contexto ("le toca" → ¿a quien?) │  │
│  │  • Deteccion de conflictos de horarios             │  │
│  │  • Generacion de respuestas y sugerencias          │  │
│  │  • Procesamiento de emails entrantes               │  │
│  └───────────────────┬────────────────────────────────┘  │
│                      │                                   │
│                      ▼                                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │            Base de Datos Familiar                  │  │
│  │                                                    │  │
│  │  Perfiles hijos │ Calendario   │ Medicinas         │  │
│  │  Red de apoyo   │ Tareas       │ Historial medico  │  │
│  │  Preferencias   │ Integraciones │ Mensajes         │  │
│  └───────────────────┬────────────────────────────────┘  │
│                      │                                   │
│                      ▼                                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │         Motor de Notificaciones y Acciones         │  │
│  │                                                    │  │
│  │  • Push notifications (medicinas, recordatorios)   │  │
│  │  • Resumen semanal automatico                      │  │
│  │  • Contactar red de apoyo (WhatsApp/SMS)           │  │
│  │  • Alertas de conflictos detectados                │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Pantallas                             │  │
│  │  Chat│Hoy│Hijos│Tareas│Mas(Semana,Red,Insights,Config)│
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────┬────────────────────┬───────────────────┘
                  │                    │
    ┌─────────────▼──────┐   ┌────────▼─────────────┐
    │  Entradas Externas │   │  Salidas Externas     │
    │                    │   │                       │
    │  📧 Email cole     │   │  📤 WhatsApp share    │
    │  📧 Email doctor   │   │  📱 SMS a red apoyo   │
    │  📧 Email activs.  │   │  📅 Sync calendarios  │
    │  📅 Google Cal     │   │                       │
    │  📅 Apple Cal      │   │                       │
    └────────────────────┘   └───────────────────────┘
```

### Flujo de un Mensaje

```
1. Papa escribe: "Hay que comprar el disfraz de Pau"
                    │
                    ▼
2. Backend recibe via WebSocket
                    │
                    ▼
3. Claude API analiza:
   → Entidad: compra (disfraz)
   → Sujeto: Pau
   → Contexto: evento escolar lunes (ya registrado)
   → Accion: pedir detalles, generar lista
                    │
                    ▼
4. Nanny responde en el chat:
   "Disfraz de animal para el lunes.
    ¿Que animal? ¿Lo compran o lo arman?"
                    │
                    ▼
5. Papa responde: "Lo armamos, de leon"
                    │
                    ▼
6. Nanny genera lista accionable:
   "🛒 Lista disfraz leon:
    - Ropa color cafe/naranja
    - Orejas (cartulina/fieltro)
    - Pintura facial
    ¿Tienen esto en casa o hay que comprar?"
                    │
                    ▼
7. Se actualiza:
   → Tarea: "Disfraz leon Pau" (status: en progreso)
   → Evento lunes: "Disfraz de leon al cole"
   → Recordatorio sabado: "Preparar disfraz"
```

### Flujo de Email Externo

```
1. Email del cole llega a la bandeja conectada:
   "Estimados padres, los convocamos a reunion
    el jueves 13 de marzo a las 5pm..."
                    │
                    ▼
2. Nanny procesa con Claude API:
   → Tipo: reunion escolar
   → Fecha: jueves 13 marzo, 5pm
   → Requiere: asistencia de al menos un padre
                    │
                    ▼
3. Nanny revisa calendarios conectados:
   → Papa jueves 5pm: libre ✅
   → Mama jueves 5pm: junta de trabajo 4-6pm ❌
                    │
                    ▼
4. Nanny publica en el chat con opciones:
   "El cole convoco reunion jueves 5pm.
    Mama tiene junta hasta las 6. Papa esta libre.
    [👨 Va Papa] [👩 Muevo junta] [👨👩 Vamos los dos]"
```

### Flujo de Red de Apoyo

```
1. Mama escribe: "Mañana no puedo recoger a Pau"
   Papa escribe: "Yo tampoco"
                    │
                    ▼
2. Nanny identifica: necesidad de cobertura
   Consulta red de apoyo registrada
                    │
                    ▼
3. Nanny ofrece opciones en el chat:
   "👵 Abuela Carmen
    👩‍🦰 Tia Laura
    🧑 Niñera Maria ($200 extra)"
                    │
                    ▼
4. Mama elige: Abuela Carmen
                    │
                    ▼
5. Nanny envia WhatsApp/SMS automatico:
   "Hola Carmen, ¿podrias recoger a Pau
    mañana a las 2:30pm del cole?"
                    │
                    ▼
6. Abuela responde: "Si"
                    │
                    ▼
7. Nanny confirma en el chat:
   "Abuela Carmen confirmo ✅
    Recoge a Pau mañana 2:30pm"
   → Actualiza calendario
   → Cancela recordatorio de recogida a padres
```

### Arquitectura de Memoria

El sistema de memoria de Nanny se organiza en 4 capas jerarquicas. La regla fundamental: **la fuente de verdad siempre es el estado estructurado (Capa 3), nunca un resumen generado por IA ni el chat reciente**.

```
┌─────────────────────────────────────────────────────────────┐
│                  ARQUITECTURA DE MEMORIA                     │
│                                                              │
│  CAPA 3 ─ ESTADO ESTRUCTURADO CANÓNICO (fuente de verdad)  │
│  ┌────────────────────────┬────────────────────────────┐    │
│  │  3A: IDENTIDAD ESTABLE │  3B: ESTADO OPERATIVO      │    │
│  │                        │                            │    │
│  │  • hijos (nombre,edad) │  • tratamientos activos    │    │
│  │  • alergias            │  • eventos proximos        │    │
│  │  • condiciones medicas │  • tareas pendientes       │    │
│  │  • colegios/maestros   │  • asignaciones temporales │    │
│  │  • medicos habituales  │  • decisiones pendientes   │    │
│  │  • contactos emergencia│  • recordatorios activos   │    │
│  │  • preferencias fijas  │  • rutinas vigentes        │    │
│  │                        │                            │    │
│  │  Duracion: meses/años  │  Duracion: dias/semanas    │    │
│  └────────────────────────┴────────────────────────────┘    │
│                                                              │
│  CAPA 2 ─ MEMORIA RESUMIDA (derivada, NO fuente de verdad) │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  • Resumen diario ("Ayer Lucia tuvo fiebre...")     │    │
│  │  • Resumen semanal (para contexto del modelo)       │    │
│  │  • Actualizaciones notables                         │    │
│  │                                                     │    │
│  │  Uso: continuidad narrativa + contexto para Claude  │    │
│  │  NO reemplaza tablas estructuradas                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  CAPA 1 ─ CONTEXTO CONVERSACIONAL (ventana corta)           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  • Ultimos 10-20 mensajes RELEVANTES (no fijos)     │    │
│  │  • Filtrados por relevancia antes de enviar a Claude │    │
│  │  • Pre-clasificacion: irrelevante vs accionable     │    │
│  │                                                     │    │
│  │  NO se envian los ultimos 50 mensajes completos     │    │
│  │  Se filtran bromas, mensajes irrelevantes           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  CAPA 0 ─ LOG COMPLETO (auditoria y debugging)              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  • Todos los mensajes crudos (raw_messages)         │    │
│  │  • sender, timestamp, detected_intent               │    │
│  │  • extracted_entities, confidence_score              │    │
│  │  • action_taken, confirmation_status                 │    │
│  │                                                     │    │
│  │  Uso: debugging, auditoria, mejorar prompts         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### Principios Clave

1. **Capa 3 = verdad canonica.** Si hay conflicto entre lo que dice un resumen (Capa 2) y lo que esta en la tabla estructurada (Capa 3), gana la tabla.

2. **Separar identidad de estado operativo.** No es lo mismo "Marco es alergico al mani" (identidad estable, dura años) que "Papa recoge los martes" (asignacion temporal, puede cambiar mañana). Capa 3A vs 3B.

3. **Medicinas NO son identidad.** Las condiciones medicas estables (alergias, diagnosticos) van en Capa 3A. Los tratamientos activos (antibiotico 5 dias, jarabe hasta el viernes) van en Capa 3B como estado operativo con fecha de caducidad.

4. **Ventana conversacional filtrada.** No enviar los ultimos N mensajes crudos a Claude. Pre-clasificar cada mensaje como irrelevante o potencialmente accionable. Solo enviar los relevantes. Esto reduce costo y evita mezclar temas (antibiotico + disfraz + excursion + pañales).

5. **Resumenes como apoyo, no como verdad.** Los resumenes diarios/semanales (Capa 2) sirven para continuidad narrativa y contexto del modelo. La informacion operativa real vive en tablas: eventos, tareas, tratamientos, recordatorios.

6. **Todo tiene vigencia.** Cada dato operativo debe incluir metadatos de temporalidad:
   - `source` — de donde vino (chat, email, manual)
   - `confidence` — nivel de confianza de la extraccion
   - `valid_from` / `valid_until` — vigencia temporal
   - `confirmed_by` — quien lo confirmo (mama/papa/ninguno)
   - `status` — activo, completado, caducado, pendiente_confirmacion

7. **Estados pendientes de confirmacion.** Muchas decisiones familiares son progresivas. Nanny detecta "pediatra martes 10am" pero falta saber quien lleva. Debe existir un estado `awaiting_confirmation` para items incompletos que requieren clarificacion.

#### Reglas de Conversacion de Nanny

##### Taxonomia de Intents

Cada mensaje del chat pasa por clasificacion. Los intents posibles son:

| Intent | Descripcion | Ejemplo | Nanny interviene |
|--------|-------------|---------|------------------|
| `EVENT` | Evento nuevo o modificado | "Pau tiene futbol el jueves" | Si |
| `TASK` | Tarea pendiente | "Hay que comprar el disfraz" | Si |
| `MEDICAL_UPDATE` | Info medica nueva o cambio | "Le cambie la dosis" | Si (SIEMPRE confirma) |
| `QUESTION_TO_NANNY` | Pregunta directa a Nanny | "Nanny, ¿que tiene Pau mañana?" | Si |
| `SCHEDULE_CONFLICT` | Conflicto de horarios o decision pendiente | "¿Quien lo lleva?" | Si |
| `INFO_UPDATE` | Info contextual sobre un hijo | "La abuela lo recoge hoy" | Si |
| `EMOTIONAL_WITH_IMPACT` | Emocional con posible impacto en hijo | "Pau estuvo llorando toda la noche" | Registra sin intervenir |
| `IGNORE` | Ruido, social, emocional sin contexto | "jaja ok", "que cansado estoy" | No |

Regla principal: **Nanny solo interviene si detecta informacion accionable.** Si `intent = IGNORE` o `intent = EMOTIONAL_WITH_IMPACT`, Nanny no responde en el chat.

##### Limites de Mensajes Proactivos

Nanny anticipa necesidades, pero sin convertirse en spam. Reglas:

- **Maximo 3 mensajes proactivos al dia**: agenda matutina (automatica) + hasta 2 anticipaciones contextuales
- **Ventana horaria**: nunca antes de las 7:00 AM ni despues de las 10:00 PM
- **Regla de silencio**: si el padre no respondio al ultimo mensaje proactivo de Nanny, no enviar otro proactivo hasta que haya actividad en el chat
- **Prioridad**: si hay mas de 2 anticipaciones pendientes, Nanny agrupa en un solo mensaje ("Dos cosas para mañana: disfraz de Pau y cita pediatra 10am")
- **Excepcion**: alertas medicas (medicinas, dosis) ignoran el limite de 3 pero respetan la ventana horaria

##### Campos Minimos por Tipo de Intent

Antes de crear un registro, Nanny valida que tenga los campos requeridos. Si falta alguno, **pregunta en vez de adivinar**.

| Intent | Campos requeridos | Campos opcionales |
|--------|-------------------|-------------------|
| `EVENT` | child, event_type, date, time | location, responsible |
| `TASK` | child, task_description | deadline, responsible |
| `MEDICAL_UPDATE` | child, medication, dose, frequency, end_date | notes, prescribing_doctor |
| `SCHEDULE_CONFLICT` | child, event, conflicting_event | — |
| `INFO_UPDATE` | child, info_type, detail | valid_until |

Ejemplo: mama dice "Pediatra Pau martes". Nanny detecta `EVENT`, tiene child=Pau, event_type=doctor, date=martes, pero falta `time`. Nanny pregunta: *"¿A que hora es el pediatra de Pau el martes?"*

##### Estados de Eventos

Los eventos tienen dos estados intermedios antes de ser definitivos:

| Estado | Significado | Ejemplo |
|--------|-------------|---------|
| `pending_event` | Faltan campos requeridos | "Pediatra Pau martes" (falta hora) |
| `pending_confirmation` | Campos completos, esperando validacion del padre | "Entendi: pediatra Pau martes 10am. ¿Correcto?" |
| `confirmed` | Padre confirmo, evento activo | Padre respondio "si" o toco boton [Confirmar] |

Un `pending_event` se convierte en `pending_confirmation` cuando se completan los campos. Un `pending_confirmation` se convierte en `confirmed` cuando el padre valida.

##### Botones de Confirmacion

Usar botones inline siempre que sea posible para reducir friccion:

```
Futbol Pau jueves 17:00
¿Quien lo lleva?

[Papa]  [Mama]
```

Las respuestas de Nanny deben funcionar tanto con botones (app propia) como sin ellos (texto plano), para compatibilidad futura con canales como WhatsApp.

#### Flujo: Mensaje → Memoria

```
Mensaje nuevo en el chat
        │
        ▼
┌─────────────────────────┐
│  CAPA 0: Log completo   │  ← siempre se guarda todo
│  (raw message + metadata)│
└───────────┬─────────────┘
            │
            ▼
┌───────────────────────────────┐
│  FILTRO 1: Pre-clasificacion  │  ← rapida, sin LLM
│  ¿Relevante o ruido?         │
│  "jaja ok" → descarta        │
│  "le toca medicina" → ✓      │
│  "que cansado estoy" → descarta │
└───────────┬───────────────────┘
            │ (solo relevantes)
            ▼
┌───────────────────────────────┐
│  FILTRO 2: Contexto para LLM  │
│  Mensajes relevantes filtrados │  ← NO los ultimos N crudos
│  + Capa 3 del hijo            │  ← identidad + estado operativo
│  + Capa 2 resumen reciente    │  ← contexto narrativo
│  + Estado de pending_events   │  ← eventos incompletos activos
│                               │
│  → Se envia a Claude API      │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│  Claude devuelve JSON:         │
│  {                             │
│    "intent": "EVENT",          │
│    "child": "Pau",             │
│    "event_type": "doctor",     │
│    "date": "Tuesday",          │
│    "time": "10:00",            │
│    "confidence": 0.92,         │
│    "missing_fields": []        │
│  }                             │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│  FILTRO 3: Decidir accion          │
│                                    │
│  Intent = IGNORE:                  │
│  → Solo registra en Capa 0         │
│  → Nanny NO responde               │
│                                    │
│  Intent = EMOTIONAL_WITH_IMPACT:   │
│  → Registra en Capa 0 + Capa 3    │
│  → Nanny NO responde               │
│                                    │
│  missing_fields no vacio:          │
│  → Guarda como pending_event       │
│  → Pregunta campo faltante         │
│                                    │
│  Intent = MEDICAL_UPDATE:          │
│  → SIEMPRE confirma antes de actuar│
│  → Guarda como pending_confirmation│
│                                    │
│  Confidence alta (>0.9):          │
│  → Actualiza Capa 3B directo      │
│  → Confirma en chat con ✅         │
│                                    │
│  Confidence media (0.7-0.9):      │
│  → Guarda como pending_confirmation│
│  → Pregunta en chat               │
│                                    │
│  Confidence baja (<0.7):          │
│  → Solo registra en Capa 0        │
│  → Pide clarificacion             │
└───────────────────────────────────┘
```

##### Resolucion de Referencias Contextuales

Nanny resuelve pronombres y referencias usando la ventana de mensajes relevantes:

```
Mama: "Pau tiene futbol el jueves"
Papa: "yo lo llevo"

Nanny interpreta:
  → responsable = papa
  → evento = futbol jueves
  → child = Pau
```

El contexto conversacional (Capa 1 + pending_events activos) permite resolver "lo", "eso", "ahi", "el" sin preguntar.

### Stack Tecnico

**Fase 1 — Prototipo (Actual)**

| Capa | Tecnologia |
|------|-----------|
| Frontend | HTML5 + CSS3 + Vanilla JS (archivo unico) |
| Diseño | Mobile-first, iPhone frame (375x812px) |
| Backend | No existe (demo con datos hardcodeados) |
| Despliegue | HTML estatico |

**Fase 2+ — Produccion**

| Capa | Tecnologia |
|------|-----------|
| App | React Native o Flutter (iOS + Android) |
| Backend | Node.js o Python (API REST + WebSockets para chat real-time) |
| AI | Claude API (comprension, extraccion, generacion, procesamiento de emails) |
| Base de datos | PostgreSQL (datos estructurados) + Vector DB (memoria conversacional) |
| Notificaciones | Firebase Cloud Messaging / Apple Push Notifications |
| Email parsing | SendGrid Inbound Parse o similar (procesar emails del cole/doctor) |
| Calendarios | Google Calendar API + Apple Calendar (EventKit) |
| Mensajeria externa | WhatsApp Business API / Twilio SMS (red de apoyo) |
| Auth | Numero de telefono + OTP |

### Modelo de Datos

Organizado segun la Arquitectura de Memoria por capas.

```
═══════════════════════════════════════════════════════════════
  CAPA 3A — IDENTIDAD FAMILIAR ESTABLE
  (datos que duran meses/años, rara vez cambian)
═══════════════════════════════════════════════════════════════

Family
  ├── id, name, created_at

Parents[]
  ├── id, family_id, name, role (mama/papa), phone, email
  ├── calendar_provider (google/apple), calendar_id
  └── notification_preferences

Children[]
  ├── id, family_id, name, birth_date, emoji
  ├── school, teacher, grade
  └── doctor, doctor_phone

Allergies[]
  ├── id, child_id, allergen, severity
  ├── source (chat/manual), confirmed_by
  └── detected_at

MedicalConditions[]
  ├── id, child_id, condition, diagnosed_date
  ├── source, confirmed_by
  └── notes

Preferences[]
  ├── id, child_id, category (diaper/formula/clothing/shoe)
  ├── key, value (ej: brand="Huggies", size="E3")
  ├── source, confirmed_by
  └── last_updated

SupportNetwork[]
  ├── id, family_id, name, relation (abuela/tio/niñera/vecina)
  ├── phone, contact_method (whatsapp/sms)
  ├── availability_notes
  └── cost_per_hour (null si es familia)

EmergencyContacts[]
  ├── id, family_id, name, phone, relation
  └── priority_order

EmailIntegrations[]
  ├── id, family_id, source (school/doctor/activity)
  ├── email_address, label
  └── last_processed_at


═══════════════════════════════════════════════════════════════
  CAPA 3B — ESTADO OPERATIVO VIGENTE
  (datos temporales con vigencia, cambian frecuentemente)
═══════════════════════════════════════════════════════════════

ActiveTreatments[]
  ├── id, child_id, medication_name, dose, frequency
  ├── start_date, end_date
  ├── source (chat/email_doctor), confidence
  ├── confirmed_by (mama/papa/none)
  └── status (active/completed/cancelled)

Events[]
  ├── id, family_id, title, date, time, child_id
  ├── type (school/medical/activity/social/errand)
  ├── assigned_to (mama/papa/both/support_contact_id)
  ├── source (chat/email_school/email_doctor/manual)
  ├── confidence, confirmed_by
  ├── valid_from, valid_until
  ├── reminder_config
  └── status (pending/done/missed/delegated)

Tasks[]
  ├── id, family_id, description, priority, child_id
  ├── assigned_to, due_date
  ├── subtasks[] (checklist items)
  ├── source, confidence, confirmed_by
  └── status (pending/in_progress/done/expired)

Reminders[]
  ├── id, family_id, child_id, title, message
  ├── trigger_at, repeat_config
  ├── source_event_id / source_treatment_id
  └── status (active/fired/dismissed/expired)

TemporaryAssignments[]
  ├── id, family_id, description
  ├── assigned_to, child_id
  ├── valid_from, valid_until
  ├── source, confirmed_by
  └── status (active/expired/replaced)

PendingDecisions[]
  ├── id, family_id, description
  ├── context (que se sabe hasta ahora)
  ├── clarification_needed (que falta por definir)
  ├── detected_at, resolved_at
  └── status (awaiting_confirmation/resolved/expired)

Routines[]
  ├── id, family_id, child_id, description
  ├── schedule (days[], time)
  ├── assigned_to, location
  ├── valid_from, valid_until
  └── status (active/paused/ended)


═══════════════════════════════════════════════════════════════
  CAPA 2 — MEMORIA RESUMIDA (derivada)
═══════════════════════════════════════════════════════════════

DailySummaries[]
  ├── id, family_id, date
  ├── summary_text (generado por IA)
  ├── key_events[], key_decisions[]
  └── generated_at

WeeklySummaries[]
  ├── id, family_id, week_start, week_end
  ├── summary_text
  ├── unresolved_items[], highlights[]
  └── generated_at

NotableUpdates[]
  ├── id, family_id, child_id
  ├── update_text, category (medical/school/routine)
  ├── source_message_id
  └── detected_at


═══════════════════════════════════════════════════════════════
  CAPA 1 — CONTEXTO CONVERSACIONAL
═══════════════════════════════════════════════════════════════

  (No se persiste como tabla propia — se construye
   dinamicamente seleccionando mensajes relevantes
   de Capa 0 antes de cada llamada a Claude)


═══════════════════════════════════════════════════════════════
  CAPA 0 — LOG COMPLETO (auditoria y debugging)
═══════════════════════════════════════════════════════════════

Messages[]
  ├── id, family_id
  ├── sender (mama/papa/nanny/system), text, timestamp
  ├── is_relevant (pre-clasificacion: true/false)
  ├── detected_intent
  ├── extracted_entities[]
  ├── confidence_score
  ├── actions_generated[]
  └── confirmation_status (confirmed/rejected/pending/na)

AuditLog[]
  ├── id, family_id, action_type
  ├── description, source_message_id
  ├── target_table, target_id
  ├── old_value, new_value
  ├── performed_by (nanny/mama/papa)
  └── timestamp
```

---

## Roadmap — ¿Cuando?

### Fase 1: Demo Interactivo ✅ (Completada)
**Objetivo**: Validar el concepto y la narrativa de producto.

- [x] Onboarding conversacional (Nanny pregunta, usuario responde con taps)
- [x] Simulacion de primera semana (7 dias de interaccion Mama-Papa-Nanny)
- [x] Dashboard "Hoy" con agenda y pendientes
- [x] Vista semanal con responsables
- [x] Notificaciones simuladas (medicina, compartir a WhatsApp)
- [x] Perfil de hijo con informacion completa

**Entregable**: Demo funcional para presentar a inversionistas y early adopters.

### Fase 2: MVP — Chat + Tareas + Hijos + Insights
**Objetivo**: Primera version usable con familias reales. Probar que los padres SI chatean en Nanny.

**Core**
- [ ] App nativa (React Native / Flutter) o PWA
- [ ] Backend con WebSockets (chat en tiempo real)
- [ ] Auth por numero de telefono
- [ ] Chat funcional: Mama + Papa + Nanny (AI)
- [ ] Procesamiento de mensajes con Claude API
- [ ] Perfiles de hijos editables con pestañas: Info, Salud, Actividades, Historial
- [ ] Tareas como pantalla propia (con y sin fecha)
- [ ] Notificaciones push reales (medicinas, recordatorios)
- [ ] Resumen semanal automatico

**Hijos y Gestion Familiar**
- [ ] Perfil por hijo con edicion inline (ver y editar en el mismo lugar)
- [ ] Separacion estable vs operativo en Salud (alergias permanentes vs tratamientos activos)
- [ ] Historial por hijo: log cronologico de todo lo que Nanny registro (audit log amigable)
- [ ] Acciones de correccion: editar/eliminar datos que Nanny entendio mal

**Red de Apoyo y Config (dentro de "Mas")**
- [ ] Red de apoyo con disponibilidad, costos, orden de emergencia
- [ ] Configuracion familiar (datos padres, integraciones, notificaciones)

**Metricas (Pantalla 7 — solo equipo interno)**
- [ ] Dashboard de adopcion (familias activas, msgs/dia, retencion)
- [ ] Dashboard de engagement (push vs iniciativa, mama vs papa, accionables vs ruido)
- [ ] Dashboard de calidad IA (extracciones correctas, confirmaciones, correcciones)
- [ ] Dashboard de costo (tokens, costo/familia, costo/mensaje)
- [ ] Señales de alerta roja/amarilla/verde para decidir si pivotar o escalar

**Metrica clave**: 10 familias activas 30 dias. ¿Chatean en Nanny o regresan a WhatsApp?

### Fase 3: Integraciones + Coordinacion
**Objetivo**: Nanny se convierte en el hub central de informacion familiar.

- [ ] Integracion email (cole, doctor, actividades)
- [ ] Sync con Google Calendar / Apple Calendar
- [ ] Deteccion automatica de conflictos de horarios
- [ ] Asignacion inteligente de tareas (segun disponibilidad)
- [ ] Historial medico por hijo
- [ ] Memoria conversacional (contexto de semanas anteriores)

**Metrica clave**: Reduccion de "se me olvido" en 80%.

### Fase 4: Red de Apoyo + Acciones
**Objetivo**: Nanny no solo avisa — resuelve.

- [ ] Registro de red de apoyo (abuelos, tios, niñera)
- [ ] Contacto automatico via WhatsApp/SMS
- [ ] Confirmacion y seguimiento de delegaciones
- [ ] Listas de compras inteligentes (con links o sugerencias)
- [ ] Compartir perfiles de hijos con cuidadores temporales

**Metrica clave**: Numero de "problemas resueltos" sin intervencion directa de los padres.

### Fase 5: Escala y Monetizacion
**Objetivo**: Producto sostenible.

- [ ] Onboarding self-service
- [ ] Freemium (1 hijo gratis, premium para familias grandes + integraciones)
- [ ] Partnerships con colegios (comunicados directo a Nanny)
- [ ] Multi-idioma (español, ingles, portugues)
- [ ] Analytics para padres (tiempo dedicado, distribucion de tareas mama/papa)

---

## Diferenciadores

| | Apps de Familia | Calendarios | WhatsApp | **Nanny** |
|---|---|---|---|---|
| **Entrada de datos** | Manual | Manual | Natural pero se pierde | Natural y se captura |
| **Inteligencia** | Ninguna | Ninguna | Ninguna | AI que entiende y actua |
| **Coordinacion** | Basica | Solo horarios | Informal | Detecta conflictos, propone |
| **Red de apoyo** | No | No | Manual | Contacta y confirma |
| **Info del cole** | No | No | Se pierde en el chat | Auto-procesado de emails |
| **Medicinas** | No | Recordatorio basico | Se olvida | Seguimiento completo |
| **Esfuerzo** | Alto | Alto | Cero pero caotico | Cero y organizado |

---

## Riesgos y Mitigaciones

| Riesgo | Nivel | Mitigacion |
|--------|-------|------------|
| **Padres no migran de WhatsApp** | Alto | Valor inmediato dia 1 (recordatorio medicina). No pedir que dejen WhatsApp — Nanny es solo para temas de hijos |
| **IA comete errores con info de niños** | Alto | Confirmar siempre antes de actuar. Nunca asumir — preguntar. En medicinas, doble confirmacion |
| **Sensibilidad al precio (LatAm)** | Medio | Freemium generoso. Premium justificado por integraciones y red de apoyo |
| **Privacidad de datos de menores** | Alto | Encriptacion end-to-end. Cumplimiento COPPA/GDPR. Datos nunca compartidos con terceros |
| **Dependencia de Claude API** | Medio | Arquitectura que permite cambiar de modelo. Fallbacks para funciones criticas |

### Estrategias Detalladas de Mitigacion

#### Riesgo #1: Padres no migran de WhatsApp

**Principio**: No competir con WhatsApp — ser complementario. Los padres seguiran usando WhatsApp para todo lo demas. Nanny solo necesita capturar las conversaciones sobre los hijos.

**Que construir:**

- **Push notifications que jalan al chat.** El recordatorio del antibiotico llega como push. Al tocarlo, abre el chat de Nanny. Mama responde ahi ("ya se lo di") porque es donde esta el contexto. No va a abrir WhatsApp para decirle a Papa "ya le di el antibiotico" si Nanny ya lo registro.

- **Nanny inicia conversaciones.** Nanny no espera — pregunta. "¿Como sigue Pau?", "¿Decidieron el disfraz?", "El cole mando email sobre reunion de padres". Cada pregunta de Nanny es una razon para abrir la app.

- **Resumen semanal como hook.** El domingo a las 8pm llega el resumen. Si los padres ven que dice "3 cosas sin resolver para la proxima semana", abren Nanny para resolverlas ahi mismo.

- **La info solo vive en Nanny.** Si mama escribe en WhatsApp "martes pediatra 10am", eso se pierde en el scroll. Si lo escribe en Nanny, queda en el calendario, en el perfil de Pau, con recordatorio y con la pregunta "¿quien la lleva?". El valor de escribir en Nanny vs WhatsApp tiene que ser obvio desde el dia 1.

- **Metricas clave para pivotar rapido.** En el MVP, trackear: ¿cuantos mensajes al dia por familia? ¿Abren por push o por iniciativa propia? ¿Cuantos dias seguidos abren la app? Si despues de 2 semanas los padres no chatean, considerar modelo alternativo: ingesta de WhatsApp por forwarding como complemento (no como reemplazo del chat propio).

#### Riesgo #2: IA comete errores con info de niños

**Principio**: Confirmar siempre, asumir nunca. Fallar de forma segura. Un error en una app de productividad molesta; un error con la medicina de tu hijo asusta.

**Que construir:**

- **Doble confirmacion para acciones criticas.** Nanny nunca ejecuta algo medico sin confirmar (`intent = MEDICAL_UPDATE` → SIEMPRE `pending_confirmation`). Si detecta "antibiotico cada 8 horas", responde: "Entendi: antibiotico cada 8 horas para Pau. ¿Correcto?" Solo despues programa los recordatorios.

- **Validacion de campos minimos.** Antes de crear cualquier registro, Nanny verifica que tiene los campos requeridos segun el tipo de intent (ver Reglas de Conversacion). Si faltan campos, guarda como `pending_event` y pregunta uno por uno. No adivina.

- **Niveles de confianza en la IA (3 niveles, no binario).** Cada extraccion de Claude tiene un confidence score interno. La granularidad importa — no es lo mismo confirmar que clarificar:
  - Alto (>0.9): Nanny actua y confirma ("Anote: pediatra martes 10am ✅")
  - Medio (0.7-0.9): Pregunta ("¿Entendi bien que el pediatra es el martes a las 10?")
  - Bajo (<0.7): Pide clarificacion ("No me quedo claro, ¿puedes darme mas detalles?")
  - **Excepcion medica**: si `intent = MEDICAL_UPDATE`, SIEMPRE confirma sin importar el confidence

- **Separar "entender" de "actuar".** Nanny puede entender mal un mensaje y eso es tolerable si no actua sobre la mala interpretacion. El flujo siempre es: entender → confirmar → actuar. Nunca entender → actuar.

- **Datos medicos como ciudadanos de primera clase.** En el modelo de datos, las medicinas tienen validaciones estrictas: frecuencia debe ser un numero valido, fecha de fin obligatoria, dosis no puede quedar vacia. Si Nanny no puede extraer todos los campos, pregunta uno por uno en vez de adivinar.

- **Fallback humano siempre visible.** Si Nanny no entiende algo, dice "No estoy segura de haber entendido, ¿puedes decirmelo de otra forma?" en vez de inventar. Es mejor parecer limitada que equivocarse con la salud de un niño.

- **Beta cerrado con familias reales.** Antes del MVP publico, correr 4 semanas con 5 familias. Pedirles que reporten cada vez que Nanny entendio mal. Usar esos errores para refinar prompts y validaciones.

- **Audit log visible para padres.** En el perfil de cada hijo, los padres pueden ver que entendio Nanny y cuando. "Nanny anoto: alergia al mani (3 de marzo, desde conversacion del chat)". Si algo esta mal, pueden corregirlo.

#### Riesgo #3: Sensibilidad al precio en LatAm

**Principio**: Freemium generoso que engancha, premium que resuelve dolores reales.

**Que construir:**

- **Free tier que funciona de verdad.** Chat + recordatorios + 1 hijo + perfil basico. Suficiente para que una familia con un hijo tenga una experiencia completa. El free no puede sentirse castrado — tiene que ser util de verdad para generar word of mouth.

- **Premium justificado por dolor, no por features artificiales.** No cobrar por "mas hijos" como barrera. Cobrar por lo que resuelve dolores mas grandes:
  - Integracion con email del cole (nunca mas leer circulares)
  - Red de apoyo automatizada (contactar abuela/niñera con un tap)
  - Sync de calendarios (deteccion de conflictos)
  - Historial medico completo con exportacion para el pediatra
  - Multiples familias (divorciados con custodia compartida)

- **Precio anclado a lo que ya gastan.** Una hora de niñera cuesta $200-400 MXN. Si Nanny evita una emergencia de coordinacion al mes, el precio de $99-149 MXN/mes se justifica solo. Enmarcarlo como "menos que una hora de niñera al mes".

- **B2B como segundo revenue stream.** Los colegios pagan por comunicacion con padres. Si Nanny ofrece a los colegios un canal directo (email del cole → Nanny de los padres automaticamente), el colegio puede pagar por padre/mes. Los padres reciben la integracion gratis, el colegio paga por llegar efectivamente a los padres.

- **No monetizar hasta Fase 3.** Las primeras 2 fases son 100% gratis. Primero validar que el producto funciona y retiene. Monetizar antes de tener retencion es matar el producto.

### Prioridades de Mitigacion por Fase

| Preocupacion | Que construir primero | Cuando |
|---|---|---|
| **Adopcion del chat** | Push notifications que jalan al chat + Nanny que inicia conversaciones | Fase 2 (MVP) |
| **Calidad de la IA** | Doble confirmacion + niveles de confianza + audit log | Fase 2 (MVP) |
| **Monetizacion** | Nada — todo gratis hasta validar retencion | Fase 3-4 |

---

## Resumen Ejecutivo

**Nanny** es una app con chat familiar propio donde mama, papa y un asistente AI conversan sobre sus hijos. Los padres hablan naturalmente y Nanny escucha, recuerda, organiza, avisa y actua.

**No es un bot de WhatsApp** (imposible y prohibido por Meta). Es su propia app donde la conversacion es la interfaz y la AI es un miembro activo del grupo familiar.

**Vision**: Evolucionar de chat + recordatorios a **sistema operativo familiar** — integrando emails del cole, calendarios de los padres, y una red de apoyo que Nanny puede contactar y coordinar autonomamente.

**Diferencia clave**: Las apps de familia registran datos. Nanny **resuelve problemas**. No dice "tienes una reunion" — dice "tienes una reunion, mama no puede, papa si, ¿va papa?". No dice "necesitas quien recoja a Pau" — contacta a la abuela, confirma, y te avisa.

**Estado actual**: Demo interactivo (Fase 1 completada). Siguiente paso: MVP con 10 familias piloto para validar que los padres SI chatean en Nanny.
