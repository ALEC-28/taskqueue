import React, { useState } from 'react';
import { ListTodo, Search, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

export default function Tasks({ jobs = [] }) {
  const [selectedTask, setSelectedTask] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredJobs = jobs.filter(j => filterStatus === 'all' || j.status === filterStatus);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 font-mono">TaskQueue Job Registry</h2>
          <p className="text-xs text-slate-400 mt-1">
            Distributed task queue state, worker pickup, attempt retries & recovery traces
          </p>
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none font-mono"
        >
          <option value="all">All Job Statuses</option>
          <option value="done">Done</option>
          <option value="running">Running</option>
          <option value="pending">Pending</option>
          <option value="retrying">Retrying</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Task Table */}
      <div className="fedorch-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/40 font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-6">Task ID</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Assigned Client</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Attempts</th>
                <th className="py-3.5 px-4">Created / Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500">
                    No tasks found in TaskQueue. Submit FL training job via API.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => {
                  const isRecovered = job.error && job.error.includes('reassigned');
                  return (
                    <tr
                      key={job.id}
                      onClick={() => setSelectedTask(job)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-6 font-mono font-bold text-slate-200">{job.id.slice(0, 13)}…</td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[#00f2fe] border border-slate-700">
                          {job.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-[#00f2fe]">
                        {job.payload?.client_id || 'unassigned'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`badge ${
                          job.status === 'done' ? 'badge-available' :
                          job.status === 'running' ? 'badge-busy' :
                          isRecovered ? 'badge-recovered' : 'badge-unhealthy'
                        }`}>
                          {isRecovered ? 'RECOVERED' : job.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {job.attempts || 1} / {job.max_attempts || 5}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {job.updated_at ? new Date(job.updated_at).toLocaleTimeString() : 'N/A'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Task Details Modal/Box */}
      {selectedTask && (
        <div className="fedorch-card p-6 border-cyan-500/30 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <h3 className="text-sm font-bold font-mono text-slate-200">
              Task Details — {selectedTask.id}
            </h3>
            <button
              onClick={() => setSelectedTask(null)}
              className="text-xs text-slate-400 hover:text-slate-200 font-mono"
            >
              Close [X]
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono mb-4">
            <div>
              <span className="text-slate-500">Job Name:</span>
              <p className="text-slate-200 font-bold">{selectedTask.name}</p>
            </div>
            <div>
              <span className="text-slate-500">Queue:</span>
              <p className="text-slate-200 font-bold">{selectedTask.queue || 'default'}</p>
            </div>
            <div>
              <span className="text-slate-500">Assigned Client:</span>
              <p className="text-[#00f2fe] font-bold">{selectedTask.payload?.client_id || 'N/A'}</p>
            </div>
          </div>

          {/* Recovery Information Trace */}
          {selectedTask.error && (
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs font-mono space-y-2">
              <h4 className="text-purple-300 font-bold uppercase tracking-wider">Fault Recovery Trace Information</h4>
              <div className="flex items-center gap-3 text-slate-300">
                <span className="text-red-400">Original Client Dropout</span>
                <ArrowRight className="w-4 h-4 text-purple-400" />
                <span className="text-amber-400">Replacement Selected</span>
                <ArrowRight className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Execution Rescheduled</span>
              </div>
              <p className="text-slate-400 text-[11px] mt-1">{selectedTask.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
