import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import FLRounds from './pages/FLRounds';
import Tasks from './pages/Tasks';
import FaultRecovery from './pages/FaultRecovery';
import Analytics from './pages/Analytics';
import ClientDetailDrawer from './components/ClientDetailDrawer';

import { getFLStatus, getClients, getJobs, getRecentActivity, simulateClientFailure } from './services/api';
import { wsService } from './services/websocket';

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [statusData, setStatusData] = useState({});
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activity, setActivity] = useState([]);
  const [notifications, setNotifications] = useState([]);
  
  const [selectedClient, setSelectedClient] = useState(null);

  // Fetch initial data
  const loadData = async () => {
    try {
      const [statusRes, clientsRes, jobsRes, activityRes] = await Promise.all([
        getFLStatus().catch(() => ({})),
        getClients().catch(() => []),
        getJobs({ limit: 50 }).catch(() => []),
        getRecentActivity().catch(() => []),
      ]);

      if (statusRes) setStatusData(statusRes);
      if (clientsRes) setClients(clientsRes);
      if (jobsRes) setJobs(jobsRes);
      if (activityRes) setActivity(activityRes);
    } catch (err) {
      console.error('[App] Load data error:', err.message);
    }
  };

  useEffect(() => {
    loadData();

    // Connect WebSocket
    wsService.connect();

    // Subscribe to live WebSocket updates
    const unsubscribe = wsService.subscribe((msg) => {
      console.log('[App] Realtime event:', msg);
      loadData(); // refresh metrics on live event

      if (msg.type === 'system_event' || msg.type === 'job_update') {
        const eventItem = {
          type: msg.type,
          message: msg.event ? `Event: ${msg.event.type}` : `Job update: ${msg.job?.id?.slice(0, 8)} (${msg.job?.status})`,
          timestamp: new Date().toISOString(),
        };
        setNotifications((prev) => [eventItem, ...prev.slice(0, 15)]);
      }
    });

    // Fallback periodic poll every 5s
    const pollInterval = setInterval(loadData, 5000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
      wsService.disconnect();
    };
  }, []);

  const handleSimulateClick = async () => {
    try {
      const res = await simulateClientFailure();
      loadData();
      setNotifications((prev) => [
        {
          type: 'client_failure_simulated',
          message: `Simulated failure on ${res.failed_client?.client_id || 'client'} -> Reassigned to ${res.replacement_client?.client_id || 'none'}`,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err) {
      alert(`Simulation error: ${err.message}`);
    }
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <Dashboard
            statusData={statusData}
            clients={clients}
            activity={activity}
            onSelectClient={setSelectedClient}
          />
        );
      case 'clients':
        return <Clients clients={clients} onSelectClient={setSelectedClient} />;
      case 'rounds':
        return <FLRounds statusData={statusData} jobs={jobs} />;
      case 'tasks':
        return <Tasks jobs={jobs} />;
      case 'recovery':
        return (
          <FaultRecovery
            clients={clients}
            activity={activity}
            statusData={statusData}
            onRecoveryTriggered={loadData}
          />
        );
      case 'analytics':
        return <Analytics />;
      default:
        return <Dashboard statusData={statusData} clients={clients} activity={activity} onSelectClient={setSelectedClient} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#070a12] text-slate-100 font-sans">
      {/* Sidebar */}
      <Sidebar activePage={activePage} setActivePage={setActivePage} />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          notifications={notifications}
          onSimulateClick={handleSimulateClick}
        />

        <main className="p-8 flex-1 overflow-y-auto">
          {renderPage()}
        </main>
      </div>

      {/* Slide-over Client Detail Drawer */}
      <ClientDetailDrawer
        client={selectedClient}
        onClose={() => setSelectedClient(null)}
      />
    </div>
  );
}
