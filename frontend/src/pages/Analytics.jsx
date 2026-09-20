import React from 'react';
import { BarChart3, LineChart, Sparkles, AlertCircle, Award } from 'lucide-react';

export default function Analytics() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 font-mono">Performance Analytics & Evaluation</h2>
        <p className="text-xs text-slate-400 mt-1">
          Objective 2 Framework — Comparative analysis of Conventional Baseline vs Reliability-Aware Selector
        </p>
      </div>

      {/* Notice Banner */}
      <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-start gap-3 text-xs text-purple-300">
        <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-slate-200">Objective 2 Benchmark Architecture Ready</h3>
          <p className="text-slate-400 text-[11px] mt-0.5">
            This module is prepared to compare **Random Selection** vs **Reliability-Aware Selection** across accuracy, convergence rate, communication cost, and fault recovery.
          </p>
        </div>
      </div>

      {/* Empty State / Placeholder Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Metric 1: Accuracy & Convergence */}
        <div className="fedorch-card p-6 flex flex-col justify-between h-72">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <LineChart className="w-4 h-4 text-[#00f2fe]" />
              <span>Model Convergence & Accuracy</span>
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              O2 METRIC
            </span>
          </div>

          <div className="my-auto flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl bg-slate-900/40">
            <AlertCircle className="w-8 h-8 text-slate-500 mb-2" />
            <p className="text-xs font-semibold text-slate-300">No experimental results available yet.</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Execute Objective 2 benchmarking script to record accuracy curves.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-500 flex justify-between">
            <span>Baseline (Random) vs Proposed (O2)</span>
            <span>0 Rounds Logged</span>
          </div>
        </div>

        {/* Metric 2: Communication Efficiency & Recovery Cost */}
        <div className="fedorch-card p-6 flex flex-col justify-between h-72">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span>Communication & Recovery Overhead</span>
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              O2 METRIC
            </span>
          </div>

          <div className="my-auto flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl bg-slate-900/40">
            <Award className="w-8 h-8 text-slate-500 mb-2" />
            <p className="text-xs font-semibold text-slate-300">No communication data logged yet.</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Bandwidth and failure recovery cost comparisons will populate after O2 evaluation.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-500 flex justify-between">
            <span>Network Cost Efficiency</span>
            <span>Pending Evaluation</span>
          </div>
        </div>

      </div>
    </div>
  );
}
