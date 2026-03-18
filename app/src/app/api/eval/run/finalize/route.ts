import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ConversationResult, EvaluationRun } from '@/lib/eval/types';

/**
 * POST: recibe todos los resultados de conversación y guarda el run completo.
 * Body: { results: ConversationResult[], totalTimeMs: number }
 */
export async function POST(req: NextRequest) {
  try {
    const { results, totalTimeMs } = (await req.json()) as {
      results: ConversationResult[];
      totalTimeMs: number;
    };

    if (!results || results.length === 0) {
      return NextResponse.json({ error: 'No hay resultados' }, { status: 400 });
    }

    const avg = (nums: number[]) =>
      nums.length === 0 ? 0 : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;

    const aggregate = {
      precision: avg(results.map(r => r.scores.precision)),
      recall: avg(results.map(r => r.scores.recall)),
      ambiguityHandling: avg(results.map(r => r.scores.ambiguityHandling)),
      behaviorScore: avg(results.map(r => r.scores.behaviorScore)),
      overall: avg(results.map(r => r.scores.overall)),
    };

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const { error } = await supabase.from('evaluation_runs').insert({
      id: run.id,
      timestamp: run.timestamp,
      prompt_version: run.promptVersion,
      model: run.model,
      conversation_results: run.conversationResults,
      aggregate_scores: run.aggregateScores,
      total_conversations: run.totalConversations,
      perfect_conversations: run.perfectConversations,
      partial_conversations: run.partialConversations,
      failed_conversations: run.failedConversations,
      total_time_ms: run.totalTimeMs,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: run.id,
      aggregate,
      totalConversations: run.totalConversations,
      perfectConversations: run.perfectConversations,
      partialConversations: run.partialConversations,
      failedConversations: run.failedConversations,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
