import React from 'react';

export default function MetricCard({ title, value, status, subtitle, icon: Icon, color = 'cyan' }) {
  const colorMap = {
    cyan: {
      border: 'border-[#00f2fe]/20 hover:border-[#00f2fe]/50',
      glow: 'shadow-[#00f2fe]/5',
      iconBg: 'bg-[#00f2fe]/10 text-[#00f2fe]',
      text: 'text-[#00f2fe]',
    },
    emerald: {
      border: 'border-emerald-500/20 hover:border-emerald-500/50',
      glow: 'shadow-emerald-500/5',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
      text: 'text-emerald-400',
    },
    blue: {
      border: 'border-blue-500/20 hover:border-blue-500/50',
      glow: 'shadow-blue-500/5',
      iconBg: 'bg-blue-500/10 text-blue-400',
      text: 'text-blue-400',
    },
    danger: {
      border: 'border-red-500/20 hover:border-red-500/50',
      glow: 'shadow-red-500/5',
      iconBg: 'bg-red-500/10 text-red-400',
      text: 'text-red-400',
    },
    purple: {
      border: 'border-purple-500/20 hover:border-purple-500/50',
      glow: 'shadow-purple-500/5',
      iconBg: 'bg-purple-500/10 text-purple-400',
      text: 'text-purple-400',
    },
  };

  const currentTheme = colorMap[color] || colorMap.cyan;

  return (
    <div className={`fedorch-card p-5 relative overflow-hidden transition-all duration-300 ${currentTheme.border} ${currentTheme.glow}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase">{title}</p>
          <h3 className="text-2xl font-bold text-slate-100 mt-1 font-mono tracking-tight">{value}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1 font-sans flex items-center gap-1.5">
              {status && <span className="w-1.5 h-1.5 rounded-full bg-[#00f2fe]" />}
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div className={`p-3 rounded-xl ${currentTheme.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
