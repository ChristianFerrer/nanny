#!/usr/bin/env tsx
/**
 * Script principal para ejecutar evaluación de Nanny desde terminal.
 *
 * Uso:
 *   npm run test:eval                         # contra localhost:3000
 *   npm run test:eval -- --url https://...    # contra URL específica
 *   npm run test:eval -- --diagnose           # incluir diagnóstico AI
 *   npm run test:eval -- --save               # guardar en Supabase
 *   npm run test:eval -- --conversation 3     # solo conversación #3
 */

import { allConversations } from './conversations/index';
import { runConversation, runAllConversations } from './runner';
import { diagnoseResults } from './diagnosis';
import type { ConversationResult, EvaluationRun } from './types';

// ─── Color helpers ───
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function progressBar(value: number, width = 20): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pct = Math.round(value * 100);
  if (pct >= 80) return colors.green(`${bar} ${pct}%`);
  if (pct >= 60) return colors.yellow(`${bar} ${pct}%`);
  return colors.red(`${bar} ${pct}%`);
}

function statusIcon(score: number): string {
  if (score >= 0.9) return colors.green('✅');
  if (score >= 0.6) return colors.yellow('⚠️');
  return colors.red('❌');
}

function printConversationDetail(result: ConversationResult) {
  console.log(`\n  ${colors.bold('Detecciones:')}`);
  for (const dm of result.detectionMatches) {
    const icon = dm.actual ? (dm.score >= 0.7 ? '✅' : '⚠️') : '❌';
    const typeName = dm.expected.intent || dm.expected.type;
    const title = String(dm.expected.data.title || dm.expected.data.medication_name || '');
    console.log(`    ${icon} ${typeName} - ${title} (score: ${Math.round(dm.score * 100)}%)`);

    if (dm.incorrectFields.length > 0) {
      for (const f of dm.incorrectFields) {
        console.log(colors.dim(`       ↳ ${f.field}: esperado "${f.expected}" → actual "${f.actual}"`));
      }
    }
    if (!dm.actual) {
      console.log(colors.dim('       ↳ No detectado por Nanny'));
    }
  }

  console.log(`\n  ${colors.bold('Comportamiento:')}`);
  for (const bm of result.behaviorMatches) {
    const icon = bm.passed ? '✅' : '❌';
    console.log(`    ${icon} ${bm.check}`);
    if (!bm.passed) {
      console.log(colors.dim(`       ↳ ${bm.details}`));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const baseUrl = getArg(args, '--url') || 'http://localhost:3000';
  const shouldDiagnose = args.includes('--diagnose');
  const shouldSave = args.includes('--save');
  const convIndex = getArg(args, '--conversation');
  const verbose = args.includes('--verbose');

  console.log('\n' + colors.bold('═══════════════════════════════════════════'));
  console.log(colors.bold('  🧪 Evaluación Nanny'));
  console.log(colors.bold('═══════════════════════════════════════════'));
  console.log(colors.dim(`  URL: ${baseUrl}`));
  console.log(colors.dim(`  Fecha: ${new Date().toLocaleString('es')}`));
  console.log(colors.dim(`  Modelo: gpt-4o-mini`));

  // Select conversations
  let conversations = allConversations;
  if (convIndex) {
    const idx = parseInt(convIndex) - 1;
    if (idx >= 0 && idx < allConversations.length) {
      conversations = [allConversations[idx]];
      console.log(colors.dim(`  Conversación: #${convIndex} ${conversations[0].name}`));
    } else {
      console.error(colors.red(`\n  ❌ Conversación #${convIndex} no existe (1-${allConversations.length})`));
      process.exit(1);
    }
  }

  console.log(colors.dim(`  Conversaciones: ${conversations.length}`));
  console.log('');

  // Run evaluation (direct calls to processChat, no HTTP server needed)
  const { results, aggregate, totalTimeMs } = await runAllConversations(conversations, {
    baseUrl,
    delayBetweenMessages: 300,
    useFetch: false,
  });

  // Print results
  console.log(colors.bold('───────────────────────────────────────────'));
  console.log(colors.bold('  RESULTADOS'));
  console.log(colors.bold('───────────────────────────────────────────'));
  console.log('');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const icon = statusIcon(r.scores.overall);
    const pct = Math.round(r.scores.overall * 100);
    const time = (r.totalTimeMs / 1000).toFixed(1);
    console.log(`  ${icon} ${colors.bold(`#${i + 1}`)} ${r.conversationName.padEnd(45)} ${pct}% ${colors.dim(`(${time}s)`)}`);

    if (verbose || pct < 80) {
      printConversationDetail(r);
      console.log('');
    }
  }

  // Aggregate scores
  console.log('\n' + colors.bold('───────────────────────────────────────────'));
  console.log(colors.bold('  SCORES AGREGADOS'));
  console.log(colors.bold('───────────────────────────────────────────'));
  console.log(`  Precision:    ${progressBar(aggregate.precision)}`);
  console.log(`  Recall:       ${progressBar(aggregate.recall)}`);
  console.log(`  Ambigüedad:   ${progressBar(aggregate.ambiguityHandling)}`);
  console.log(`  Comportamiento: ${progressBar(aggregate.behaviorScore)}`);
  console.log(`  ${colors.bold('Overall:')}\t${progressBar(aggregate.overall)}`);

  const perfect = results.filter(r => r.scores.overall >= 0.9).length;
  const partial = results.filter(r => r.scores.overall >= 0.6 && r.scores.overall < 0.9).length;
  const failed = results.filter(r => r.scores.overall < 0.6).length;

  console.log(`\n  ${colors.green(`✅ ${perfect} perfectas`)}  ${colors.yellow(`⚠️ ${partial} parciales`)}  ${colors.red(`❌ ${failed} fallidas`)}`);
  console.log(colors.dim(`  Tiempo total: ${(totalTimeMs / 1000).toFixed(1)}s`));

  // Diagnosis
  if (shouldDiagnose) {
    console.log('\n' + colors.bold('───────────────────────────────────────────'));
    console.log(colors.bold('  🔍 DIAGNÓSTICO AI'));
    console.log(colors.bold('───────────────────────────────────────────'));
    console.log(colors.dim('  Analizando fallos con GPT-4o...'));

    try {
      // Read the system prompt from the shared chat module
      const { readFileSync } = await import('fs');
      const chatModule = readFileSync(
        new URL('../chat/processChat.ts', import.meta.url),
        'utf-8'
      );
      const promptMatch = chatModule.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
      const systemPrompt = promptMatch?.[1] || 'No se pudo leer el prompt';

      const diagnosis = await diagnoseResults(results, {
        classifier: systemPrompt.substring(0, 2000),
        extractor: systemPrompt.substring(2000),
      });

      console.log(`\n  ${colors.bold('Resumen:')} ${diagnosis.summary}`);

      if (diagnosis.failurePatterns.length > 0) {
        console.log(`\n  ${colors.bold('Patrones de fallo:')}`);
        for (const p of diagnosis.failurePatterns) {
          console.log(`    📋 ${colors.bold(p.category)} (${p.failureCount} fallos)`);
          console.log(colors.dim(`       ${p.description}`));
          console.log(colors.dim(`       Afecta: ${p.affectedConversations.join(', ')}`));
        }
      }

      if (diagnosis.proposedAdjustments.length > 0) {
        console.log(`\n  ${colors.bold('Ajustes propuestos:')}`);
        for (const a of diagnosis.proposedAdjustments) {
          const riskColor = a.riskLevel === 'bajo' ? colors.green : a.riskLevel === 'medio' ? colors.yellow : colors.red;
          console.log(`\n    🔧 ${colors.bold(a.pattern)}`);
          console.log(`       Riesgo: ${riskColor(a.riskLevel)}`);
          console.log(colors.dim(`       Sección actual: "${a.currentPromptSection.substring(0, 80)}..."`));
          console.log(colors.cyan(`       Propuesta: "${a.proposedChange.substring(0, 120)}..."`));
          console.log(colors.dim(`       Impacto esperado: ${a.expectedImpact}`));
        }
      }
    } catch (e) {
      console.error(colors.red(`  Error en diagnóstico: ${e instanceof Error ? e.message : e}`));
    }
  }

  // Save to Supabase
  if (shouldSave) {
    console.log('\n' + colors.dim('  Guardando resultados en Supabase...'));
    try {
      await saveEvaluationRun(results, aggregate, totalTimeMs, baseUrl);
      console.log(colors.green('  ✅ Guardado exitosamente'));
    } catch (e) {
      console.error(colors.red(`  ❌ Error guardando: ${e instanceof Error ? e.message : e}`));
    }
  }

  console.log('\n' + colors.bold('═══════════════════════════════════════════\n'));

  // Exit with error code if overall score is too low
  if (aggregate.overall < 0.5) process.exit(1);
}

async function saveEvaluationRun(
  results: ConversationResult[],
  aggregate: ConversationResult['scores'],
  totalTimeMs: number,
  baseUrl: string
) {
  const run: EvaluationRun = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    promptVersion: 'current',
    model: 'gpt-4o-mini',
    conversationResults: results,
    aggregateScores: aggregate,
    totalConversations: results.length,
    perfectConversations: results.filter(r => r.scores.overall >= 0.9).length,
    partialConversations: results.filter(r => r.scores.overall >= 0.6 && r.scores.overall < 0.9).length,
    failedConversations: results.filter(r => r.scores.overall < 0.6).length,
    totalTimeMs,
  };

  // Save via API
  const response = await fetch(`${baseUrl}/api/eval/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(run),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

main().catch(e => {
  console.error(colors.red(`\n  ❌ Error fatal: ${e.message}`));
  process.exit(1);
});
