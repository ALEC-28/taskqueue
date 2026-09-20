import React from 'react';
import { Cpu, CheckCircle2, Play, AlertTriangle, RotateCw } from 'lucide-react';
import MetricCard from '../components/MetricCard';
import GlobalModelCanvas from '../components/GlobalModelCanvas';
import PrivacyPanel from '../components/PrivacyPanel';
import ActivityTimeline from '../components/ActivityTimeline';
import TrainingProgress from '../components/TrainingProgress';
import ClientTable from '../components/ClientTable';

export default function Dashboard({ statusData = {}, clients = [], activity = [], onSelectClient }) {
  const clientStats = statusData.clients || {};
  const jobStats = statusData.jobs || {};
  const currentRound = statusData.current_round || 1;

  return (
    <div className="space-y-6">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total Clients"
          value={clientStats.total || clients.length || 0}
          subtitle="Registered FL Edge Nodes"
          icon={Cpu}
          color="cyan"
        />
        <MetricCard
          title="Available"
          value={clientStats.available || 0}
          subtitle="Ready for Training"
          icon={CheckCircle2}
          color="emerald"
        />
        <MetricCard
          title="Training"
          value={clientStats.busy || 0}
          subtitle="Active Compute"
          icon={Play}
          color="blue"
        />
        <MetricCard
          title="Unhealthy"
          value={(clientStats.unhealthy || 0) + (clientStats.offline || 0)}
          subtitle="Offline / Failed"
          icon={AlertTriangle}
          color="danger"
        />
        <MetricCard
          title="Current Round"
          value={`Round ${currentRound}`}
          subtitle="In Progress"
          icon={RotateCw}
          color="purple"
        />
      </div>

      {/* Main Center Visualizer Row: Global Model (Left 7 Cols) + Privacy Panel (Right 5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <GlobalModelCanvas clients={clients} />
        </div>
        <div className="lg:col-span-5">
          <PrivacyPanel />
        </div>
      </div>

      {/* Secondary Row: Activity Timeline + Training Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <ActivityTimeline activities={activity} />
        </div>
        <div className="lg:col-span-5">
          <TrainingProgress jobStats={jobStats} currentRound={currentRound} />
        </div>
      </div>

      {/* Client Performance Table */}
      <div>
        <ClientTable clients={clients} onSelectClient={onSelectClient} />
      </div>
    </div>
  );
}
