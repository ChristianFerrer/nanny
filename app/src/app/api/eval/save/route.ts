import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const run = await req.json();

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

    return NextResponse.json({ success: true, id: run.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
