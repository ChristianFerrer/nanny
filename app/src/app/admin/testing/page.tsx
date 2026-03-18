'use client';

import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, RefreshCw, ChevronRight, TrendingUp, TrendingDown, Play, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface EvalRun {
  id: string;
  timestamp: string;
  prompt_version: string;
  model: string;
  aggregate_scores: {
    precision: number;
    recall: number;
    ambiguityHandling: number;
    behaviorScore: number;
    overall: number;
  };
  total_conversations: number;
  perfect_conversations: number;
  partial_conversations: number;
  failed_conversations: number;
  total_time_ms: number;
}

interface ConvProgress {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  score?: number;
  error?: string;
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 text-gray-400">{label}</span>
      <div className="flex-1 bg-gray-700 rounded-full h-3 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-xs">{pct}%</span>
    </div>
  );
}

export default function TestingDashboard() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Eval runner state
  const [running, setRunning] = useState(false);
  const [convProgress, setConvProgress] = useState<ConvProgress[]>([]);
  const [runResult, setRunResult] = useState<{
    aggregate: EvalRun['aggregate_scores'];
    savedId: string | null;
    totalTimeMs: number;
  } | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/eval/runs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRuns(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  async function startEvaluation() {
    setRunning(true);
    setRunResult(null);
    setConvProgress([]);
    setError(null);

    try {
      const res = await fetch('/api/eval/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSE(eventType, data);
            } catch {
              // ignore parse errors
            }
            eventType = '';
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error ejecutando evaluación');
    } finally {
      setRunning(false);
      loadRuns();
    }
  }

  function handleSSE(event: string, data: Record<string, unknown>) {
    if (event === 'start') {
      const names = data.names as string[];
      setConvProgress(names.map(name => ({ name, status: 'pending' })));
    } else if (event === 'progress') {
      const index = data.index as number;
      const status = data.status as ConvProgress['status'];
      const score = data.score as number | undefined;
      const err = data.error as string | undefined;
      setConvProgress(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status, score, error: err };
        return updated;
      });
    } else if (event === 'done') {
      setRunResult({
        aggregate: data.aggregate as EvalRun['aggregate_scores'],
        savedId: data.savedId as string | null,
        totalTimeMs: data.totalTimeMs as number,
      });
    }
  }

  const latest = runs[0];
  const previous = runs[1];
  const trend = latest && previous
    ? latest.aggregate_scores.overall - previous.aggregate_scores.overall
    : null;

  const completedCount = convProgress.filter(c => c.status === 'done' || c.status === 'error').length;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/chat" className="text-gray-400 hover:text-white">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-bold">🧪 Testing Nanny</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startEvaluation}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors"
          >
            {running ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Ejecutando...
              </>
            ) : (
              <>
                <Play size={14} />
                Ejecutar
              </>
            )}
          </button>
          <button
            onClick={loadRuns}
            disabled={running}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Live evaluation progress */}
      {(running || convProgress.length > 0) && !runResult && (
        <div className="bg-gray-800 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Evaluación en curso</p>
            <span className="text-xs text-gray-400">
              {completedCount}/{convProgress.length}
            </span>
          </div>

          {/* Overall progress bar */}
          <div className="bg-gray-700 rounded-full h-2 overflow-hidden mb-3">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${convProgress.length > 0 ? (completedCount / convProgress.length) * 100 : 0}%` }}
            />
          </div>

          <div className="space-y-1.5">
            {convProgress.map((conv, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-5 text-center">
                  {conv.status === 'pending' && <span className="text-gray-600">-</span>}
                  {conv.status === 'running' && <Loader2 size={12} className="animate-spin text-cyan-400" />}
                  {conv.status === 'done' && (
                    <span>{(conv.score ?? 0) >= 0.9 ? '✅' : (conv.score ?? 0) >= 0.6 ? '⚠️' : '❌'}</span>
                  )}
                  {conv.status === 'error' && '💥'}
                </span>
                <span className={`flex-1 ${conv.status === 'running' ? 'text-cyan-300' : conv.status === 'pending' ? 'text-gray-600' : 'text-gray-300'}`}>
                  {conv.name}
                </span>
                {conv.score !== undefined && (
                  <span className={`font-mono ${(conv.score) >= 0.8 ? 'text-green-400' : (conv.score) >= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {Math.round(conv.score * 100)}%
                  </span>
                )}
                {conv.error && <span className="text-red-400 truncate max-w-[120px]">{conv.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evaluation result summary */}
      {runResult && (
        <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-green-300">Evaluación completada</p>
            <span className="text-xs text-gray-400">{(runResult.totalTimeMs / 1000).toFixed(1)}s</span>
          </div>
          <div className="space-y-2 mb-3">
            <ScoreBar value={runResult.aggregate.precision} label="Precision" />
            <ScoreBar value={runResult.aggregate.recall} label="Recall" />
            <ScoreBar value={runResult.aggregate.ambiguityHandling} label="Ambiguedad" />
            <ScoreBar value={runResult.aggregate.behaviorScore} label="Comportamiento" />
            <ScoreBar value={runResult.aggregate.overall} label="Overall" />
          </div>
          <div className="flex items-center justify-between text-xs">
            <div className="space-y-1">
              {convProgress.map((conv, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span>{(conv.score ?? 0) >= 0.9 ? '✅' : (conv.score ?? 0) >= 0.6 ? '⚠️' : '❌'}</span>
                  <span className="text-gray-400">{conv.name}</span>
                  <span className="font-mono text-gray-300">{conv.score !== undefined ? `${Math.round(conv.score * 100)}%` : ''}</span>
                </div>
              ))}
            </div>
          </div>
          {runResult.savedId && (
            <Link
              href={`/admin/testing/${runResult.savedId}`}
              className="mt-3 block text-center text-xs text-cyan-400 hover:text-cyan-300"
            >
              Ver detalle completo →
            </Link>
          )}
          <button
            onClick={() => { setRunResult(null); setConvProgress([]); }}
            className="mt-2 w-full text-xs text-gray-500 hover:text-gray-400"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Latest run summary */}
      {latest && (
        <div className="bg-gray-800 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-gray-400">Última evaluación guardada</p>
              <p className="text-sm text-gray-300">
                {new Date(latest.timestamp).toLocaleString('es')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">{latest.prompt_version} · {latest.model}</p>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold">
                  {Math.round(latest.aggregate_scores.overall * 100)}%
                </span>
                {trend !== null && trend !== 0 && (
                  <span className={`text-xs flex items-center gap-0.5 ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {trend > 0 ? '+' : ''}{Math.round(trend * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 mb-3">
            <ScoreBar value={latest.aggregate_scores.precision} label="Precision" />
            <ScoreBar value={latest.aggregate_scores.recall} label="Recall" />
            <ScoreBar value={latest.aggregate_scores.ambiguityHandling} label="Ambiguedad" />
            <ScoreBar value={latest.aggregate_scores.behaviorScore} label="Comportamiento" />
          </div>

          <div className="flex gap-3 text-xs">
            <span className="text-green-400">✅ {latest.perfect_conversations} perfectas</span>
            <span className="text-yellow-400">⚠️ {latest.partial_conversations} parciales</span>
            <span className="text-red-400">❌ {latest.failed_conversations} fallidas</span>
          </div>
        </div>
      )}

      {/* Run history */}
      <h2 className="text-sm font-semibold text-gray-400 mb-2">Historial de evaluaciones</h2>
      <div className="space-y-2">
        {runs.map((run, i) => {
          const pct = Math.round(run.aggregate_scores.overall * 100);
          const prevRun = runs[i + 1];
          const diff = prevRun
            ? Math.round((run.aggregate_scores.overall - prevRun.aggregate_scores.overall) * 100)
            : null;

          return (
            <Link
              key={run.id}
              href={`/admin/testing/${run.id}`}
              className="flex items-center justify-between bg-gray-800 rounded-lg p-3 hover:bg-gray-750 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {new Date(run.timestamp).toLocaleDateString('es', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="text-xs text-gray-500">{run.prompt_version}</span>
                </div>
                <div className="flex gap-2 text-xs text-gray-500 mt-1">
                  <span>✅{run.perfect_conversations}</span>
                  <span>⚠️{run.partial_conversations}</span>
                  <span>❌{run.failed_conversations}</span>
                  <span>· {(run.total_time_ms / 1000).toFixed(0)}s</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <span className={`text-lg font-bold ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {pct}%
                  </span>
                  {diff !== null && diff !== 0 && (
                    <p className={`text-xs ${diff > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {diff > 0 ? '+' : ''}{diff}%
                    </p>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-600" />
              </div>
            </Link>
          );
        })}

        {runs.length === 0 && !loading && (
          <div className="text-center text-gray-500 py-8">
            <p className="text-lg mb-2">Sin evaluaciones aún</p>
            <p className="text-sm">Usa el botón &quot;Ejecutar&quot; o corre <code className="bg-gray-800 px-2 py-1 rounded text-xs">npm run test:eval -- --save</code></p>
          </div>
        )}
      </div>
    </div>
  );
}
