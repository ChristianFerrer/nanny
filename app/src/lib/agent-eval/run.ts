/**
 * CLI entry point del eval del decision agent.
 *
 * Uso:
 *   npm run test:agent-eval                  # corre todos los escenarios
 *   npm run test:agent-eval -- --verbose     # con log de cada turno
 *   npm run test:agent-eval -- corrections   # solo el escenario "corrections-and-teachings"
 *
 * Requiere ANTHROPIC_API_KEY en el entorno.
 *
 * Costo aprox por corrida completa: ~$0.50-1.00.
 * Wall clock: ~3-7 minutos (Sonnet 4.6 latency).
 */

import { runEval } from './runner';
import { ALL_SCENARIOS } from './scenarios';
import type { EvalRunResult } from './types';

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const filterIds = args
    .filter(a => !a.startsWith('-'))
    .flatMap(a => ALL_SCENARIOS.filter(s => s.id.includes(a)).map(s => s.id));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY no está configurada en el entorno.');
    console.error('Cargá tu .env.local antes de correr:');
    console.error('  set -a && source .env.local && set +a && npm run test:agent-eval');
    process.exit(1);
  }

  console.log('🔬 Agent Eval — corriendo escenarios...');
  if (filterIds.length > 0) console.log(`   Filtro: ${filterIds.join(', ')}`);
  if (verbose) console.log('   Verbose mode ON');

  const result = await runEval({ scenarioIds: filterIds, verbose });
  printResult(result);

  const exitCode = result.total_fail > 0 ? 1 : 0;
  process.exit(exitCode);
}

function printResult(r: EvalRunResult) {
  console.log('\n' + '═'.repeat(70));
  console.log('📊 RESULTADOS');
  console.log('═'.repeat(70));

  for (const s of r.scenarios) {
    const passRate = s.messages.length > 0 ? (s.pass_count / s.messages.length) * 100 : 0;
    console.log(`\n${s.pass_count === s.messages.length ? '✅' : '⚠️'} ${s.name}`);
    console.log(`   ${s.pass_count}/${s.messages.length} pass (${passRate.toFixed(0)}%)`);
    console.log(`   ack_rate=${pct(s.ack_rate)}  silence_rate=${pct(s.silence_rate)}  capture=${pct(s.capture_precision)}  resolves=${pct(s.resolves_correctness)}`);
    console.log(`   cost=$${s.total_cost_usd.toFixed(4)}  total_latency=${(s.total_latency_ms/1000).toFixed(1)}s`);

    // Listar fallos por mensaje
    for (const m of s.messages) {
      const dims = {
        ack: m.ack_correct, silence: m.silence_correct,
        capture: m.capture_correct, resolves: m.resolves_correct,
        content: m.message_content_correct,
      };
      const failed = Object.entries(dims).filter(([, v]) => v === false).map(([k]) => k);
      if (failed.length > 0) {
        console.log(`     ✗ msg ${m.message_index + 1}: "${m.text.slice(0, 50)}${m.text.length > 50 ? '…' : ''}"`);
        console.log(`        failed dims: ${failed.join(', ')}`);
        for (const n of m.notes) console.log(`        - ${n}`);
      }
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log('GLOBAL');
  console.log('─'.repeat(70));
  console.log(`Messages:           ${r.total_messages}`);
  console.log(`Pass / Fail:        ${r.total_pass} / ${r.total_fail}`);
  console.log(`Ack rate:           ${pct(r.global_ack_rate)}`);
  console.log(`Silence rate:       ${pct(r.global_silence_rate)}`);
  console.log(`Capture precision:  ${pct(r.global_capture_precision)}`);
  console.log(`Resolves correct:   ${pct(r.global_resolves_correctness)}`);
  console.log(`Total cost:         $${r.total_cost_usd.toFixed(4)}`);
  console.log(`Avg latency:        ${(r.avg_latency_ms/1000).toFixed(2)}s`);
  console.log('═'.repeat(70));
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
