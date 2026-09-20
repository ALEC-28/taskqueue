import React from 'react';
import { ShieldCheck, Cpu, Sparkles, Building2 } from 'lucide-react';

export default function PrivacyPanel() {
  const benefits = [
    {
      title: 'Data Privacy',
      desc: 'Local data never leaves the client device or healthcare node.',
      icon: ShieldCheck,
      color: 'text-[#00f2fe]',
      bg: 'bg-[#00f2fe]/10 border-[#00f2fe]/20',
      badge: 'VERIFIED',
    },
    {
      title: 'Reliable Orchestration',
      desc: 'Fault-tolerant task rescheduling recovers automatically from dropouts.',
      icon: Cpu,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20',
      badge: 'OBJECTIVE 1',
    },
    {
      title: 'Intelligent Selection',
      desc: 'Multi-criteria scoring based on CPU, RAM, network latency, and reliability.',
      icon: Sparkles,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10 border-purple-500/20',
      badge: 'OBJECTIVE 2 (COMING NEXT)',
    },
    {
      title: 'Real-world Impact',
      desc: 'Privacy-preserving machine learning for Healthcare, Finance & IoT.',
      icon: Building2,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      badge: 'MULTI-SECTOR',
    },
  ];

  return (
    <div className="fedorch-card p-6 flex flex-col justify-between h-[420px]">
      <div>
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-1 flex items-center gap-2">
          <span>Privacy • Security • Scalability</span>
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Better Intelligence Without Compromising Privacy.
        </p>

        <div className="space-y-3">
          {benefits.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div key={idx} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 transition-all hover:border-slate-700">
                <div className={`p-2 rounded-lg border ${b.bg} ${b.color} shrink-0 mt-0.5`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-200">{b.title}</h4>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {b.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{b.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono text-center">
        FedOrch Architecture • O1 Fault Tolerance Verified
      </div>
    </div>
  );
}
