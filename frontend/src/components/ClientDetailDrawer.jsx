import React from 'react';
import { X, Cpu, HardDrive, ShieldCheck, Activity, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';

export default function ClientDetailDrawer({ client, onClose }) {
  if (!client) return null;

  const cpu = typeof client.cpu_capability === 'string'
    ? JSON.parse(client.cpu_capability)
    : (client.cpu_capability || {});

  const mem = typeof client.memory_capability === 'string'
    ? JSON.parse(client.memory_capability)
    : (client.memory_capability || {});

  const gpu = typeof client.gpu_capability === 'string'
    ? JSON.parse(client.gpu_capability)
    : (client.gpu_capability || null);

  const success = parseInt(client.successful_task_count || 0, 10);
  const failure = parseInt(client.failure_count || 0, 10);
  const total = success + failure;
  const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : '100.0';

  const lastSeenMs = client.last_heartbeat ? (Date.now() - new Date(client.last_heartbeat).getTime()) : 99999;
  const isLive = lastSeenMs < 15000;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#0d1322] border-l border-[#38bdf8]/20 h-full p-6 flex flex-col justify-between overflow-y-auto shadow-2xl">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100 font-mono">{client.client_id}</h2>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase border ${
                  client.status === 'available' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                  client.status === 'busy' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                  'bg-red-500/10 text-red-400 border-red-500/30'
                }`}>
                  {client.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{client.name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Heartbeat Badge */}
          <div className="my-5 p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isLive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                <Activity className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Heartbeat Signal</p>
                <p className="text-[10px] font-mono text-slate-400">
                  {client.last_heartbeat ? new Date(client.last_heartbeat).toLocaleTimeString() : 'N/A'}
                </p>
              </div>
            </div>
            <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md ${
              isLive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}>
              {isLive ? '● LIVE' : `● ${Math.round(lastSeenMs / 1000)}s AGO`}
            </span>
          </div>

          {/* Resource Specs Profile */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Resource Profile</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Cpu className="w-4 h-4 text-[#00f2fe]" />
                  <span>CPU Cores</span>
                </div>
                <p className="text-base font-bold font-mono text-slate-100">{cpu.cores || 4} Cores</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{cpu.frequency_ghz || 2.8} GHz</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span>Memory RAM</span>
                </div>
                <p className="text-base font-bold font-mono text-slate-100">{mem.ram_gb || 8} GB</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">DDR4 System RAM</p>
              </div>
            </div>

            {gpu && (
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span>GPU Acceleration</span>
                </div>
                <p className="text-sm font-bold font-mono text-slate-100">{gpu.model || 'NVIDIA GPU'}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{gpu.vram_gb || 8} GB VRAM</p>
              </div>
            )}

            {/* Task Performance Statistics */}
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono pt-2">Execution Metrics</h3>
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Successful Tasks</span>
                <span className="font-mono font-bold text-emerald-400">{success}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Failed Tasks</span>
                <span className="font-mono font-bold text-red-400">{failure}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                <span className="text-slate-300 font-semibold">Success Rate</span>
                <span className="font-mono font-bold text-[#00f2fe]">{successRate}%</span>
              </div>
            </div>

            {/* O2 Placeholder notice */}
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
              <p className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>Objective 2 Compatibility</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Intelligent multi-criteria client selection scoring will populate here during O2 evaluation.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium text-xs transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
