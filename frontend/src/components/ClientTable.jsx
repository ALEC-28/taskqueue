import React from 'react';
import { Cpu, HardDrive, ShieldCheck, ChevronRight } from 'lucide-react';

export default function ClientTable({ clients = [], onSelectClient }) {
  const getReliabilityScore = (client) => {
    const success = parseInt(client.successful_task_count || 0, 10);
    const failure = parseInt(client.failure_count || 0, 10);
    const total = success + failure;
    if (total === 0) {
      return (client.reliability_score ? Math.round(client.reliability_score * 100) : 95);
    }
    return Math.round((success / total) * 100);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'available':
        return <span className="badge badge-available"><span className="pulse-dot pulse-dot-green" />Available</span>;
      case 'busy':
        return <span className="badge badge-busy"><span className="pulse-dot pulse-dot-blue" />Training</span>;
      case 'unhealthy':
        return <span className="badge badge-unhealthy"><span className="pulse-dot pulse-dot-red" />Unhealthy</span>;
      case 'offline':
      default:
        return <span className="badge badge-offline">Offline</span>;
    }
  };

  return (
    <div className="fedorch-card overflow-hidden">
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Distributed FL Client Registry</h3>
          <p className="text-xs text-slate-400 mt-0.5">Real-time status, capabilities & reliability metrics</p>
        </div>
        <span className="text-xs font-mono font-semibold text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full">
          {clients.length} Registered Nodes
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-900/40 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-6">Client ID / Name</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">CPU Cores</th>
              <th className="py-3 px-4">Memory (RAM)</th>
              <th className="py-3 px-4">Reliability</th>
              <th className="py-3 px-4">Success / Fail</th>
              <th className="py-3 px-4">Last Seen</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {clients.length === 0 ? (
              <tr>
                <td colSpan="8" className="py-8 text-center text-slate-500">
                  No FL clients registered yet. Start client node or run O1 suite.
                </td>
              </tr>
            ) : (
              clients.map((client) => {
                const reliability = getReliabilityScore(client);
                const cpu = typeof client.cpu_capability === 'string'
                  ? JSON.parse(client.cpu_capability)
                  : (client.cpu_capability || {});
                const mem = typeof client.memory_capability === 'string'
                  ? JSON.parse(client.memory_capability)
                  : (client.memory_capability || {});

                return (
                  <tr
                    key={client.client_id}
                    onClick={() => onSelectClient && onSelectClient(client)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-6 font-mono font-semibold text-slate-200 group-hover:text-[#00f2fe] transition-colors">
                      <div>{client.client_id}</div>
                      <div className="text-[10px] font-sans text-slate-400 font-normal">{client.name}</div>
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(client.status)}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-slate-500" />
                        <span>{cpu.cores || 4} Cores</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                        <span>{mem.ram_gb || 8} GB</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              reliability >= 80 ? 'bg-emerald-400' :
                              reliability >= 50 ? 'bg-amber-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${reliability}%` }}
                          />
                        </div>
                        <span className="font-bold text-slate-200">{reliability}%</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      <span className="text-emerald-400 font-bold">{client.successful_task_count || 0}</span>
                      <span className="mx-1">/</span>
                      <span className="text-red-400 font-bold">{client.failure_count || 0}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {client.last_heartbeat ? new Date(client.last_heartbeat).toLocaleTimeString() : 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button className="p-1.5 rounded-lg bg-slate-800 text-slate-400 group-hover:text-[#00f2fe] group-hover:bg-[#00f2fe]/10 transition-all">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
