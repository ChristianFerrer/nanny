'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowLeft, ChevronRight, TrendingUp, TrendingDown, Loader2, Square, Zap, Lock } from 'lucide-react';
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

/** Link que se bloquea cuando hay un proceso en ejecución */
function SafeLink({ href, locked, className, children, 'aria-label': ariaLabel }: {
  href: string;
  locked: boolean;
  className?: string;
  children: React.ReactNode;
  'aria-label'?: string;
}) {
  if (locked) {
    return (
      <span className={`${className || ''} opacity-50 cursor-not-allowed`} title="Proceso en ejecución, espera a que termine" aria-label={ariaLabel}>
        {children}
      </span>
    );
  }
  return <Link href={href} className={className} aria-label={ariaLabel}>{children}</Link>;
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
      <span className="w-10 text-right font-mono text-xs tabular-nums">{pct}%</span>
    </div>
  );
}

export default function TestingDashboard() {
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Autopilot state — driven by DB job status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [autopilotJob, setAutopilotJob] = useState<Record<string, any> | null>(null);
  const [serverVersion, setServerVersion] = useState<string | null>(null);

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
      if (data._v) setServerVersion(data._v);
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

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        checkAutopilotStatus();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [checkAutopilotStatus]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const autopilotRunning = autopilotJob?.status === 'running';

  useEffect(() => {
    if (!autopilotRunning) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [autopilotRunning]);

  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  async function startAutopilot(force = false) {
    setError(null);
    setShowReplaceConfirm(false);

    setAutopilotJob({
      status: 'running',
      phase: 'evaluation',
      current_conversation: 0,
      total_conversations: 10,
      message: 'Iniciando autopilot...',
      conversation_scores: [],
    });
    startPolling();

    try {
      const res = await fetch('/api/eval/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(force ? { force: true } : {}),
      });

      const data = await res.json();
      if (data._v) setServerVersion(data._v);

      if (!res.ok) {
        if (res.status === 409) {
          await checkAutopilotStatus();
          setShowReplaceConfirm(true);
        } else {
          setError(data.error || `HTTP ${res.status}`);
          setAutopilotJob(null);
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        }
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error iniciando autopilot');
      setAutopilotJob(null);
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    }
  }

  async function forceCancelAutopilot() {
    setError(null);
    setShowReplaceConfirm(false);
    try {
      const statusRes = await fetch('/api/eval/autopilot');
      const statusData = await statusRes.json();
      if (statusData.job?.id) {
        await fetch('/api/eval/autopilot', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: statusData.job.id }),
        });
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setAutopilotJob(null);
      loadRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cancelando');
    }
  }

  function startPolling() {
    if (pollingRef.current) return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/eval/autopilot');
        if (!res.ok) return;
        const data = await res.json();

        if (data._v) setServerVersion(data._v);
        if (data.job) {
          setAutopilotJob(data.job);
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
    if (autopilotJob?.status === 'running') return;
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

  return (
    <div className="min-h-dvh bg-gray-900 text-white p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <SafeLink href="/chat" locked={autopilotRunning} className="text-gray-400 hover:text-white" aria-label="Volver">
            <ArrowLeft size={20} />
          </SafeLink>
          <div>
            <h1 className="text-xl font-bold text-balance">Testing Nanny</h1>
            {serverVersion && <p className="text-[10px] text-gray-500">{serverVersion}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {autopilotRunning ? (
            <button
              onClick={stopAutopilot}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors"
            >
              <Square size={12} fill="currentColor" />
              Detener
            </button>
          ) : (
            <button
              onClick={() => startAutopilot(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition-colors"
            >
              <Zap size={14} />
              Autopilot
            </button>
          )}
        </div>
      </div>

      {autopilotRunning && (
        <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-2 mb-4 text-xs text-purple-300 flex items-center gap-2">
          <Lock size={12} />
          Proceso en ejecución. La navegación está bloqueada hasta que termine.
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-sm text-red-300">
          <p>{error}</p>
        </div>
      )}

      {showReplaceConfirm && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 mb-4 text-sm text-yellow-200">
          <p className="font-medium mb-2">Ya hay un autopilot en ejecución</p>
          <p className="text-xs text-yellow-300/80 mb-3 text-pretty">
            Podés cancelarlo y empezar uno nuevo, o esperar a que termine.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => startAutopilot(true)}
              className="flex-1 px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-xs font-medium text-white transition-colors"
            >
              Cancelar y empezar uno nuevo
            </button>
            <button
              onClick={forceCancelAutopilot}
              className="flex-1 px-3 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-xs font-medium text-white transition-colors"
            >
              Solo cancelar
            </button>
            <button
              onClick={() => setShowReplaceConfirm(false)}
              className="px-3 py-2 text-xs text-yellow-300/80 hover:text-yellow-200"
            >
              Cerrar
            </button>
          </div>
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
              <p className="text-purple-400/80 text-pretty">
                Podés cerrar esta página o cambiar de app. El progreso se guarda automáticamente.
              </p>
            </div>
          )}

          {/* Conversation scores (from DB) */}
          {autopilotJob.conversation_scores?.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider tabular-nums">
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
                    <span className={`font-mono shrink-0 tabular-nums ${conv.score >= 0.8 ? 'text-green-400' : conv.score >= 0.6 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {Math.round(conv.score * 100)}%
                    </span>
                  </div>
                ))}
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
                <p className="text-[10px] text-purple-400 mt-1 tabular-nums">{autopilotJob.adjustments_applied} ajustes aplicados</p>
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
                <span className="tabular-nums">
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
                  locked={autopilotRunning}
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
                <span className="text-2xl font-bold tabular-nums">
                  {Math.round(latest.aggregate_scores.overall * 100)}%
                </span>
                {trend !== null && trend !== 0 && (
                  <span className={`text-xs flex items-center gap-0.5 tabular-nums ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
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
            <span className="text-green-400 tabular-nums">✅ {latest.perfect_conversations} perfectas</span>
            <span className="text-yellow-400 tabular-nums">⚠️ {latest.partial_conversations} parciales</span>
            <span className="text-red-400 tabular-nums">❌ {latest.failed_conversations} fallidas</span>
          </div>
        </div>
      )}

      {/* Run history */}
      <h2 className="text-sm font-semibold text-gray-400 mb-2 text-balance">Historial de evaluaciones</h2>
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
              locked={autopilotRunning}
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
                  <span className="tabular-nums">✅{run.perfect_conversations}</span>
                  <span className="tabular-nums">⚠️{run.partial_conversations}</span>
                  <span className="tabular-nums">❌{run.failed_conversations}</span>
                  <span className="tabular-nums">· {(run.total_time_ms / 1000).toFixed(0)}s</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <span className={`text-lg font-bold tabular-nums ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {pct}%
                  </span>
                  {diff !== null && diff !== 0 && (
                    <p className={`text-xs tabular-nums ${diff > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {diff > 0 ? '+' : ''}{diff}%
                    </p>
                  )}
                </div>
                {autopilotRunning
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
            <p className="text-sm">Usa el botón Autopilot para ejecutar la primera evaluación</p>
          </div>
        )}
      </div>
    </div>
  );
}
