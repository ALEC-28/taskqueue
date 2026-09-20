import React from 'react';
import { RotateCw, CheckCircle2, Play, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function TrainingProgress({ jobStats = {}, currentRound = 1 }) {
  const completed = jobStats.done || 0;
  const inTraining = jobStats.running || jobStats.pending || 0;
  const failed = jobStats.failed || 0;
  const total = completed + inTraining + failed || 1;

  const percent = Math.round((completed / total) * 100);

  // SVG circle calculations
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="fedorch-card p-6 flex flex-col justify-between h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <RotateCw className="w-4 h-4 text-[#00f2fe]" />
          <span>FL Training Progress</span>
        </h3>
        <span className="text-xs font-mono font-semibold text-[#00f2fe] bg-[#00f2fe]/10 border border-[#00f2fe]/20 px-2.5 py-0.5 rounded-full">
          Round {currentRound}
        </span>
      </div>

      {/* Circle Progress Visual */}
      <div className="flex items-center justify-around my-4">
        <div className="relative w-28 h-28 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="text-slate-800"
              strokeWidth="8"
              stroke="currentColor"
              fill="transparent"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="text-[#00f2fe] transition-all duration-700 ease-out"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold font-mono text-slate-100">{percent}%</span>
            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">Completed</span>
          </div>
        </div>

        {/* Legend / Metrics */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-slate-400">Completed:</span>
            <span className="font-mono font-bold text-slate-200 ml-auto">{completed}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span className="text-slate-400">In Training:</span>
            <span className="font-mono font-bold text-slate-200 ml-auto">{inTraining}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className="text-slate-400">Recovered:</span>
            <span className="font-mono font-bold text-slate-200 ml-auto">{jobStats.retrying || 0}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="text-slate-400">Failed:</span>
            <span className="font-mono font-bold text-slate-200 ml-auto">{failed}</span>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between font-mono">
        <span>Active Jobs: {total}</span>
        <span className="text-emerald-400">Auto Reschedule ON</span>
      </div>
    </div>
  );
}
