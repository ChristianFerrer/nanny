import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSupabaseAdmin } from '@/lib/supabase';
import { formatAge } from '@/lib/age';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Catchup nocturno — cron horario que dispara el "re-análisis" automático del
 * chat del día para cada familia a las 4am LOCAL (1h antes del morning brief
 * de las 8am, para que cualquier item agregado por el catchup pueda aparecer
 * en el brief).
 *
 * Filosofía de producto: el botón manual "re-analizar chat" era una admisión
 * de que Nanny no estaba escuchando bien. Una asistente real revisa por su
 * cuenta. Este cron es esa revisión silenciosa.
 *
 * Idempotencia: chequea que no haya corrido en las últimas 22h por la misma
 * familia (busca tasks/events con metadata.auto_catchup_at reciente, o un
 * marker en messages).
 *
 * Schedule en cron-job.org: `0 * * * *` (cada hora). Los filtros de TZ se
 * hacen dentro del endpoint.
 */

const CATCHUP_HOUR_LOCAL = 4; // 4am local
const RECENT_WINDOW_HOURS = 22;

// Prompt — versión backend, sin la sección "reply" porque acá no se muestra
// nada al usuario en tiempo real.
const NIGHTLY_CATCHUP_PROMPT = `Eres Nanny revisando el historial de hoy del chat familiar para encontrar
información ACCIONABLE que NO fue capturada en eventos, tareas o medicaciones.

FECHA ACTUAL: {current_date}

CONTEXTO DE LA FAMILIA:
{family_context}

EVENTOS YA REGISTRADOS:
{existing_events}

TAREAS YA REGISTRADAS:
{existing_tasks}

MEDICAMENTOS YA REGISTRADOS:
{active_medications}

MENSAJES DEL DÍA:
{messages}

Tu trabajo: encontrar TAREAS, EVENTOS o MEDICACIONES que estén en los mensajes
pero NO en el contexto. Reglas críticas:

- NO dupliques: si algo ya está registrado, NO lo incluyas.
- IMPERATIVO Y DECLARATIVO son ambos accionables:
  * "hay que comprar X", "está pendiente comprar X", "falta X" → tarea
- ACCIONES PASADAS bajo un grupo (cumple, viaje, mudanza) → tarea con status="done"
  y completed_at = fecha del mensaje. Si la acción pasada está aislada, IGNORAR.
- TASK GROUP: si hay múltiples tareas del mismo topic, todas comparten un
  task_group con parent_title y child_name.
- Listas dentro de un mensaje ("decoración y sorpresitas") → DOS tareas separadas.

Formato de respuesta (JSON puro):
{
  "found_items": [
    {
      "type": "medication" | "event" | "task",
      "summary": "descripción breve",
      "child": "nombre o null",
      "task_group": null | { "parent_title": "string", "child_name": "string|null" },
      "data": { ... }
    }
  ]
}

Si no hay nada: { "found_items": [] }
Solo JSON. Sin texto extra.`;

export async function GET(req: NextRequest) {
  // Auth: cron-job.org dispara con ?secret=... o header x-cron-secret
  const cronSecret = process.env.CRON_SECRET;
  const headerVercel = req.headers.get('x-vercel-cron');
  const headerCustom = req.headers.get('x-cron-secret');
  const querySecret = req.nextUrl.searchParams.get('secret');
  if (cronSecret && !headerVercel && headerCustom !== cronSecret && querySecret !== cronSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY missing' }, { status: 500 });
  }
  const openai = new OpenAI({ apiKey });
  const admin = getSupabaseAdmin();

  const { data: families } = await admin
    .from('families')
    .select('id, name, timezone');

  const recentCutoff = new Date(Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const dayCutoff = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // últimas ~30h de mensajes

  let dueAtThisHour = 0;
  let processed = 0;
  let totalFound = 0;
  let totalCreated = 0;

  for (const fam of families || []) {
    const tz = fam.timezone || 'America/Argentina/Buenos_Aires';
    if (currentHourInTz(tz) !== CATCHUP_HOUR_LOCAL) continue;
    dueAtThisHour++;

    // Idempotencia: ¿hubo catchup en últimas 22h?
    const { data: alreadyDone } = await admin
      .from('tasks')
      .select('id')
      .eq('family_id', fam.id)
      .filter('description', 'ilike', '%[auto-catchup]%')
      .gte('created_at', recentCutoff)
      .limit(1)
      .maybeSingle();
    if (alreadyDone) continue;

    // Cargar contexto
    const [{ data: msgsData }, { data: parents }, { data: children }, { data: events }, { data: tasks }, { data: meds }] =
      await Promise.all([
        admin.from('messages').select('*').eq('family_id', fam.id).gte('created_at', dayCutoff).order('created_at', { ascending: true }).limit(200),
        admin.from('parents').select('*').eq('family_id', fam.id),
        admin.from('children').select('*').eq('family_id', fam.id),
        admin.from('events').select('*').eq('family_id', fam.id).order('date_start', { ascending: true }).limit(40),
        admin.from('tasks').select('*').eq('family_id', fam.id).in('status', ['pending', 'in_progress']).limit(40),
        admin.from('medications').select('*').eq('family_id', fam.id).eq('status', 'active'),
      ]);

    const messages = msgsData || [];
    if (messages.length === 0) continue;

    // Construir contexto
    const familyContext = `Familia: ${(children || []).map(c => `${c.name} (${c.emoji}, ${c.birth_date ? formatAge(c.birth_date) : 'edad desconocida'})`).join(', ')}. Padres: ${(parents || []).map(p => `${p.name} (${p.role})`).join(' y ')}.`;
    const messagesStr = messages.map(m => {
      const sender = m.sender_type === 'nanny' ? 'Nanny' : (parents || []).find(p => p.id === m.sender_id)?.name || 'Padre';
      return `${sender}: ${m.content}`;
    }).join('\n');
    const existingEvents = (events || []).map(e => `- ${e.title} (${new Date(e.date_start).toLocaleDateString('es')})`).join('\n') || 'Ninguno';
    const existingTasks = (tasks || []).map(t => `- ${t.title}`).join('\n') || 'Ninguna';
    const activeMeds = (meds || []).map(m => `- ${m.medication_name} (${m.child_name})`).join('\n') || 'Ninguno';
    const currentDate = new Date().toISOString().split('T')[0];

    const prompt = NIGHTLY_CATCHUP_PROMPT
      .replace('{family_context}', familyContext)
      .replace('{existing_events}', existingEvents)
      .replace('{existing_tasks}', existingTasks)
      .replace('{active_medications}', activeMeds)
      .replace('{messages}', messagesStr)
      .replace('{current_date}', currentDate);

    let foundItems: Array<{ type: string; summary?: string; child?: string; data?: Record<string, unknown>; task_group?: { parent_title: string; child_name: string | null } | null }>;
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 1500,
        temperature: 0.1,
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Analiza y devuelve found_items.' }],
      });
      let content = response.choices[0]?.message?.content?.trim() || '{"found_items":[]}';
      if (content.startsWith('```')) content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      const parsed = JSON.parse(content);
      foundItems = Array.isArray(parsed.found_items) ? parsed.found_items : [];
    } catch (e) {
      console.warn('[nightly-catchup] OpenAI/parse error for family', fam.id, e);
      continue;
    }

    if (foundItems.length === 0) {
      processed++;
      continue;
    }
    totalFound += foundItems.length;

    // Pre-pass: parents para tarea paraguas
    const parentTaskCache = new Map<string, string>();
    for (const item of foundItems) {
      if (item.type !== 'task') continue;
      const tg = item.task_group;
      if (!tg?.parent_title) continue;
      const key = tg.parent_title.toLowerCase().trim();
      if (parentTaskCache.has(key)) continue;
      // Buscar parent existente
      const { data: existing } = await admin
        .from('tasks')
        .select('id')
        .eq('family_id', fam.id)
        .is('parent_task_id', null)
        .ilike('title', tg.parent_title)
        .limit(1)
        .maybeSingle();
      if (existing) {
        parentTaskCache.set(key, existing.id);
      } else {
        const matchedChild = (children || []).find(c => c.name.toLowerCase() === (tg.child_name || '').toLowerCase());
        const { data: created } = await admin
          .from('tasks')
          .insert({
            family_id: fam.id,
            child_id: matchedChild?.id || null,
            parent_task_id: null,
            title: tg.parent_title,
            description: '[auto-catchup] grupo paraguas',
            status: 'pending', priority: 'normal', source: 'chat',
            auto_detected: true,
          })
          .select('id')
          .single();
        if (created) parentTaskCache.set(key, created.id);
      }
    }

    // Crear items
    for (const item of foundItems) {
      try {
        const matchedChild = (children || []).find(c => c.name.toLowerCase() === (item.child || '').toLowerCase());
        if (item.type === 'task' && item.data?.title) {
          const tg = item.task_group;
          const groupKey = tg?.parent_title ? tg.parent_title.toLowerCase().trim() : null;
          const parentId = groupKey ? (parentTaskCache.get(groupKey) || null) : null;
          const status = String(item.data.status || 'pending').toLowerCase() === 'done' ? 'done' : 'pending';
          const completedAt = status === 'done' ? (item.data.completed_at || new Date().toISOString()) : null;
          await admin.from('tasks').insert({
            family_id: fam.id,
            child_id: matchedChild?.id || null,
            parent_task_id: parentId,
            title: item.data.title,
            description: '[auto-catchup] ' + (item.summary || ''),
            assigned_to: roleToParentId(item.data.assigned_to, parents || []),
            due_date: item.data.due_date || null,
            status, priority: 'normal', source: 'chat',
            auto_detected: true, completed_at: completedAt,
          });
          totalCreated++;
        } else if (item.type === 'event' && item.data?.title) {
          await admin.from('events').insert({
            family_id: fam.id,
            child_id: matchedChild?.id || null,
            title: item.data.title,
            description: '[auto-catchup] ' + (item.data.date_description || item.summary || ''),
            event_type: item.data.event_type || 'other',
            date_start: item.data.date_start, date_end: null,
            location: item.data.location || null,
            status: 'pending', source: 'chat', auto_detected: true,
          });
          totalCreated++;
        }
        // Medications: requieren confirmación humana, las saltamos en catchup
        // automático para no crear tratamientos sin doble check.
      } catch (err) {
        console.warn('[nightly-catchup] insert error', fam.id, item.summary, err);
      }
    }

    processed++;
  }

  return NextResponse.json({
    ok: true,
    families: families?.length || 0,
    dueAtThisHour,
    processed,
    totalFound,
    totalCreated,
  });
}

function currentHourInTz(tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
    return parseInt(fmt.format(new Date()), 10);
  } catch {
    return new Date().getUTCHours();
  }
}

function roleToParentId(value: unknown, parents: Array<{ id: string; role: string; name: string }>): string | null {
  if (!value) return null;
  const str = String(value).toLowerCase().trim();
  if (!str) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(str)) return String(value);
  if (str === 'mama' || str === 'mamá' || str === 'madre') return parents.find(p => p.role === 'mama')?.id || null;
  if (str === 'papa' || str === 'papá' || str === 'padre') return parents.find(p => p.role === 'papa')?.id || null;
  const byName = parents.find(p => p.name.toLowerCase() === str);
  return byName?.id || null;
}
