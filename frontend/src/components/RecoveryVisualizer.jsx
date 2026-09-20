import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, RefreshCw, CheckCircle2, ArrowRight, Play, Cpu, Zap } from 'lucide-react';
import { simulateClientFailure } from '../services/api';

export default function RecoveryVisualizer({ clients = [], onRecoveryTriggered }) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState('');

  const handleSimulate = async () => {
    setIsSimulating(true);
    setSimulationResult(null);
    try {
      const res = await simulateClientFailure(selectedTarget || null);
      setSimulationResult(res);
      if (onRecoveryTriggered) onRecoveryTriggered(res);
    } catch (err) {
      setSimulationResult({ error: err.message });
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="fedorch-card p-6 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-bold text-slate-100">Fault Recovery Engine</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase">
              Objective 1 Verified
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Resilience when clients fail — Automated node dropout detection, replacement selection & dynamic task rescheduling.
          </p>
        </div>

        {/* Live Simulation Controls */}
        <div className="flex items-center gap-2">
          <select
            value={selectedTarget}
            onChange={(e) => setSelectedTarget(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none font-mono"
          >
            <option value="">Auto-Select Active Client</option>
            {clients.map(c => (
              <option key={c.client_id} value={c.client_id}>{c.client_id} ({c.status})</option>
            ))}
          </select>

          <button
            onClick={handleSimulate}
            disabled={isSimulating}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-gradient-to-r from-red-500 to-amber-500 text-white font-semibold text-xs hover:from-red-600 hover:to-amber-600 disabled:opacity-50 shadow-lg shadow-red-500/20 transition-all active:scale-95"
          >
            {isSimulating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isSimulating ? 'Simulating...' : 'Simulate Client Failure'}</span>
          </button>
        </div>
      </div>

      {/* Visual Recovery Flow Pipeline */}
      <div className="my-6 p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 relative">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
          
          {/* Step 1: Client Node Dropout */}
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex flex-col items-center text-center relative group">
            <div className="p-2.5 rounded-full bg-red-500/20 text-red-400 mb-2">
              <AlertTriangle className="w-5 h-5 animate-bounce" />
            </div>
            <span className="text-[10px] font-mono text-red-400 font-bold uppercase tracking-wider">Step 1: Failure</span>
            <h4 className="text-xs font-bold text-slate-200 mt-1">
              {simulationResult?.failed_client?.client_id || 'fl-node-001'}
            </h4>
            <span className="text-[10px] text-red-400 font-mono mt-0.5">UNHEALTHY / STALE</span>
          </div>

          <div className="hidden md:flex justify-center text-slate-600">
            <ArrowRight className="w-5 h-5 animate-pulse text-purple-400" />
          </div>

          {/* Step 2: Orchestrator Detection */}
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex flex-col items-center text-center">
            <div className="p-2.5 rounded-full bg-purple-500/20 text-purple-400 mb-2">
              <RefreshCw className="w-5 h-5 animate-spin-slow" />
            </div>
            <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider">Step 2: Detection</span>
            <h4 className="text-xs font-bold text-slate-200 mt-1">Stale Health Check</h4>
            <span className="text-[10px] text-purple-300 font-mono mt-0.5">Find Replacement</span>
          </div>

          <div className="hidden md:flex justify-center text-slate-600">
            <ArrowRight className="w-5 h-5 animate-pulse text-emerald-400" />
          </div>

          {/* Step 3: Replacement & Completion */}
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col items-center text-center">
            <div className="p-2.5 rounded-full bg-emerald-500/20 text-emerald-400 mb-2">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">Step 3: Recovered</span>
            <h4 className="text-xs font-bold text-slate-200 mt-1">
              {simulationResult?.replacement_client?.client_id || 'fl-node-002'}
            </h4>
            <span className="text-[10px] text-emerald-400 font-mono mt-0.5">TASK RE-ENQUEUED</span>
          </div>

        </div>
      </div>

      {/* Simulation Result Terminal Box */}
      {simulationResult && (
        <div className="p-4 rounded-xl bg-[#080c16] border border-slate-800 text-xs font-mono space-y-1 animate-in fade-in">
          {simulationResult.error ? (
            <p className="text-red-400">❌ Simulation Error: {simulationResult.error}</p>
          ) : (
            <>
              <p className="text-emerald-400 font-bold">✓ Backend Failure Simulation Executed via Real O1 Engine:</p>
              <p className="text-slate-300">
                • Target Failed Node: <span className="text-red-400">{simulationResult.failed_client?.client_id}</span> (Status: unhealthy, failures: {simulationResult.failed_client?.failure_count})
              </p>
              <p className="text-slate-300">
                • Selected Replacement: <span className="text-emerald-400">{simulationResult.replacement_client ? simulationResult.replacement_client.client_id : 'No replacement available'}</span>
              </p>
              <p className="text-slate-300">
                • Rescheduled Job ID: <span className="text-[#00f2fe]">{simulationResult.rescheduled_job ? simulationResult.rescheduled_job.id : 'N/A'}</span>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
