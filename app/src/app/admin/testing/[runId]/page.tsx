'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface DetectionMatch {
  expected: {
    type: string;
    intent: string;
    data: Record<string, unknown>;
    ambiguousFields?: string[];
  };
  actual: { type: string; data: Record<string, unknown> } | null;
  score: number;
  correctFields: string[];
  incorrectFields: { field: string; expected: unknown; actual: unknown }[];
  ambiguousFields: string[];
}

interface BehaviorMatch {
  check: string;
  passed: boolean;
  details: string;
}

interface MessageResult {
  messageIndex: number;
  senderName: string;
  messageText: string;
  response: {
    should_respond: boolean;
    reply: string;
    intent: string;
    next_action: string;
    child: string | null;
    confirmation: { type: string; data: Record<string, unknown> } | null;
    pending_detection: Record<string, unknown> | null;
  } | null;
  responseTimeMs: number;
  error?: string;
}

interface ConversationResult {
  conversationId: string;
  conversationName: string;
  profileId: string;
  messageResults: MessageResult[];
  detectionMatches: DetectionMatch[];
  behaviorMatches: BehaviorMatch[];
  scores: {
    precision: number;
    recall: number;
    ambiguityHandling: number;
    behaviorScore: number;
    overall: number;
  };
  totalTimeMs: number;
}

interface RunData {
  id: string;
  timestamp: string;
  prompt_version: string;
  model: string;
  conversation_results: ConversationResult[];
  aggregate_scores: {
    precision: number;
    recall: number;
    ambiguityHandling: number;
    behaviorScore: number;
    overall: number;
  };
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-gray-400">{label}</span>
      <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-mono">{pct}%</span>
    </div>
  );
}

function ConversationCard({ result }: { result: ConversationResult }) {
  const [expanded, setExpanded] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const pct = Math.round(result.scores.overall * 100);
  const icon = pct >= 90 ? '✅' : pct >= 60 ? '⚠️' : '❌';

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-750"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{icon}</span>
          <div className="text-left">
            <p className="text-sm font-medium">{result.conversationName}</p>
            <p className="text-xs text-gray-500">{result.profileId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
            {pct}%
          </span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-700 pt-3">
          {/* Scores */}
          <div className="space-y-1.5 mb-4">
            <ScoreBar value={result.scores.precision} label="Precision" />
            <ScoreBar value={result.scores.recall} label="Recall" />
            <ScoreBar value={result.scores.ambiguityHandling} label="Ambigüedad" />
            <ScoreBar value={result.scores.behaviorScore} label="Comportam." />
          </div>

          {/* Detections */}
          <h4 className="text-xs font-semibold text-gray-400 mb-2">Detecciones</h4>
          <div className="space-y-2 mb-4">
            {result.detectionMatches.map((dm, i) => (
              <div key={i} className="bg-gray-900 rounded-lg p-2.5">
                <div className="flex items-start gap-2">
                  <span className="text-sm">{dm.actual ? (dm.score >= 0.7 ? '✅' : '⚠️') : '❌'}</span>
                  <div className="flex-1 text-xs">
                    <p className="font-medium">
                      {dm.expected.intent} – {String(dm.expected.data.title || dm.expected.data.medication_name || '')}
                    </p>
                    <p className="text-gray-500">Score: {Math.round(dm.score * 100)}%</p>
                    {dm.incorrectFields.length > 0 && (
                      <div className="mt-1 text-red-400">
                        {dm.incorrectFields.map((f, j) => (
                          <p key={j}>
                            {f.field}: esperado &quot;{String(f.expected)}&quot; → actual &quot;{String(f.actual)}&quot;
                          </p>
                        ))}
                      </div>
                    )}
                    {!dm.actual && <p className="text-red-400 mt-1">No detectado</p>}
                    {dm.ambiguousFields.length > 0 && (
                      <p className="text-yellow-500 mt-1">Ambiguo: {dm.ambiguousFields.join(', ')}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Behavior */}
          <h4 className="text-xs font-semibold text-gray-400 mb-2">Comportamiento</h4>
          <div className="space-y-1 mb-4">
            {result.behaviorMatches.map((bm, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span>{bm.passed ? '✅' : '❌'}</span>
                <div>
                  <p className={bm.passed ? 'text-gray-300' : 'text-red-400'}>{bm.check}</p>
                  {!bm.passed && <p className="text-gray-500">{bm.details}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Message-by-message */}
          <button
            onClick={() => setShowMessages(!showMessages)}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            {showMessages ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showMessages ? 'Ocultar' : 'Ver'} conversación mensaje por mensaje
          </button>

          {showMessages && (
            <div className="mt-3 space-y-2">
              {result.messageResults.map((mr) => (
                <div key={mr.messageIndex} className="bg-gray-900 rounded-lg p-2.5 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-cyan-400">{mr.senderName}</span>
                    <span className="text-gray-600">#{mr.messageIndex}</span>
                    <span className="text-gray-600">{mr.responseTimeMs}ms</span>
                  </div>
                  <p className="text-gray-300 mb-2">&quot;{mr.messageText}&quot;</p>

                  {mr.response && (
                    <div className="border-l-2 border-purple-600 pl-2 ml-1">
                      <div className="flex gap-2 text-gray-500 mb-1">
                        <span className="bg-gray-800 px-1.5 rounded">{mr.response.intent}</span>
                        <span className="bg-gray-800 px-1.5 rounded">{mr.response.next_action}</span>
                        {mr.response.child && <span className="bg-gray-800 px-1.5 rounded">{mr.response.child}</span>}
                      </div>
                      {mr.response.should_respond && (
                        <p className="text-purple-300">🤖 {mr.response.reply}</p>
                      )}
                      {mr.response.confirmation && (
                        <p className="text-green-400 mt-1">
                          ✓ Confirmation: {mr.response.confirmation.type} – {String((mr.response.confirmation.data as Record<string, unknown>).title || (mr.response.confirmation.data as Record<string, unknown>).medication_name || '')}
                        </p>
                      )}
                      {mr.response.pending_detection && (
                        <p className="text-yellow-400 mt-1">
                          ⏳ Pending: {String((mr.response.pending_detection as Record<string, unknown>).summary || JSON.stringify(mr.response.pending_detection).substring(0, 80))}
                        </p>
                      )}
                    </div>
                  )}

                  {mr.error && <p className="text-red-400">Error: {mr.error}</p>}
                  {mr.response && !mr.response.should_respond && (
                    <p className="text-gray-600 italic ml-3">— Nanny no respondió —</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRun() {
      try {
        const res = await fetch(`/api/eval/runs/${runId}`);
        if (res.ok) setRun(await res.json());
      } finally {
        setLoading(false);
      }
    }
    loadRun();
  }, [runId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p className="text-red-400">Evaluación no encontrada</p>
      </div>
    );
  }

  const pct = Math.round(run.aggregate_scores.overall * 100);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/admin/testing" className="text-gray-400 hover:text-white">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-lg font-bold">Evaluación</h1>
          <p className="text-xs text-gray-500">
            {new Date(run.timestamp).toLocaleString('es')} · {run.prompt_version} · {run.model}
          </p>
        </div>
      </div>

      {/* Overall score */}
      <div className="bg-gray-800 rounded-xl p-4 mb-4 text-center">
        <p className={`text-4xl font-bold ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
          {pct}%
        </p>
        <p className="text-xs text-gray-500 mt-1">Score global</p>
        <div className="mt-3 space-y-1.5">
          <ScoreBar value={run.aggregate_scores.precision} label="Precision" />
          <ScoreBar value={run.aggregate_scores.recall} label="Recall" />
          <ScoreBar value={run.aggregate_scores.ambiguityHandling} label="Ambigüedad" />
          <ScoreBar value={run.aggregate_scores.behaviorScore} label="Comportam." />
        </div>
      </div>

      {/* Conversations */}
      <h2 className="text-sm font-semibold text-gray-400 mb-2">
        Conversaciones ({run.conversation_results.length})
      </h2>
      <div className="space-y-2">
        {run.conversation_results.map((cr) => (
          <ConversationCard key={cr.conversationId} result={cr} />
        ))}
      </div>
    </div>
  );
}
