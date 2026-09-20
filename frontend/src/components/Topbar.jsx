import React, { useState } from 'react';
import { Search, Bell, Shield, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

export default function Topbar({ searchQuery, setSearchQuery, notifications = [], onSimulateClick }) {
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="h-20 border-b border-[#38bdf8]/10 bg-[#070a12]/80 backdrop-blur-xl px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Brand Tagline */}
      <div>
        <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          <span>Many Devices. A Smarter Tomorrow.</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/20 font-normal">
            FL Orchestrator
          </span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Collaborative Learning • Privacy Preserved • More Possibilities
        </p>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Quick Demo Simulator Trigger */}
        <button
          onClick={onSimulateClick}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-500/20 to-amber-500/20 text-red-400 border border-red-500/40 hover:border-red-400 hover:text-red-300 text-xs font-semibold transition-all shadow-md hover:shadow-red-500/10 active:scale-95"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>Simulate Client Failure</span>
        </button>

        {/* Working Search */}
        <div className="relative w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Client ID, Task ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#00f2fe]/50 focus:ring-1 focus:ring-[#00f2fe]/50 transition-all"
          />
        </div>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700 relative transition-all"
          >
            <Bell className="w-4 h-4" />
            {notifications.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#00f2fe] absolute top-1.5 right-1.5 shadow-[0_0_8px_#00f2fe]" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-[#0d1322] border border-slate-800 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">System Events</h3>
                <span className="text-[10px] text-slate-500 font-mono">{notifications.length} Recent</span>
              </div>
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No recent system notifications</p>
                ) : (
                  notifications.map((n, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-2.5 text-xs">
                      {n.type === 'client_failure_simulated' ? (
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="text-slate-200 font-medium">{n.message || n.type}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {n.timestamp ? new Date(n.timestamp).toLocaleTimeString() : 'Just now'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
