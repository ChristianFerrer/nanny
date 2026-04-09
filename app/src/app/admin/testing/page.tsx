'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowLeft, RefreshCw, ChevronRight, TrendingUp, TrendingDown, Play, Loader2, Square, Zap, Lock } from 'lucide-react';
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
    falsePositiveRate?: number;
    fieldAccuracy?: {
      dateAccuracy: number;
      ownerAccuracy: number;
      typeAccuracy: number;
    };
    overall: number;
  };
  total_conversations: number;
  perfect_conversations: number;
  partial_conversations: number;
  failed_conversations: number;
  total_time_ms: number;
}

interface ConvProgress {
  index: number;
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  score?: number;
  error?: string;
  totalMessages?: number;
  completedMessages?: number;
}

interface ConversationInfo {
  index: number;
  id: string;
  name: string;
  messageCount: number;
  messages: { sender: string; text: string }[];
}

/** Link que se bloquea cuando hay un proceso en ejecución */
function SafeLink({ href, locked, className, children }: {
  href: string;
  locked: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (locked) {
    return (
      <span className={`${className || ''} opacity-50 cursor-not-allowed`} title="Proceso en ejecución, espera a que termine">
        {children}
      </span>
    );
  }
  return <Link href={href} className={className}>{children}</Link>;
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 text-gray-400">{label}</span>
      <div className="flex-1 bg-gray-700 rounded-full h-3 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
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
  const abortRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Autopilot state — driven by DB job status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [autopilotJob, setAutopilotJob] = useState<Record<string, any> | null>(null);

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

  // On mount, check if there's an active autopilot job
  const checkAutopilotStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/eval/autopilot');
      if (!res.ok) return;
      const data = await res.json();
      if (data.job) {
        setAutopilotJob(data.job);
        if (data.active && !pollingRef.current) {
          startPolling();
        }
      }
    } catch {
      // ignore
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { checkAutopilotStatus(); }, [checkAutopilotStatus]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const autopilotRunning = autopilotJob?.status === 'running';
  const processRunning = running || autopilotRunning;
  useEffect(() => {
    if (!processRunning) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [processRunning]);

  async function startEvaluation() {
    setRunning(true);
    setRunResult(null);
    setConvProgress([]);
    setError(null);
    abortRef.current = false;

    const startTime = Date.now();

    try {
      // 1. Get available conversations
      const listRes = await fetch('/api/eval/run');
      if (!listRes.ok) throw new Error(`Error listando conversaciones: HTTP ${listRes.status}`);
      const conversations: ConversationInfo[] = await listRes.json();

      // 2. Initialize progress with message counts
      setConvProgress(conversations.map(c => ({
        index: c.index,
        name: c.name,
        status: 'pending',
        totalMessages: c.messageCount,
        completedMessages: 0,
      })));

      // 3. Run each conversation message-by-message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = [];

      for (let i = 0; i < conversations.length; i++) {
        if (abortRef.current) break;

        const conv = conversations[i];

        // Mark conversation as running
        setConvProgress(prev => prev.map((c, idx) =>
          idx === i ? { ...c, status: 'running', completedMessages: 0 } : c
        ));

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let state: any = null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let finalResult: any = null;

          for (let msgIdx = 0; msgIdx < conv.messageCount; msgIdx++) {
            if (abortRef.current) break;

            const res = await fetch('/api/eval/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conversationIndex: i,
                messageIndex: msgIdx,
                state,
              }),
            });

            if (!res.ok) {
              const errText = await res.text();
              throw new Error(errText);
            }

            const data = await res.json();

            // Update message progress
            setConvProgress(prev => prev.map((c, idx) =>
              idx === i ? { ...c, completedMessages: msgIdx + 1 } : c
            ));

            if (data.done) {
              finalResult = data.result;
            } else {
              state = data.state;
            }
          }

          if (finalResult) {
            results.push(finalResult);
            setConvProgress(prev => prev.map((c, idx) =>
              idx === i ? { ...c, status: 'done', score: finalResult.scores.overall } : c
            ));
          }
        } catch (e) {
          setConvProgress(prev => prev.map((c, idx) =>
            idx === i ? { ...c, status: 'error', error: e instanceof Error ? e.message : 'Error' } : c
          ));
        }
      }

      if (abortRef.current) {
        setError('Evaluación cancelada');
        return;
      }

      const totalTimeMs = Date.now() - startTime;

      // 4. Finalize: save results to Supabase
      if (results.length > 0) {
        try {
          const finalRes = await fetch('/api/eval/run/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results, totalTimeMs }),
          });

          if (finalRes.ok) {
            const finalData = await finalRes.json();
            setRunResult({
              aggregate: finalData.aggregate,
              savedId: finalData.id,
              totalTimeMs,
            });
          } else {
            // Still show results even if save fails
            const avg = (nums: number[]) =>
              nums.length === 0 ? 0 : Math.round((nums.reduce((a: number, b: number) => a + b, 0) / nums.length) * 100) / 100;
            setRunResult({
              aggregate: {
                precision: avg(results.map((r: { scores: { precision: number } }) => r.scores.precision)),
                recall: avg(results.map((r: { scores: { recall: number } }) => r.scores.recall)),
                ambiguityHandling: avg(results.map((r: { scores: { ambiguityHandling: number } }) => r.scores.ambiguityHandling)),
                behaviorScore: avg(results.map((r: { scores: { behaviorScore: number } }) => r.scores.behaviorScore)),
                falsePositiveRate: avg(results.map((r: { scores: { falsePositiveRate: number } }) => r.scores.falsePositiveRate)),
                fieldAccuracy: {
                  dateAccuracy: avg(results.map((r: { scores: { fieldAccuracy: { dateAccuracy: number } } }) => r.scores.fieldAccuracy.dateAccuracy)),
                  ownerAccuracy: avg(results.map((r: { scores: { fieldAccuracy: { ownerAccuracy: number } } }) => r.scores.fieldAccuracy.ownerAccuracy)),
                  typeAccuracy: avg(results.map((r: { scores: { fieldAccuracy: { typeAccuracy: number } } }) => r.scores.fieldAccuracy.typeAccuracy)),
                },
                overall: avg(results.map((r: { scores: { overall: number } }) => r.scores.overall)),
              },
              savedId: null,
              totalTimeMs,
            });
          }
        } catch {
          setError('Resultados obtenidos pero error al guardar');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error ejecutando evaluación');
    } finally {
      setRunning(false);
      loadRuns();
    }
  }

  function stopEvaluation() {
    abortRef.current = true;
  }

  async function startAutopilot() {
    setError(null);

    try {
      const res = await fetch('/api/eval/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }

      // Immediately fetch job status and start polling
      await checkAutopilotStatus();
      startPolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error iniciando autopilot');
    }
  }

  function startPolling() {
    if (pollingRef.current) return; // Already polling

    pollingRef.current = setInterval(async () => {
      try {
        // Poll job status — the Vercel Cron handles all processing server-side
        const res = await fetch('/api/eval/autopilot');
        if (!res.ok) return;
        const data = await res.json();

        if (data.job) {
          setAutopilotJob(data.job);

          // If completed or error, stop polling and refresh runs
          if (!data.active) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            loadRuns();
          }
        }
      } catch {
        // Ignore — retry next interval
      }
    }, 5000);
  }

  async function stopAutopilot() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    // Cancel the running job on the server
    if (autopilotJob?.id) {
      fetch('/api/eval/autopilot', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: autopilotJob.id }),
      }).catch(() => {});
    }
    setAutopilotJob(null);
    loadRuns();
  }

  function dismissAutopilot() {
    setAutopilotJob(null);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
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
          <SafeLink href="/chat" locked={processRunning} className="text-gray-400 hover:text-white">
            <ArrowLeft size={20} />
          </SafeLink>
          <h1 className="text-xl font-bold">🧪 Testing Nanny</h1>
        </div>
        <div className="flex items-center gap-2">
          {(running || autopilotRunning) ? (
            <button
              onClick={autopilotRunning ? stopAutopilot : stopEvaluation}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
            >
              <Square size={12} fill="currentColor" />
              Detener
            </button>
          ) : (
            <>
              <button
                onClick={startAutopilot}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition-colors"
              >
                <Zap size={14} />
                Autopilot
              </button>
              <button
                onClick={startEvaluation}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-medium transition-colors"
              >
                <Play size={14} />
                Ejecutar
              </button>
            </>
          )}
          <button
            onClick={loadRuns}
            disabled={running || autopilotRunning}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {processRunning && (
        <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-2 mb-4 text-xs text-purple-300 flex items-center gap-2">
          <Lock size={12} />
          Proceso en ejecución. La navegación está bloqueada hasta que termine.
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Autopilot progress — reads from DB job state */}
      {autopilotJob && (
        <div className="bg-purple-900/20 border border-purple-800 rounded-xl p-4 mb-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-purple-400" />
              <p className="text-sm font-semibold text-purple-300">
                {autopilotJob.status === 'completed' ? 'Autopilot completado'
                  : autopilotJob.status === 'error' ? 'Autopilot error'
                  : 'Autopilot'}
              </p>
            </div>
            {autopilotJob.status === 'running' && (
              <span className="text-xs text-purple-400 flex items-center gap-1.5">
                <Loader2 size={10} className="animate-spin" />
                {autopilotJob.message}
              </span>
            )}
          </div>

          {/* Phase steps */}
          <div className="flex gap-1 mb-4">
            {['evaluation', 'saving', 'diagnosis', 'reeval', 'complete'].map((phase) => {
              const phases = ['evaluation', 'saving', 'diagnosis', 'reeval', 'complete'];
              const currentIdx = phases.indexOf(autopilotJob.phase);
              const phaseIdx = phases.indexOf(phase);
              const isActive = phase === autopilotJob.phase && autopilotJob.status === 'running';
              const isDone = phaseIdx < currentIdx || autopilotJob.phase === 'complete';
              return (
                <div
                  key={phase}
                  className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
                    isDone ? 'bg-purple-500' : isActive ? 'bg-purple-400 animate-pulse' : 'bg-gray-700'
                  }`}
                />
              );
            })}
          </div>

          {/* Running info banner */}
          {autopilotJob.status === 'running' && (
            <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-3 mb-4 text-xs text-purple-300">
              <p className="font-medium mb-1">Ejecutándose en el servidor</p>
              <p className="text-purple-400/80">
                Podés cerrar esta página o cambiar de app. El progreso se guarda automáticamente.
              </p>
            </div>
          )}

          {/* Conversation scores (from DB) */}
          {autopilotJob.conversation_scores?.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider">
                {autopilotJob.phase === 'reeval' ? 'Re-evaluación' : 'Evaluación'}
                {' '}({autopilotJob.current_conversation}/{autopilotJob.total_conversations})
              </p>
              <div className="space-y-1">
                {(autopilotJob.conversation_scores as Array<{ name: string; score: number }>).map((conv: { name: string; score: number }, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-5 text-center shrink-0">
                      {conv.score >= 0.9 ? '✅' : conv.score >= 0.6 ? '⚠️' : '❌'}
                    </span>
                    <span className="flex-1 truncate text-gray-300">{conv.name}</span>
                    <span className={`font-mono shrink-0 ${conv.score >= 0.8 ? 'text-green-400' : conv.score >= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {Math.round(conv.score * 100)}%
                    </span>
                  </div>
                ))}
                {/* Show pending indicator for current conversation */}
                {autopilotJob.status === 'running' && autopilotJob.current_conversation < autopilotJob.total_conversations && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-5 text-center shrink-0">
                      <Loader2 size={10} className="animate-spin text-purple-400" />
                    </span>
                    <span className="flex-1 truncate text-purple-300">En progreso...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Diagnosis summary */}
          {autopilotJob.diagnosis_summary && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider">Diagnóstico</p>
              <p className="text-xs text-gray-300">{autopilotJob.diagnosis_summary}</p>
              {autopilotJob.adjustments_applied > 0 && (
                <p className="text-[10px] text-purple-400 mt-1">{autopilotJob.adjustments_applied} ajustes aplicados</p>
              )}
            </div>
          )}

          {/* Re-evaluation result */}
          {autopilotJob.reeval_pre_score != null && (
            <div className={`rounded-lg p-2.5 text-xs mb-4 ${
              autopilotJob.reeval_rolled_back ? 'bg-red-900/30 border border-red-800 text-red-300'
                : autopilotJob.reeval_improved ? 'bg-green-900/30 border border-green-800 text-green-300'
                : 'bg-gray-800 text-gray-300'
            }`}>
              <div className="flex items-center gap-2">
                {autopilotJob.reeval_improved ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                <span>
                  {Math.round(autopilotJob.reeval_pre_score * 100)}% → {Math.round((autopilotJob.reeval_post_score ?? 0) * 100)}%
                  {autopilotJob.reeval_rolled_back && ' (rollback aplicado)'}
                </span>
              </div>
            </div>
          )}

          {/* Final scores */}
          {autopilotJob.aggregate_scores && autopilotJob.status !== 'running' && (
            <div className="border-t border-purple-800 pt-3 mb-3">
              <div className="space-y-1.5 mb-3">
                <ScoreBar value={autopilotJob.aggregate_scores.precision ?? 0} label="Precision" />
                <ScoreBar value={autopilotJob.aggregate_scores.recall ?? 0} label="Recall" />
                <ScoreBar value={autopilotJob.aggregate_scores.overall ?? 0} label="Overall" />
              </div>
            </div>
          )}

          {/* Status message for completed/error */}
          {autopilotJob.status !== 'running' && (
            <div className="space-y-2">
              <p className={`text-xs text-center ${autopilotJob.status === 'error' ? 'text-red-400' : 'text-purple-300'}`}>
                {autopilotJob.message}
              </p>
              {autopilotJob.eval_run_id && (
                <SafeLink
                  href={`/admin/testing/${autopilotJob.eval_run_id}`}
                  locked={processRunning}
                  className="block text-center text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Ver detalle completo →
                </SafeLink>
              )}
              <button
                onClick={dismissAutopilot}
                className="w-full text-xs text-gray-500 hover:text-gray-400"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Live evaluation progress */}
      {convProgress.length > 0 && !runResult && (
        <div className="bg-gray-800 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">
              {running ? 'Evaluación en curso' : 'Evaluación'}
            </p>
            <span className="text-xs text-gray-400">
              {completedCount}/{convProgress.length}
            </span>
          </div>

          {/* Overall progress bar */}
          <div className="bg-gray-700 rounded-full h-2 overflow-hidden mb-3">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all duration-500"
              style={{ width: `${convProgress.length > 0 ? (completedCount / convProgress.length) * 100 : 0}%` }}
            />
          </div>

          <div className="space-y-1.5">
            {convProgress.map((conv) => (
              <div key={conv.index} className="flex items-center gap-2 text-xs">
                <span className="w-5 text-center shrink-0">
                  {conv.status === 'pending' && <span className="text-gray-600">-</span>}
                  {conv.status === 'running' && (
                    conv.totalMessages ? (
                      <span className="text-cyan-400 text-[10px] font-mono">{conv.completedMessages}/{conv.totalMessages}</span>
                    ) : (
                      <Loader2 size={12} className="animate-spin text-cyan-400" />
                    )
                  )}
                  {conv.status === 'done' && (
                    <span>{(conv.score ?? 0) >= 0.9 ? '✅' : (conv.score ?? 0) >= 0.6 ? '⚠️' : '❌'}</span>
                  )}
                  {conv.status === 'error' && '💥'}
                </span>
                <span className={`flex-1 truncate ${conv.status === 'running' ? 'text-cyan-300' : conv.status === 'pending' ? 'text-gray-600' : 'text-gray-300'}`}>
                  {conv.name}
                </span>
                {conv.score !== undefined && (
                  <span className={`font-mono shrink-0 ${conv.score >= 0.8 ? 'text-green-400' : conv.score >= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
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
            <ScoreBar value={1 - (runResult.aggregate.falsePositiveRate ?? 0)} label="Sin FPs" />
            <ScoreBar value={runResult.aggregate.overall} label="Overall" />
          </div>
          {runResult.aggregate.fieldAccuracy && (
            <div className="mb-3 bg-gray-700/50 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider">Precisi&oacute;n por campo</p>
              <div className="space-y-1">
                <ScoreBar value={runResult.aggregate.fieldAccuracy.dateAccuracy} label="Fecha/hora" />
                <ScoreBar value={runResult.aggregate.fieldAccuracy.ownerAccuracy} label="Responsable" />
                <ScoreBar value={runResult.aggregate.fieldAccuracy.typeAccuracy} label="Tipo evento" />
              </div>
            </div>
          )}
          <div className="text-xs space-y-1">
            {convProgress.filter(c => c.score !== undefined).map((conv) => (
              <div key={conv.index} className="flex items-center gap-2">
                <span>{(conv.score ?? 0) >= 0.9 ? '✅' : (conv.score ?? 0) >= 0.6 ? '⚠️' : '❌'}</span>
                <span className="text-gray-400 flex-1 truncate">{conv.name}</span>
                <span className="font-mono text-gray-300">{Math.round((conv.score ?? 0) * 100)}%</span>
              </div>
            ))}
          </div>
          {runResult.savedId && (
            <SafeLink
              href={`/admin/testing/${runResult.savedId}`}
              locked={processRunning}
              className="mt-3 block text-center text-xs text-cyan-400 hover:text-cyan-300"
            >
              Ver detalle completo →
            </SafeLink>
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
            <SafeLink
              key={run.id}
              href={`/admin/testing/${run.id}`}
              locked={processRunning}
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
                {processRunning
                  ? <Lock size={14} className="text-purple-500" />
                  : <ChevronRight size={16} className="text-gray-600" />
                }
              </div>
            </SafeLink>
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
