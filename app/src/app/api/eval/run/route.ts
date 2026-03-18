import { NextResponse } from 'next/server';
import { allConversations } from '@/lib/eval/conversations/index';
import { runConversation } from '@/lib/eval/runner';
import type { ConversationResult, EvaluationRun } from '@/lib/eval/types';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300; // 5 min max for Vercel

export async function POST() {
  const conversations = allConversations;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      send('start', {
        total: conversations.length,
        names: conversations.map(c => c.name),
      });

      const results: ConversationResult[] = [];
      const startTime = Date.now();

      for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i];
        send('progress', {
          index: i,
          name: conv.name,
          status: 'running',
        });

        try {
          const result = await runConversation(conv, {
            delayBetweenMessages: 200,
          });
          results.push(result);
          send('progress', {
            index: i,
            name: conv.name,
            status: 'done',
            score: result.scores.overall,
          });
        } catch (e) {
          send('progress', {
            index: i,
            name: conv.name,
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const totalTimeMs = Date.now() - startTime;

      // Aggregate scores
      const avg = (nums: number[]) =>
        nums.length === 0 ? 0 : Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;

      const aggregate = {
        precision: avg(results.map(r => r.scores.precision)),
        recall: avg(results.map(r => r.scores.recall)),
        ambiguityHandling: avg(results.map(r => r.scores.ambiguityHandling)),
        behaviorScore: avg(results.map(r => r.scores.behaviorScore)),
        overall: avg(results.map(r => r.scores.overall)),
      };

      // Save to Supabase
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      let savedId: string | null = null;

      if (supabaseUrl && supabaseKey) {
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

        if (!error) savedId = run.id;
      }

      send('done', {
        aggregate,
        totalConversations: results.length,
        perfectConversations: results.filter(r => r.scores.overall >= 0.9).length,
        partialConversations: results.filter(r => r.scores.overall >= 0.6 && r.scores.overall < 0.9).length,
        failedConversations: results.filter(r => r.scores.overall < 0.6).length,
        totalTimeMs,
        savedId,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
