import React from 'react';
import { RotateCw, CheckCircle2, Play, AlertTriangle, ShieldCheck, Clock, Users } from 'lucide-react';

export default function FLRounds({ statusData = {}, jobs = [] }) {
  const currentRound = statusData.current_round || 1;

  // Extract FL training jobs grouped by fl_round
  const flJobs = jobs.filter(j => j.name === 'fl_training');
  
  const roundsMap = {};
  flJobs.forEach(job => {
    const roundNum = (job.payload && job.payload.fl_round) ? job.payload.fl_round : 1;
    if (!roundsMap[roundNum]) {
      roundsMap[roundNum] = [];
    }
    roundsMap[roundNum].push(job);
  });

  const roundNumbers = Object.keys(roundsMap).map(Number).sort((a, b) => b - a);
  if (roundNumbers.length === 0) roundNumbers.push(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 font-mono">Federated Learning Rounds</h2>
        <p className="text-xs text-slate-400 mt-1">
          Global round timeline, participant client allocation & round progression
        </p>
      </div>

      {/* Rounds List */}
      <div className="space-y-4">
        {roundNumbers.map((roundNum) => {
          const roundJobs = roundsMap[roundNum] || [];
          const doneJobs = roundJobs.filter(j => j.status === 'done');
          const runningJobs = roundJobs.filter(j => j.status === 'running' || j.status === 'pending');
          const failedJobs = roundJobs.filter(j => j.status === 'failed');
          const isCurrent = roundNum === currentRound;

          return (
            <div
              key={roundNum}
              className={`fedorch-card p-6 border-l-4 transition-all ${
                isCurrent ? 'border-l-[#00f2fe] bg-gradient-to-r from-[#00f2fe]/5 to-transparent' : 'border-l-slate-700'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${isCurrent ? 'bg-[#00f2fe]/10 text-[#00f2fe]' : 'bg-slate-800 text-slate-400'}`}>
                    <RotateCw className={`w-5 h-5 ${isCurrent ? 'animate-spin-slow' : ''}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-100 font-mono">FL Round {roundNum}</h3>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                        isCurrent ? 'bg-[#00f2fe]/15 text-[#00f2fe] border border-[#00f2fe]/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {isCurrent ? 'IN PROGRESS' : 'COMPLETED'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <Users className="w-3.5 h-3.5" />
                      <span>{roundJobs.length} Participating Edge Nodes</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{doneJobs.length} Completed</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-blue-400">
                    <Play className="w-3.5 h-3.5" />
                    <span>{runningJobs.length} Training</span>
                  </div>
                  {failedJobs.length > 0 && (
                    <div className="flex items-center gap-1.5 text-red-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{failedJobs.length} Failed</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tasks in this round */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase text-slate-400 font-semibold mb-2">Round Tasks & Assigned Clients</h4>
                {roundJobs.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">No active jobs recorded for this round yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {roundJobs.map((j) => (
                      <div key={j.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-mono">
                          <span className={`w-2 h-2 rounded-full ${
                            j.status === 'done' ? 'bg-emerald-400' :
                            j.status === 'running' ? 'bg-blue-400' : 'bg-amber-400'
                          }`} />
                          <span className="text-slate-200 font-bold">{j.payload?.client_id || 'unassigned'}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">
                          Job {j.id.slice(0, 8)} ({j.status})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Objective 2 Compatibility Box */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span className="text-purple-400 font-mono text-[11px] flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Objective 2: Client Selection Criteria & Scoring (Coming Next)
                </span>
                <span className="text-slate-500 font-mono text-[10px]">Baseline Selection</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
