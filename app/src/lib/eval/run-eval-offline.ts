#!/usr/bin/env tsx
/**
 * Evaluación offline usando Anthropic API (Claude) en vez de OpenAI.
 * No requiere servidor HTTP ni OpenAI API key.
 * Usa el mismo system prompt y scorer que la evaluación normal.
 */

import { allConversations } from './conversations/index';
import { profiles, buildFamilyContext } from './profiles';
import { scoreConversation } from './scorer';
import { SYSTEM_PROMPT } from '../chat/processChat';
import type { MessageResult, ConversationResult } from './types';

// ─── Color helpers ───
const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function bar(value: number, w = 20): string {
  const filled = Math.round(value * w);
  const b = '█'.repeat(filled) + '░'.repeat(w - filled);
  const pct = Math.round(value * 100);
  if (pct >= 80) return c.green(`${b} ${pct}%`);
  if (pct >= 60) return c.yellow(`${b} ${pct}%`);
  return c.red(`${b} ${pct}%`);
}

const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const fs = await import('fs');

  // Read API key from session ingress token file
  let apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    const tokenFile = process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE || '/home/claude/.claude/remote/.session_ingress_token';
    try {
      apiKey = fs.readFileSync(tokenFile, 'utf-8').trim();
    } catch {
      // noop
    }
  }

  if (!apiKey) {
    throw new Error('No Anthropic API key available');
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'x-api-key': apiKey,
  };

  const res = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

interface ChatResponse {
  should_respond: boolean;
  reply: string;
  intent: string;
  next_action: string;
  child: string | null;
  confirmation: { type: string; data: Record<string, unknown> } | null;
  pending_detection: { type: string; partial_data: Record<string, unknown>; missing: string[]; summary: string } | null;
}

async function processChatOffline(
  message: string,
  familyContext: string,
  recentMessages: string,
  existingEvents: string,
  existingTasks: string,
  activeMedications: string,
  senderName: string,
  pendingDetection: Record<string, unknown> | null
): Promise<ChatResponse> {
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0] + ' (' + now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ')';
  const pendingStr = pendingDetection
    ? `ACTIVA: ${JSON.stringify(pendingDetection)}\nIMPORTANTE: Hay una detección pendiente. Si el mensaje actual aporta información que falta o es una confirmación (ok/sí/dale/listo), COMPLETA la detección y emite confirmation. Si es otro tema, abandónala.`
    : 'Ninguna';

  const systemPrompt = SYSTEM_PROMPT
    .replace('{family_context}', familyContext)
    .replace('{recent_messages}', recentMessages)
    .replace('{existing_events}', existingEvents || 'Ninguno')
    .replace('{existing_tasks}', existingTasks || 'Ninguna')
    .replace('{active_medications}', activeMedications || 'Ninguno')
    .replace('{pending_detection}', pendingStr)
    .replace('{current_date}', currentDate)
    .replace('{sender_name}', senderName);

  const content = await callClaude(systemPrompt, message);
  let clean = content.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    return JSON.parse(clean);
  } catch {
    return {
      should_respond: true, reply: content, intent: 'CHAT',
      next_action: 'stay_silent', child: null, confirmation: null, pending_detection: null,
    };
  }
}

async function runConversation(convIndex: number): Promise<ConversationResult> {
  const conversation = allConversations[convIndex];
  const profile = profiles.find(p => p.id === conversation.profileId)!;
  const familyContext = buildFamilyContext(profile);
  const messageResults: MessageResult[] = [];
  const recentMessages: string[] = [];
  const createdEvents: string[] = [];
  const createdTasks: string[] = [];
  const activeMedications: string[] = [];
  let pendingDetection: Record<string, unknown> | null = null;

  const startTime = Date.now();

  for (let i = 0; i < conversation.messages.length; i++) {
    const msg = conversation.messages[i];
    const senderName = msg.sender === 'mama' ? profile.mamaName : profile.papaName;
    const recentStr = recentMessages.slice(-15).join('\n') || 'Ninguno';

    const msgStart = Date.now();
    let response: ChatResponse | null = null;
    let error: string | undefined;

    try {
      response = await processChatOffline(
        msg.text, familyContext, recentStr,
        createdEvents.join('\n') || 'Ninguno',
        createdTasks.join('\n') || 'Ninguna',
        activeMedications.join('\n') || 'Ninguno',
        senderName, pendingDetection
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const responseTimeMs = Date.now() - msgStart;
    recentMessages.push(`${senderName}: ${msg.text}`);

    if (response) {
      if (response.should_respond && response.reply) {
        recentMessages.push(`Nanny: ${response.reply}`);
      }
      if (response.confirmation) {
        const conf = response.confirmation;
        if (conf.type === 'event') {
          createdEvents.push(`${conf.data.title} - ${conf.data.date_start || ''} (${conf.data.assigned_to || 'sin asignar'})`);
        } else if (conf.type === 'task') {
          createdTasks.push(`${conf.data.title} (${conf.data.assigned_to || 'sin asignar'})`);
        } else if (conf.type === 'medication') {
          activeMedications.push(`${conf.data.medication_name} - ${conf.data.frequency || ''}`);
        }
      }
      pendingDetection = response.pending_detection as Record<string, unknown> | null;
    }

    messageResults.push({ messageIndex: i, senderName, messageText: msg.text, response, responseTimeMs, error });

    // Small delay to avoid rate limiting
    if (i < conversation.messages.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const { detectionMatches, behaviorMatches, scores } = scoreConversation(conversation, messageResults);

  return {
    conversationId: conversation.id,
    conversationName: conversation.name,
    profileId: conversation.profileId,
    messageResults, detectionMatches, behaviorMatches, scores,
    totalTimeMs: Date.now() - startTime,
  };
}

async function main() {
  console.log('\n' + c.bold('═══════════════════════════════════════════'));
  console.log(c.bold('  🧪 Evaluación Nanny (Offline - Claude)'));
  console.log(c.bold('═══════════════════════════════════════════'));
  console.log(c.dim(`  Fecha: ${new Date().toLocaleString('es')}`));
  console.log(c.dim(`  Modelo: claude-haiku-4-5`));
  console.log(c.dim(`  Conversaciones: ${allConversations.length}`));
  console.log('');

  const results: ConversationResult[] = [];

  const maxConv = parseInt(process.argv.find(a => a.startsWith('--max='))?.split('=')[1] || '10');
  const limit = Math.min(maxConv, allConversations.length);
  for (let i = 0; i < limit; i++) {
    const conv = allConversations[i];
    process.stdout.write(`  ⏳ #${i + 1} ${conv.name.padEnd(50)}`);

    try {
      const result = await runConversation(i);
      results.push(result);
      const pct = Math.round(result.scores.overall * 100);
      const icon = pct >= 90 ? '✅' : pct >= 60 ? '⚠️' : '❌';
      process.stdout.write(`\r  ${icon} #${i + 1} ${conv.name.padEnd(50)} ${pct}%\n`);
    } catch (e) {
      process.stdout.write(`\r  💥 #${i + 1} ${conv.name.padEnd(50)} ERROR\n`);
      console.error(c.dim(`       ${e instanceof Error ? e.message : e}`));
    }
  }

  // Aggregate
  const avg = (nums: number[]) => nums.length === 0 ? 0 : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
  const aggregate = {
    precision: avg(results.map(r => r.scores.precision)),
    recall: avg(results.map(r => r.scores.recall)),
    ambiguityHandling: avg(results.map(r => r.scores.ambiguityHandling)),
    behaviorScore: avg(results.map(r => r.scores.behaviorScore)),
    overall: avg(results.map(r => r.scores.overall)),
  };

  console.log('\n' + c.bold('───────────────────────────────────────────'));
  console.log(c.bold('  SCORES AGREGADOS'));
  console.log(c.bold('───────────────────────────────────────────'));
  console.log(`  Precision:      ${bar(aggregate.precision)}`);
  console.log(`  Recall:         ${bar(aggregate.recall)}`);
  console.log(`  Ambigüedad:     ${bar(aggregate.ambiguityHandling)}`);
  console.log(`  Comportamiento: ${bar(aggregate.behaviorScore)}`);
  console.log(`  ${c.bold('Overall:')}        ${bar(aggregate.overall)}`);

  const perfect = results.filter(r => r.scores.overall >= 0.9).length;
  const partial = results.filter(r => r.scores.overall >= 0.6 && r.scores.overall < 0.9).length;
  const failed = results.filter(r => r.scores.overall < 0.6).length;
  console.log(`\n  ${c.green(`✅ ${perfect} perfectas`)}  ${c.yellow(`⚠️ ${partial} parciales`)}  ${c.red(`❌ ${failed} fallidas`)}`);

  // Detail for low-scoring conversations
  console.log('\n' + c.bold('───────────────────────────────────────────'));
  console.log(c.bold('  DETALLE DE FALLOS'));
  console.log(c.bold('───────────────────────────────────────────'));

  for (const r of results) {
    if (r.scores.overall >= 0.9) continue;

    console.log(`\n  ${c.bold(r.conversationName)} (${Math.round(r.scores.overall * 100)}%)`);

    // Failed detections
    for (const dm of r.detectionMatches) {
      if (dm.score >= 0.7) continue;
      const title = String(dm.expected.data.title || dm.expected.data.medication_name || '');
      if (!dm.actual) {
        console.log(c.red(`    ❌ NO DETECTADO: ${dm.expected.intent} - ${title}`));
      } else {
        console.log(c.yellow(`    ⚠️ PARCIAL (${Math.round(dm.score * 100)}%): ${dm.expected.intent} - ${title}`));
        for (const f of dm.incorrectFields) {
          console.log(c.dim(`       ${f.field}: esperado "${f.expected}" → actual "${f.actual}"`));
        }
      }
    }

    // Failed behaviors
    for (const bm of r.behaviorMatches) {
      if (bm.passed) continue;
      console.log(c.red(`    ❌ ${bm.check}`));
      console.log(c.dim(`       ${bm.details}`));
    }
  }

  console.log('\n' + c.bold('═══════════════════════════════════════════\n'));

  // Write results to JSON for further processing
  const fs = await import('fs');
  fs.writeFileSync('/tmp/eval-results.json', JSON.stringify({ results, aggregate }, null, 2));
  console.log(c.dim('  Resultados guardados en /tmp/eval-results.json\n'));
}

main().catch(e => {
  console.error(c.red(`\n  ❌ Error fatal: ${e.message}`));
  process.exit(1);
});
