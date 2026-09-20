import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Cpu, 
  RotateCw, 
  ListTodo, 
  ShieldAlert, 
  BarChart3, 
  Settings, 
  Activity,
  Globe
} from 'lucide-react';
import { wsService } from '../services/websocket';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clients', icon: Cpu },
  { id: 'rounds', label: 'FL Rounds', icon: RotateCw },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'recovery', label: 'Fault Recovery', icon: ShieldAlert },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ activePage, setActivePage }) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const unsub = wsService.subscribeStatus(setIsConnected);
    const interval = setInterval(() => setLastUpdated(new Date()), 5000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  return (
    <aside className="w-64 bg-[#0a0e1a]/90 backdrop-blur-xl border-r border-[#38bdf8]/10 flex flex-col h-screen sticky top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-[#38bdf8]/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00f2fe] to-[#3b82f6] p-0.5 shadow-lg shadow-[#00f2fe]/20">
          <div className="w-full h-full bg-[#0a0e1a] rounded-[10px] flex items-center justify-center">
            <Globe className="w-5 h-5 text-[#00f2fe] animate-pulse" />
          </div>
        </div>
        <div>
          <h1 className="font-bold text-lg tracking-wider text-gradient-cyan">FedOrch</h1>
          <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">FL Orchestrator</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-[#00f2fe]/15 to-[#3b82f6]/10 text-[#00f2fe] border border-[#00f2fe]/30 shadow-lg shadow-[#00f2fe]/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#00f2fe]' : 'text-slate-400'}`} />
              <span>{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00f2fe] shadow-[0_0_8px_#00f2fe]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* System Status Footer */}
      <div className="p-4 m-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'}`} />
          <span className="font-semibold text-slate-200">
            {isConnected ? 'System Online' : 'Connecting...'}
          </span>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
          <span>Backend Node</span>
          <span>:55432</span>
        </div>
      </div>
    </aside>
  );
}
