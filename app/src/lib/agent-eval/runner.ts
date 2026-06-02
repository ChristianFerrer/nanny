/**
 * Runner del eval del decision agent.
 *
 * Para cada escenario:
 *   1. Renderiza el perfil familiar (cacheable) desde el setup.
 *   2. Para cada mensaje en orden:
 *      - Renderiza el moment context con el estado actual (mensajes
 *        previos del escenario + respuestas de Nanny de turnos anteriores).
 *      - Invoca `invokeDecisionAgent` (Anthropic real, prompt caching).
 *      - Compara contra expectativas y acumula veredictos.
 *      - Si Nanny acusó, agrega su mensaje al historial para el próximo turno.
 *
 * NO toca la DB. Las preferences capturadas en un turno NO afectan al
 * próximo turno (no se "persisten" en setup.preferences automáticamente).
 * Si querés testear que una corrección se aplique en turnos siguientes,
 * lo modelás explícitamente en el escenario.
 *
 * Costo aprox por corrida completa: $0.50-1.00.
 */

import { invokeDecisionAgent } from '@/lib/agent/claude';
import { renderFamilyProfile, renderMomentContext, type FamilyProfileBlock, type MomentContextBlock } from '@/lib/agent/context';
import { ALL_SCENARIOS } from './scenarios';
import { aggregateRun, aggregateScenario, scoreMessage } from './scorer';
import type { EvalRunResult, MessageResult, Scenario, ScenarioSetup } from './types';

const RUNNER_TZ_DEFAULT = 'Europe/Madrid';

export interface RunOptions {
  scenarioIds?: string[]; // si está vacío, corre todos
  verbose?: boolean;
}

export async function runEval(opts: RunOptions = {}): Promise<EvalRunResult> {
  const started_at = new Date().toISOString();
  const scenarios = ALL_SCENARIOS.filter(s =>
    !opts.scenarioIds || opts.scenarioIds.length === 0 || opts.scenarioIds.includes(s.id)
  );

  const results = [];
  for (const scenario of scenarios) {
    if (opts.verbose) console.log(`\n=== Scenario: ${scenario.name} ===`);
    const scResults = await runScenario(scenario, opts);
    results.push(aggregateScenario(scenario, scResults));
  }

  const finished_at = new Date().toISOString();
  return { ...aggregateRun(results), started_at, finished_at };
}

async function runScenario(scenario: Scenario, opts: RunOptions): Promise<MessageResult[]> {
  const profile = buildProfileBlock(scenario.setup);
  const profileText = renderFamilyProfile(profile);

  // Historial de mensajes que se va construyendo turno a turno.
  const history: { sender: string; role: 'parent' | 'nanny'; text: string; at: string }[] = [];

  const results: MessageResult[] = [];
  for (let i = 0; i < scenario.messages.length; i++) {
    const m = scenario.messages[i];
    const messageAt = new Date(Date.now() - (scenario.messages.length - i) * 60_000).toISOString();
    history.push({ sender: m.sender_name, role: 'parent', text: m.text, at: messageAt });

    const moment = buildMomentBlock({
      setup: scenario.setup,
      history,
      triggering_message_index: i,
    });
    const momentText = renderMomentContext(moment);

    if (opts.verbose) console.log(`  msg ${i + 1}: ${m.sender_name}: ${m.text}`);

    let cost_usd = 0, latency_ms = 0;
    let actual;
    try {
      const r = await invokeDecisionAgent({ familyProfileText: profileText, momentContextText: momentText });
      actual = r.output;
      cost_usd = r.raw.cost_usd;
      latency_ms = r.raw.latency_ms;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error(`  [error] ${msg}`);
      actual = {
        intervene: false,
        message: null,
        delivery: null,
        delivery_target_contact_id: null,
        priority: null,
        reason: `eval_error: ${msg}`,
        captured_preference: null,
        captured_learning_item: null,
        resolves_learning_topic: null,
      };
    }

    const scored = scoreMessage({
      scenario_id: scenario.id,
      message_index: i,
      message: m,
      actual,
      cost_usd,
      latency_ms,
    });
    results.push(scored);

    if (actual.intervene && actual.message) {
      history.push({ sender: 'Nanny', role: 'nanny', text: actual.message, at: new Date().toISOString() });
      if (opts.verbose) console.log(`    nanny: "${actual.message}" (intervene=true, $${cost_usd.toFixed(4)})`);
    } else {
      if (opts.verbose) console.log(`    nanny: (silencio) reason: "${actual.reason}"`);
    }

    const failed: string[] = [];
    if (scored.ack_correct === false) failed.push('ack');
    if (scored.silence_correct === false) failed.push('silence');
    if (scored.capture_correct === false) failed.push('capture');
    if (scored.resolves_correct === false) failed.push('resolves');
    if (scored.message_content_correct === false) failed.push('content');
    if (opts.verbose && failed.length > 0) {
      console.log(`    ✗ failed: ${failed.join(', ')}`);
      for (const n of scored.notes) console.log(`      - ${n}`);
    }
  }

  return results;
}

function buildProfileBlock(setup: ScenarioSetup): FamilyProfileBlock {
  return {
    family_id: 'eval-family',
    family_name: setup.family_name,
    timezone: setup.timezone || RUNNER_TZ_DEFAULT,
    parents: setup.parents.map(p => ({ id: p.id, name: p.name, role: p.role })),
    children: setup.children.map(c => ({
      id: c.id,
      name: c.name,
      birth_date: c.birth_date ?? null,
      allergies: c.allergies ?? [],
      medical_notes: c.medical_notes ?? null,
      personality_notes: c.personality_notes ?? null,
    })),
    support_contacts: setup.support_contacts.map(s => ({
      id: s.id,
      name: s.name,
      relationship: s.relationship,
      consent_status: s.consent_status,
    })),
  };
}

function buildMomentBlock(args: {
  setup: ScenarioSetup;
  history: { sender: string; role: 'parent' | 'nanny'; text: string; at: string }[];
  triggering_message_index: number;
}): MomentContextBlock {
  const triggeringMsg = args.history[args.history.length - 1];
  return {
    trigger: {
      type: 'message',
      moment: null,
      local_time_iso: new Date().toISOString(),
      local_day_label: new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      triggering_message_id: `eval-msg-${args.triggering_message_index}`,
      triggering_message_preview: triggeringMsg.text,
    },
    upcoming_events: args.setup.upcoming_events.map(e => ({
      id: e.id,
      title: e.title,
      date_start: e.date_start,
      date_end: e.date_end ?? null,
      location: e.location ?? null,
      assigned_to: e.assigned_to ?? null,
      child_id: e.child_id ?? null,
      status: e.status ?? 'confirmed',
    })),
    pending_tasks: args.setup.pending_tasks.map(t => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date ?? null,
      assigned_to: t.assigned_to ?? null,
      priority: t.priority ?? 'normal',
      child_id: t.child_id ?? null,
      status: t.status ?? 'pending',
    })),
    active_medications: args.setup.active_medications.map(m => ({
      id: m.id,
      medication_name: m.medication_name,
      child_name: m.child_name,
      schedule_times: m.schedule_times ?? [],
      frequency: m.frequency ?? null,
      end_date: m.end_date ?? null,
    })),
    recent_messages: args.history,
    patterns: args.setup.patterns,
    preferences: args.setup.preferences,
    learning_queue: args.setup.learning_queue.map(l => ({
      topic: l.topic,
      urgency: l.urgency,
      question_text: l.question_text ?? null,
      context_required: {},
    })),
    emotional_signal_last_48h: args.setup.emotional_signal_last_48h ?? null,
  };
}
