import React from 'react';
import { ShieldAlert, RefreshCw, CheckCircle2, AlertTriangle, Cpu } from 'lucide-react';
import RecoveryVisualizer from '../components/RecoveryVisualizer';
import MetricCard from '../components/MetricCard';

export default function FaultRecovery({ clients = [], activity = [], statusData = {}, onRecoveryTriggered }) {
  const clientStats = statusData.clients || {};
  const jobStats = statusData.jobs || {};

  const recoveredJobs = activity.filter(a => a.error && a.error.includes('reassigned')).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 font-mono">Fault-Tolerant Recovery Engine</h2>
        <p className="text-xs text-slate-400 mt-1">
          Objective 1 Orchestration — Seamless client replacement & dynamic job rescheduling upon node failure
        </p>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Recovered Tasks"
          value={recoveredJobs}
          subtitle="Dynamic Client Replacements"
          icon={RefreshCw}
          color="purple"
        />
        <MetricCard
          title="Unhealthy Nodes"
          value={(clientStats.unhealthy || 0) + (clientStats.offline || 0)}
          subtitle="Identified Dropout Clients"
          icon={AlertTriangle}
          color="danger"
        />
        <MetricCard
          title="Available Candidates"
          value={clientStats.available || 0}
          subtitle="Eligible Replacements"
          icon={CheckCircle2}
          color="emerald"
        />
        <MetricCard
          title="Recovery Time"
          value="< 500ms"
          subtitle="Automated Requeue Latency"
          icon={Cpu}
          color="cyan"
        />
      </div>

      {/* Main Interactive Visualizer & Live Demo Trigger */}
      <RecoveryVisualizer clients={clients} onRecoveryTriggered={onRecoveryTriggered} />
    </div>
  );
}
