import React from 'react';
import { Globe, Server, ShieldCheck, Activity } from 'lucide-react';

export default function GlobalModelCanvas({ clients = [] }) {
  // Map backend clients to visual nodes around the global model circle
  const defaultNodes = [
    { id: 'fl-node-001', label: 'Hospital A (Node 1)', defaultStatus: 'available' },
    { id: 'fl-node-002', label: 'Research Lab (Node 2)', defaultStatus: 'busy' },
    { id: 'fl-node-003', label: 'Medical Center B', defaultStatus: 'available' },
    { id: 'fl-node-004', label: 'Clinic C (Node 4)', defaultStatus: 'available' },
    { id: 'fl-node-005', label: 'Health Hub E', defaultStatus: 'offline' },
  ];

  // Merge registered clients with default visual layout
  const displayNodes = defaultNodes.map((defNode, idx) => {
    const matchedClient = clients.find(c => c.client_id === defNode.id) || clients[idx];
    return {
      id: matchedClient ? matchedClient.client_id : defNode.id,
      label: matchedClient ? (matchedClient.name || matchedClient.client_id) : defNode.label,
      status: matchedClient ? matchedClient.status : defNode.defaultStatus,
      ram: matchedClient ? matchedClient.memory_capability : null,
    };
  });

  // Calculate position coordinates in a ring around center (250x250)
  const radius = 130;
  const centerX = 200;
  const centerY = 170;

  return (
    <div className="fedorch-card p-6 relative overflow-hidden flex flex-col justify-between h-[420px]">
      {/* Header */}
      <div className="flex items-start justify-between z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00f2fe] animate-ping" />
            <h3 className="text-base font-bold text-slate-100 tracking-wide">Global Model Orchestration</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Distributed Federated Training • Local data stays local • Privacy preserved
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-[#00f2fe] bg-[#00f2fe]/10 border border-[#00f2fe]/20 px-3 py-1 rounded-full">
          <ShieldCheck className="w-3.5 h-3.5 text-[#00f2fe]" />
          <span>Zero Data Egress</span>
        </div>
      </div>

      {/* SVG Canvas with Animated Nodes & Connecting Lines */}
      <div className="absolute inset-0 top-14 flex items-center justify-center pointer-events-none">
        <svg className="w-full h-full" viewBox="0 0 400 340">
          <defs>
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>

            <linearGradient id="lineGradAvailable" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#00f2fe" stopOpacity="0.2" />
            </linearGradient>

            <linearGradient id="lineGradBusy" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#00f2fe" stopOpacity="0.3" />
            </linearGradient>

            <linearGradient id="lineGradUnhealthy" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#00f2fe" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Central Background Ambient Glow */}
          <circle cx={centerX} cy={centerY} r="70" fill="url(#centerGlow)" />

          {/* Lines & Outer Client Nodes */}
          {displayNodes.map((node, i) => {
            const angle = (i * 2 * Math.PI) / displayNodes.length - Math.PI / 2;
            const nx = centerX + radius * Math.cos(angle);
            const ny = centerY + radius * Math.sin(angle);

            let strokeColor = 'url(#lineGradAvailable)';
            let nodeBg = '#10b981';
            let strokeDash = '4 4';

            if (node.status === 'busy') {
              strokeColor = 'url(#lineGradBusy)';
              nodeBg = '#3b82f6';
              strokeDash = 'none';
            } else if (node.status === 'unhealthy' || node.status === 'offline') {
              strokeColor = 'url(#lineGradUnhealthy)';
              nodeBg = '#ef4444';
            }

            return (
              <g key={node.id}>
                {/* Connecting Line */}
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={nx}
                  y2={ny}
                  stroke={strokeColor}
                  strokeWidth={node.status === 'busy' ? '2' : '1.5'}
                  strokeDasharray={strokeDash}
                  className={node.status === 'busy' ? 'animate-pulse' : ''}
                />

                {/* Animated Data Pulses along lines for active nodes */}
                {node.status === 'busy' && (
                  <circle r="3" fill="#00f2fe">
                    <animateMotion
                      path={`M ${nx},${ny} L ${centerX},${centerY}`}
                      dur="2.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Node Outer Circle */}
                <circle
                  cx={nx}
                  cy={ny}
                  r="18"
                  fill="#0d1322"
                  stroke={nodeBg}
                  strokeWidth="2"
                  className="filter drop-shadow-[0_0_8px_rgba(0,242,254,0.3)]"
                />

                {/* Node Center Dot */}
                <circle cx={nx} cy={ny} r="6" fill={nodeBg} />
              </g>
            );
          })}

          {/* Central Aggregator Core Node */}
          <circle
            cx={centerX}
            cy={centerY}
            r="32"
            fill="#090d16"
            stroke="#00f2fe"
            strokeWidth="3"
            className="filter drop-shadow-[0_0_15px_#00f2fe]"
          />
          <circle cx={centerX} cy={centerY} r="22" fill="#00f2fe" fillOpacity="0.15" />
        </svg>

        {/* Central Icon Label Overlay */}
        <div className="absolute top-[170px] left-[200px] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-auto">
          <Globe className="w-8 h-8 text-[#00f2fe] animate-pulse" />
          <span className="text-[10px] font-mono text-slate-300 font-bold tracking-widest mt-1 uppercase">FED-CORE</span>
        </div>

        {/* Labels Overlay for Surrounding Nodes */}
        {displayNodes.map((node, i) => {
          const angle = (i * 2 * Math.PI) / displayNodes.length - Math.PI / 2;
          const nx = centerX + radius * Math.cos(angle);
          const ny = centerY + radius * Math.sin(angle);

          return (
            <div
              key={node.id}
              className="absolute pointer-events-auto flex flex-col items-center"
              style={{
                left: `${(nx / 400) * 100}%`,
                top: `${(ny / 340) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="mt-10 px-2 py-0.5 rounded-md bg-[#0a0e1a]/90 border border-slate-800 text-[10px] font-mono text-slate-200 whitespace-nowrap shadow-md flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  node.status === 'busy' ? 'bg-blue-400' :
                  node.status === 'available' ? 'bg-emerald-400' : 'bg-red-400'
                }`} />
                <span>{node.id}</span>
                <span className="text-slate-500 uppercase">({node.status})</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Statement */}
      <div className="z-10 mt-auto pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono text-[11px] text-[#00f2fe]">
          "Local data stays local. Global knowledge grows."
        </span>
        <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">
          Active Participants: {displayNodes.filter(n => n.status !== 'offline').length} / {displayNodes.length}
        </span>
      </div>
    </div>
  );
}
