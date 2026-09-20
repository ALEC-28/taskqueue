import React, { useState } from 'react';
import { Cpu, CheckCircle2, Play, AlertTriangle, Search, Filter } from 'lucide-react';
import ClientTable from '../components/ClientTable';

export default function Clients({ clients = [], onSelectClient }) {
  const [filterStatus, setFilterStatus] = useState('all');
  const [localSearch, setLocalSearch] = useState('');

  const filteredClients = clients.filter(c => {
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchesSearch = !localSearch || 
      c.client_id.toLowerCase().includes(localSearch.toLowerCase()) ||
      (c.name && c.name.toLowerCase().includes(localSearch.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  const availableCount = clients.filter(c => c.status === 'available').length;
  const busyCount = clients.filter(c => c.status === 'busy').length;
  const unhealthyCount = clients.filter(c => c.status === 'unhealthy' || c.status === 'offline').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 font-mono">Distributed FL Client Registry</h2>
          <p className="text-xs text-slate-400 mt-1">
            Edge node capabilities, heartbeat state, failure count & execution history
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter nodes..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-[#00f2fe]/50 font-mono"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none font-mono"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="busy">Training (Busy)</option>
            <option value="unhealthy">Unhealthy</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="fedorch-card p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono text-slate-400 uppercase">Total Registered</p>
            <p className="text-xl font-bold font-mono text-slate-100">{clients.length}</p>
          </div>
          <Cpu className="w-5 h-5 text-[#00f2fe]" />
        </div>
        <div className="fedorch-card p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono text-slate-400 uppercase">Available</p>
            <p className="text-xl font-bold font-mono text-emerald-400">{availableCount}</p>
          </div>
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="fedorch-card p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono text-slate-400 uppercase">In Training</p>
            <p className="text-xl font-bold font-mono text-blue-400">{busyCount}</p>
          </div>
          <Play className="w-5 h-5 text-blue-400" />
        </div>
        <div className="fedorch-card p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono text-slate-400 uppercase">Unhealthy / Offline</p>
            <p className="text-xl font-bold font-mono text-red-400">{unhealthyCount}</p>
          </div>
          <AlertTriangle className="w-5 h-5 text-red-400" />
        </div>
      </div>

      {/* Main Client Table */}
      <ClientTable clients={filteredClients} onSelectClient={onSelectClient} />
    </div>
  );
}
