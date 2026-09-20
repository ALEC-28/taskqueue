import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Cpu } from 'lucide-react';

export default function ActivityTimeline({ activities = [] }) {
  const defaultEvents = [
    {
      timestamp: new Date().toISOString(),
      type: 'recovery',
      title: 'Task Rescheduled',
      desc: 'FL training task reassigned to fl-node-002',
      status: 'recovered',
    },
    {
      timestamp: new Date(Date.now() - 15000).toISOString(),
      type: 'failure',
      title: 'Client Node Failure',
      desc: 'fl-node-001 became unhealthy / stale heartbeat',
      status: 'unhealthy',
    },
    {
      timestamp: new Date(Date.now() - 45000).toISOString(),
      type: 'training',
      title: 'FL Round 1 Started',
      desc: 'Task queued for edge client fl-node-001',
      status: 'busy',
    },
  ];

  const events = activities.length > 0 ? activities : defaultEvents;

  return (
    <div className="fedorch-card p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#00f2fe]" />
          <span>Live Activity Stream</span>
        </h3>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          REALTIME
        </span>
      </div>

      <div className="space-y-4 overflow-y-auto pr-1 flex-1 max-h-[320px]">
        {events.map((evt, idx) => {
          let Icon = CheckCircle2;
          let iconColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

          if (evt.status === 'unhealthy' || evt.type === 'failure' || evt.status === 'failed') {
            Icon = AlertTriangle;
            iconColor = 'text-red-400 bg-red-500/10 border-red-500/30';
          } else if (evt.status === 'recovered' || evt.type === 'recovery') {
            Icon = RefreshCw;
            iconColor = 'text-purple-400 bg-purple-500/10 border-purple-500/30';
          } else if (evt.status === 'busy' || evt.type === 'training') {
            Icon = Cpu;
            iconColor = 'text-blue-400 bg-blue-500/10 border-blue-500/30';
          }

          const timeStr = evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : 'Just now';

          return (
            <div key={idx} className="flex items-start gap-3 relative">
              {idx !== events.length - 1 && (
                <div className="absolute left-3.5 top-7 bottom-0 w-0.5 bg-slate-800" />
              )}
              <div className={`p-1.5 rounded-lg border ${iconColor} shrink-0 z-10`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0 bg-slate-900/40 border border-slate-800/60 rounded-xl p-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-200 truncate">{evt.title || evt.name || 'System Event'}</h4>
                  <span className="text-[10px] font-mono text-slate-500">{timeStr}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate">
                  {evt.desc || (evt.payload ? `Job ${evt.id.slice(0,8)} (${evt.status})` : evt.error || 'Event processed')}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
