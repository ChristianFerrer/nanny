/**
 * Decision Agent — orquestador.
 *
 * Acepta un trigger (scheduled / message / manual), arma el contexto,
 * invoca Claude con prompt caching, parsea la decisión, persiste el log,
 * y opcionalmente entrega el mensaje (chat / push / whatsapp_contact).
 *
 * Ver NANNY-VISION.md §6 (reloj semántico) y AGENT-REWRITE-PLAN.md §3.
 */

import { getSupabaseAdmin } from '@/lib/supabase';
import type {
  DecisionAgentMoment,
  DecisionAgentOutput,
  DecisionAgentTriggerType,
} from '@/lib/types';
import {
  buildDecisionContext,
  formatDayLabel,
  formatLocalIso,
  renderFamilyProfile,
  renderMomentContext,
  type BuiltContext,
} from './context';
import { invokeDecisionAgent, type ClaudeResult } from './claude';

export interface RunDecisionAgentInput {
  familyId: string;
  trigger_type: DecisionAgentTriggerType;
  trigger_moment?: DecisionAgentMoment | null;
  trigger_message_id?: string | null;
  // Si true, el caller se encarga de persistir el mensaje en el chat.
  // Útil para integraciones con SSE donde queremos emitir antes de persistir.
  // Default false: el agent persiste directo si delivery='chat'.
  defer_delivery?: boolean;
}

export interface RunDecisionAgentResult {
  log_id: string | null;
  decision: DecisionAgentOutput;
  context: BuiltContext;
  cost_usd: number;
  latency_ms: number;
  delivered: boolean;
}

export async function runDecisionAgent(
  input: RunDecisionAgentInput,
): Promise<RunDecisionAgentResult | null> {
  const now = new Date();

  // ──────────────────────────────────────────
  // 1. Armar contexto
  // ──────────────────────────────────────────
  const ctx = await buildDecisionContext({
    familyId: input.familyId,
    trigger: {
      type: input.trigger_type,
      moment: input.trigger_moment ?? null,
      local_time_iso: 'tbd',
      local_day_label: 'tbd',
      triggering_message_id: input.trigger_message_id ?? null,
      triggering_message_preview: null,
    },
  });

  if (!ctx) return null;

  const tz = ctx.profile.timezone;
  ctx.moment.trigger.local_time_iso = formatLocalIso(now, tz);
  ctx.moment.trigger.local_day_label = formatDayLabel(now, tz);

  const profileText = renderFamilyProfile(ctx.profile);
  const momentText = renderMomentContext(ctx.moment);

  // ──────────────────────────────────────────
  // 2. Invocar Claude
  // ──────────────────────────────────────────
  let claude: ClaudeResult | null = null;
  let decision: DecisionAgentOutput;
  try {
    const r = await invokeDecisionAgent({
      familyProfileText: profileText,
      momentContextText: momentText,
    });
    claude = r.raw;
    decision = r.output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[decision-agent] invocation error', { familyId: input.familyId, error: msg });
    // Persistir un log de fallo para no perder el rastro y devolver silencio.
    const errLogId = await persistLog({
      familyId: input.familyId,
      input,
      ctx,
      decision: {
        intervene: false,
        message: null,
        delivery: null,
        delivery_target_contact_id: null,
        priority: null,
        reason: `anthropic_error: ${msg}`,
      },
      raw: null,
    });
    return {
      log_id: errLogId,
      decision: {
        intervene: false,
        message: null,
        delivery: null,
        delivery_target_contact_id: null,
        priority: null,
        reason: `anthropic_error: ${msg}`,
      },
      context: ctx,
      cost_usd: 0,
      latency_ms: 0,
      delivered: false,
    };
  }

  // ──────────────────────────────────────────
  // 3. Persistir log antes de entregar — así siempre queda trazado
  //    incluso si la entrega falla.
  // ──────────────────────────────────────────
  const log_id = await persistLog({
    familyId: input.familyId,
    input,
    ctx,
    decision,
    raw: claude,
  });

  // ──────────────────────────────────────────
  // 4. Entregar (si corresponde)
  // ──────────────────────────────────────────
  let delivered = false;
  if (!input.defer_delivery && decision.intervene && decision.message) {
    delivered = await deliver(input.familyId, decision, log_id);
  }

  return {
    log_id,
    decision,
    context: ctx,
    cost_usd: claude.cost_usd,
    latency_ms: claude.latency_ms,
    delivered,
  };
}

/**
 * Persiste el log de la corrida. Devuelve el id o null si falla.
 */
async function persistLog(args: {
  familyId: string;
  input: RunDecisionAgentInput;
  ctx: BuiltContext;
  decision: DecisionAgentOutput;
  raw: ClaudeResult | null;
}): Promise<string | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('decision_agent_log')
      .insert({
        family_id: args.familyId,
        trigger_type: args.input.trigger_type,
        trigger_moment: args.input.trigger_moment ?? null,
        trigger_message_id: args.input.trigger_message_id ?? null,
        context_summary: args.ctx.summary,
        decision: args.decision,
        model_response: args.raw
          ? {
              model: args.raw.raw.model,
              stop_reason: args.raw.raw.stop_reason,
              usage: args.raw.usage,
              text_preview: args.raw.text.slice(0, 400),
            }
          : null,
        cost_usd: args.raw?.cost_usd ?? 0,
        latency_ms: args.raw?.latency_ms ?? null,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[decision-agent] log insert error', error);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error('[decision-agent] log insert exception', err);
    return null;
  }
}

/**
 * Entrega el mensaje según el canal. Sprint 1 implementa solo chat y push
 * (push es best-effort). whatsapp_contact se loguea pero no se envía
 * todavía — eso es Sprint 4.
 */
async function deliver(
  familyId: string,
  decision: DecisionAgentOutput,
  logId: string | null,
): Promise<boolean> {
  if (!decision.message) return false;
  const admin = getSupabaseAdmin();

  if (decision.delivery === 'chat' || decision.delivery === 'push') {
    // En ambos casos el mensaje aparece en el chat. El push es notificación
    // del mismo mensaje, no un canal distinto.
    const { error } = await admin.from('messages').insert({
      family_id: familyId,
      sender_id: null,
      sender_type: 'nanny',
      content: decision.message,
      message_type: 'text',
      metadata: {
        intent: 'DECISION_AGENT',
        proactive: true,
        priority: decision.priority,
        decision_log_id: logId,
        delivery: decision.delivery,
      },
    });
    if (error) {
      console.error('[decision-agent] message insert error', error);
      return false;
    }
    return true;
  }

  if (decision.delivery === 'whatsapp_contact') {
    console.warn('[decision-agent] whatsapp_contact delivery requested — Sprint 4 not yet implemented', {
      familyId,
      contactId: decision.delivery_target_contact_id,
    });
    return false;
  }

  return false;
}
