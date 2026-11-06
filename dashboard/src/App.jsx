import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Database, Activity, Settings,
  Zap, ArrowUpRight, ArrowDownRight, Clock, AlertCircle, TrendingUp, CheckCircle2, Users
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const API = "http://localhost:3000";
const WS = "ws://localhost:3001";

// ─── palette ────────────────────────────────────────────────────────────────
const C = {
  bg: '#05030E',
  s1: '#0C0920',   // surface 1
  s2: '#120E2A',   // surface 2
  border: '#221A42',
  lime: '#CCFF00',   // primary accent
  pink: '#FF3CAC',   // secondary accent
  violet: '#7B5CE8',   // tertiary
  amber: '#FFB800',
  emerald: '#00E5A0',
  text: '#EDE8F8',
  muted: '#5A4B7A',
  subtle: '#9385BE',
}

const selectStyle = {
  background: C.s1,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '6px 12px',
  fontFamily: 'Outfit',
  fontSize: 12,
  outline: 'none'
};

const navItems = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'jobs', label: 'Jobs', icon: Database },
  { id: 'workflows', label: 'Workflows', icon: Activity },
  { id: 'workers', label: 'Workers', icon: Zap },
  { id: 'fl', label: 'FL Orchestrator', icon: TrendingUp },
  { id: 'fl_clients', label: 'FL Clients', icon: Users },
  { id: 'deadletter', label: 'Dead-letter', icon: AlertCircle },
]

const JOB_TYPES = [
  "send_welcome_email", "resize_image", "generate_invoice",
  "fraud_check", "send_otp_sms", "slow_job", "fail_always"
];

// ─── sub-components ─────────────────────────────────────────────────────────
const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px' }}>
      <p style={{ color: C.muted, fontFamily: 'JetBrains Mono', fontSize: 11, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.stroke || C.lime, fontFamily: 'Outfit', fontSize: 13, fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number' && !Number.isInteger(p.value) ? p.value.toFixed(1) : p.value}
        </p>
      ))}
    </div>
  )
}

function BigStat({ label, value, unit, delta, up, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'DM Serif Display', fontSize: 42, lineHeight: 1, color: accent }}>{value}</span>
        {unit && <span style={{ fontFamily: 'Outfit', fontSize: 14, color: C.muted }}>{unit}</span>}
      </div>
      {delta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {up ? <ArrowUpRight size={12} color={C.emerald} /> : <ArrowDownRight size={12} color={C.pink} />}
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: up ? C.emerald : C.pink }}>{delta}</span>
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }) {
  const isDone = status === 'done';
  const isRunning = status === 'running';
  const isFailed = status === 'failed';
  const isRetrying = status === 'retrying';
  const isPending = status === 'pending';

  const col = isDone ? C.emerald : isRunning ? C.lime : isFailed ? C.pink : isRetrying ? C.amber : C.muted;

  return (
    <span style={{
      background: col + '18', color: col,
      padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 600, fontFamily: 'Outfit',
      display: "inline-flex", alignItems: "center", gap: 5,
      border: `1px solid ${col}40`
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: col, display: "inline-block",
        boxShadow: `0 0 6px ${col}`,
        animation: isRunning ? "pulse 1.4s infinite" : "none"
      }} />
      {status}
    </span>
  );
}

function QueueBadge({ queue }) {
  const col = queue === 'high' ? C.pink : queue === 'default' ? C.violet : C.muted;
  return (
    <span style={{
      fontSize: 11, padding: "2px 8px", borderRadius: 10, fontFamily: 'Outfit',
      background: col + '20', color: col, fontWeight: 500, border: `1px solid ${col}40`
    }}>
      {queue}
    </span>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [activeNav, setActiveNav] = useState('dashboard')
  const [mounted, setMounted] = useState(false)

  const [jobs, setJobs] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [throughput, setTP] = useState(Array.from({ length: 12 }, () => ({ t: "", v: 0 })));
  const [wsStatus, setWsStatus] = useState("connecting");
  const [healthStatus, setHealthStatus] = useState(null);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitName, setSubmitName] = useState("send_welcome_email");
  const [submitQueue, setSubmitQueue] = useState("default");
  const [submitDelay, setSubmitDelay] = useState("0");
  const [submitCount, setSubmitCount] = useState("1");
  const [onlineWorkersCount, setOnlineWorkersCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [nlDescription, setNlDescription] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);

  // ── O2 FL Orchestrator state ─────────────────────────────────────────────
  const [flScores, setFlScores] = useState([]);
  const [flRounds, setFlRounds] = useState([]);
  const [flSelectedRound, setFlSelectedRound] = useState(null);
  const [flExpResult, setFlExpResult] = useState(null);
  const [flExpLoading, setFlExpLoading] = useState(false);
  const [flSetupLoading, setFlSetupLoading] = useState(false);
  const [flRoundLoading, setFlRoundLoading] = useState(false);
  const [flRoundStrategy, setFlRoundStrategy] = useState('intelligent');
  const [flRoundK, setFlRoundK] = useState('3');
  const [flRoundNum, setFlRoundNum] = useState('1');
  const [flExpRounds, setFlExpRounds] = useState('5');
  const [flExpK, setFlExpK] = useState('3');
  const [flExpFailProb, setFlExpFailProb] = useState('0.15');

  // ── FL Clients tab state ──────────────────────────────────────────────────
  const [flClients, setFlClients] = useState([]);
  const [flClientsLoading, setFlClientsLoading] = useState(false);
  const [flClientsFilter, setFlClientsFilter] = useState('all');     // 'all' | 'active' | 'inactive' | 'unhealthy'
  const [flClientsSearch, setFlClientsSearch] = useState('');
  const [flClientSort, setFlClientSort] = useState({ key: 'score', dir: 'desc' });
  const [flSeedCount, setFlSeedCount] = useState('10');
  const [flSeedProfile, setFlSeedProfile] = useState('mixed');
  const [flSeedSeed, setFlSeedSeed] = useState('42');
  const [flSeedLoading, setFlSeedLoading] = useState(false);
  const [flPreviewStrategy, setFlPreviewStrategy] = useState('intelligent');
  const [flPreviewK, setFlPreviewK] = useState('3');
  const [flPreviewWeights, setFlPreviewWeights] = useState({ reliability: 0.35, dataset_size: 0.25, data_quality: 0.20, compute: 0.10, network: 0.10 });
  const [flPreviewResult, setFlPreviewResult] = useState(null);
  const [flPreviewLoading, setFlPreviewLoading] = useState(false);

  const triggerRef = useRef(null)
  const sidebarRef = useRef(null)
  const wsRef = useRef(null);

  useEffect(() => { setTimeout(() => setMounted(true), 80) }, [])

  const showSidebar = () => setSidebarVisible(true)
  const hideSidebar = () => setSidebarVisible(false)

  async function fetchJobs() {
    try {
      const res = await fetch(`${API}/jobs?limit=200`);
      const data = await res.json();
      if (Array.isArray(data)) setJobs(data);
    } catch (e) { console.error(e); }
  }
  async function fetchWorkflows() {
    try {
      const res = await fetch(`${API}/workflows`);
      const data = await res.json();
      if (Array.isArray(data)) setWorkflows(data);
    } catch (e) { console.error(e); }
  }
  async function fetchWorkflowDetail(id) {
    try {
      const res = await fetch(`${API}/workflows/${id}`);
      const data = await res.json();
      if (data && typeof data === 'object' && !data.error) setSelectedWorkflow(data);
    } catch (e) { console.error(e); }
  }
  async function fetchHealth() {
    try {
      const res = await fetch(`${API}/health`);
      const data = await res.json();
      setHealthStatus(data);
    } catch (e) { console.error(e); }
  }
  async function fetchWorkers() {
    try {
      const res = await fetch(`${API}/workers`);
      const data = await res.json();
      if (data && typeof data.online_count === 'number') {
        setOnlineWorkersCount(data.online_count);
      } else if (Array.isArray(data)) {
        setOnlineWorkersCount(data.length);
      }
    } catch (e) { console.error('[workers] fetch error:', e); }
  }

  // ── O2 fetch functions ───────────────────────────────────────────────────
  async function fetchFlScores() {
    try {
      const res = await fetch(`${API}/fl/clients/scores`);
      const data = await res.json();
      if (Array.isArray(data)) setFlScores(data);
    } catch (e) { console.error('[fl] scores fetch error:', e); }
  }
  async function fetchFlRounds() {
    try {
      const res = await fetch(`${API}/fl/rounds?limit=20`);
      const data = await res.json();
      if (Array.isArray(data)) setFlRounds(data);
    } catch (e) { console.error('[fl] rounds fetch error:', e); }
  }
  async function fetchFlRoundDetail(id) {
    try {
      const res = await fetch(`${API}/fl/rounds/${id}`);
      const data = await res.json();
      if (data && !data.error) setFlSelectedRound(data);
    } catch (e) { console.error('[fl] round detail error:', e); }
  }

  // ── FL Clients fetch ──────────────────────────────────────────────────────
  async function fetchFlClients() {
    setFlClientsLoading(true);
    try {
      const res = await fetch(`${API}/fl/clients`);
      const data = await res.json();
      if (data && Array.isArray(data.clients)) setFlClients(data.clients);
    } catch (e) { console.error('[fl-clients] fetch error:', e); }
    finally { setFlClientsLoading(false); }
  }

  async function toggleClientStatus(clientId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await fetch(`${API}/fl/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchFlClients();
    } catch (e) { console.error('[fl-clients] toggle error:', e); }
  }

  async function seedClients() {
    setFlSeedLoading(true);
    try {
      const res = await fetch(`${API}/fl/clients/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: parseInt(flSeedCount, 10), profile: flSeedProfile, seed: parseInt(flSeedSeed, 10) }),
      });
      const data = await res.json();
      if (res.ok) { showToast(`Seeded ${data.count} clients`, 'success'); fetchFlClients(); }
      else showToast(data.error || 'Seed failed', 'error');
    } catch (e) { showToast(`Seed error: ${e.message}`, 'error'); }
    finally { setFlSeedLoading(false); }
  }

  async function runSelectionPreview() {
    setFlPreviewLoading(true);
    try {
      // Auto-normalise weights
      const w = { ...flPreviewWeights };
      const sum = Object.values(w).reduce((s, v) => s + v, 0);
      if (Math.abs(sum - 1) > 0.001) {
        for (const k of Object.keys(w)) w[k] = parseFloat((w[k] / sum).toFixed(4));
        const adj = 1 - Object.values(w).reduce((s, v) => s + v, 0);
        w.reliability = parseFloat((w.reliability + adj).toFixed(4));
        setFlPreviewWeights(w);
      }
      const res = await fetch(`${API}/fl/select-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: flPreviewStrategy, k: parseInt(flPreviewK, 10), weights: w }),
      });
      const data = await res.json();
      if (res.ok) setFlPreviewResult(data);
      else showToast(data.error || 'Preview failed', 'error');
    } catch (e) { showToast(`Preview error: ${e.message}`, 'error'); }
    finally { setFlPreviewLoading(false); }
  }

  useEffect(() => {
    fetchJobs();
    fetchWorkflows();
    fetchHealth();
    function connect() {
      const ws = new WebSocket(WS);
      wsRef.current = ws;
      ws.onopen = () => setWsStatus("live");
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "job_update") {
          setJobs(prev => {
            const exists = prev.find(j => j.id === msg.job.id);
            if (exists) return prev.map(j => j.id === msg.job.id ? { ...j, ...msg.job } : j);
            return [msg.job, ...prev].slice(0, 200);
          });
          setTP(prev => {
            const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            return [...prev.slice(1), { t: now, v: (prev[prev.length - 1]?.v || 0) + 1 }];
          });
          fetchHealth();
        }
        if (msg.type === 'system_event') {
          if (msg.event?.type === 'fl_round_started') { fetchFlRounds(); fetchFlScores(); }
          if (msg.event?.type === 'experiment_completed') { fetchFlRounds(); }
        }
        if (msg.type === 'client_update') { fetchFlScores(); }
      };
      ws.onclose = () => { setWsStatus("reconnecting"); setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    }
    connect();
    const iv = setInterval(() => { fetchJobs(); fetchWorkflows(); fetchHealth(); }, 10000);
    const ivFl = setInterval(() => { fetchFlScores(); fetchFlRounds(); }, 8000);
    const ivClients = setInterval(fetchFlClients, 12000);
    fetchFlClients();
    return () => { clearInterval(iv); clearInterval(ivFl); clearInterval(ivClients); wsRef.current?.close(); };
  }, []);

  useEffect(() => {
    if (!selectedWorkflow) return;
    const iv = setInterval(() => fetchWorkflowDetail(selectedWorkflow.id), 2000);
    return () => clearInterval(iv);
  }, [selectedWorkflow?.id]);

  function showToast(msg, type = "info") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  async function submitJob() {
    try {
      const count = Math.max(1, parseInt(submitCount, 10) || 1);
      const body = { name: submitName, queue: submitQueue, count, payload: { to: "demo@example.com" } };
      const delay = parseInt(submitDelay, 10);
      if (delay > 0) body.delay_seconds = delay;
      const endpoint = count > 1 ? `${API}/jobs/bulk` : `${API}/jobs`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json()).error || "failed");
      const label = count > 1 ? `${count} × ${submitName}` : submitName;
      showToast(`Enqueued ${label} → ${submitQueue}${delay ? ` (in ${delay}s)` : ""}`, "success");
      setShowSubmit(false);
      fetchJobs();
      fetchWorkers();
    } catch (e) { showToast(`Failed: ${e.message}`, "error"); }
  }

  async function generateWorkflow() {
    if (!nlDescription.trim()) return;
    setNlLoading(true);
    try {
      const res = await fetch(`${API}/workflows/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: nlDescription })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      showToast(`Generated "${data.generated?.name || data.workflow?.name}"`, "success");
      setNlDescription("");
      fetchWorkflows();
      fetchJobs();
    } catch (e) { showToast(`AI failed: ${e.message}`, "error"); }
    finally { setNlLoading(false); }
  }

  async function requeueJob(jobId) {
    try {
      const res = await fetch(`${API}/jobs/${jobId}/requeue`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "failed");
      showToast("Job requeued", "success");
      fetchJobs();
    } catch (e) { showToast(`Requeue failed: ${e.message}`, "error"); }
  }

  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safeWorkflows = Array.isArray(workflows) ? workflows : [];

  let filtered = filter === "all" ? safeJobs : safeJobs.filter(j => j.status === filter);
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(j =>
      (j.id && j.id.toLowerCase().includes(q)) ||
      (j.name && j.name.toLowerCase().includes(q)) ||
      (j.queue && j.queue.toLowerCase().includes(q)) ||
      (j.worker_id && j.worker_id.toLowerCase().includes(q)) ||
      (j.status && j.status.toLowerCase().includes(q))
    );
  }

  const counts = safeJobs.reduce((acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc; }, {});
  const queueDepth = ["high", "default", "low"].map(q => ({
    name: q,
    count: safeJobs.filter(j => j.queue === q && ["pending", "running"].includes(j.status)).length
  }));
  const maxQ = Math.max(1, ...queueDepth.map(q => q.count));

  const workerMap = {};
  safeJobs.forEach(j => {
    if (j.worker_id) {
      if (!workerMap[j.worker_id]) workerMap[j.worker_id] = { lastJob: j, done: 0, running: 0 };
      if (j.status === "running") workerMap[j.worker_id].running++;
      if (j.status === "done") workerMap[j.worker_id].done++;
      const cur = workerMap[j.worker_id].lastJob;
      if (new Date(j.updated_at || j.created_at) > new Date(cur.updated_at || cur.created_at))
        workerMap[j.worker_id].lastJob = j;
    }
  });
  const workers = Object.entries(workerMap);
  const retrying = safeJobs.filter(j => j.status === "retrying");
  const failedList = safeJobs.filter(j => j.status === "failed" || j.status === "retrying").slice(0, 5);
  const deadletter = safeJobs.filter(j => j.status === "failed");

  return (
    <div style={{
      display: 'flex', width: '100vw', height: '100vh', background: C.bg, position: 'relative',
      opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease', color: C.text
    }}>

      {/* ── hover trigger zone ── */}
      <div
        ref={triggerRef}
        onMouseEnter={showSidebar}
        style={{ position: 'fixed', top: 0, left: 0, width: 56, height: '100vh', zIndex: 50, cursor: 'default' }}
      />

      {/* ── sidebar overlay ── */}
      <div
        ref={sidebarRef}
        onMouseLeave={hideSidebar}
        style={{
          position: 'fixed', top: 0, left: 0, height: '100vh', width: 220, zIndex: 40,
          background: 'rgba(12, 9, 32, 0.96)',
          backdropFilter: 'blur(20px)',
          borderRight: `1px solid ${C.border}`,
          transform: sidebarVisible ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex', flexDirection: 'column',
          boxShadow: sidebarVisible ? '8px 0 40px rgba(0,0,0,0.6)' : 'none',
        }}
      >
        <div style={{ padding: '28px 20px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${C.lime}, ${C.violet})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Zap size={16} color="#05030E" strokeWidth={2.5} />
          </div>
          <div>
            <p style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: C.text, margin: 0 }}>TaskQueue</p>
            <p style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted, margin: 0 }}>v1.0.0</p>
          </div>
        </div>

        <div style={{ height: 1, background: C.border, margin: '0 16px 16px' }} />

        <nav style={{ flex: 1, padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = activeNav === id
            return (
              <button
                key={id}
                onClick={() => { setActiveNav(id); setSidebarVisible(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', borderRadius: 10, padding: '10px 12px',
                  background: active ? `${C.lime}14` : 'transparent',
                  border: `1px solid ${active ? C.lime + '30' : 'transparent'}`,
                  color: active ? C.lime : C.muted,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.16s ease',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#FFFFFF08'; e.currentTarget.style.color = C.subtle } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted } }}
              >
                {active && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 18, background: C.lime, borderRadius: '0 3px 3px 0' }} />}
                <Icon size={16} style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: 'Outfit', fontWeight: 500, fontSize: 13 }}>{label}</span>
              </button>
            )
          })}
        </nav>

        <div style={{ margin: 12, padding: '12px 14px', borderRadius: 12, background: C.s2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg, ${C.pink}, ${C.violet})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit', fontWeight: 700, fontSize: 11, color: '#fff' }}>OP</div>
          <div>
            <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 12, color: C.text, margin: 0 }}>Operator</p>
            <p style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.lime, margin: 0 }}>System Healthy</p>
          </div>
        </div>
      </div>

      {/* ── sidebar indicator tab ── */}
      <div
        onMouseEnter={showSidebar}
        style={{
          position: 'fixed', top: 32, left: 0, zIndex: 41,
          width: 4, height: 48, borderRadius: '0 4px 4px 0',
          background: sidebarVisible ? 'transparent' : `linear-gradient(to bottom, ${C.lime}, ${C.violet})`,
          transition: 'all 0.3s ease', cursor: 'pointer',
        }}
      />

      {/* ── main content ── */}
      <div style={{ flex: 1, minWidth: 0, height: '100vh', overflowY: 'auto', paddingLeft: 16, paddingBottom: 32, boxSizing: 'border-box' }}>

        {/* top strip */}
        <div style={{ padding: '28px 40px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: wsStatus === "live" ? C.lime : C.amber, display: 'inline-block', boxShadow: `0 0 10px ${wsStatus === "live" ? C.lime : C.amber}` }} />
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                {wsStatus} · API {healthStatus?.api ? 'OK' : 'ERR'} · Redis {healthStatus?.redis ? 'OK' : 'ERR'}
              </span>
            </div>
            <h1 style={{ fontFamily: 'DM Serif Display', fontSize: 32, color: C.text, margin: 0, lineHeight: 1.1 }}>
              {activeNav.charAt(0).toUpperCase() + activeNav.slice(1)} Dashboard
            </h1>
            <div style={{ position: "relative", width: 300, marginTop: 12 }}>
              <input
                type="text"
                placeholder="Search jobs by ID, name, status..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && filtered.length === 1) {
                    setSelected(filtered[0]);
                  }
                }}
                style={{
                  width: "100%", padding: "8px 14px", paddingRight: 30,
                  borderRadius: 20, border: `1px solid ${C.border}`,
                  background: C.s1, color: C.text, fontSize: 13, outline: "none",
                  fontFamily: 'Outfit', transition: "border-color .15s"
                }}
                onFocus={e => e.target.style.borderColor = C.violet}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 28 }}>
            <BigStat label="Total Jobs" value={jobs.length} delta={`${counts.done || 0} done`} up accent={C.lime} />
            <BigStat label="Queued" value={counts.pending || 0} delta="active queue" up accent={C.amber} />
            <BigStat label="Failed" value={counts.failed || 0} delta={counts.failed ? "needs review" : "all clear"} up={!counts.failed} accent={counts.failed ? C.pink : C.emerald} />
          </div>
        </div>

        <div style={{ margin: '24px 40px', height: 1, background: C.border }} />

        <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {activeNav === 'dashboard' && (
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr 300px' }}>
              {/* ── throughput chart ── */}
              <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px', gridColumn: '1 / 3' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: C.text, margin: 0 }}>Job Activity Throughput</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 12, color: C.muted, margin: '3px 0 0' }}>Jobs processed over time</p>
                  </div>
                  <button onClick={() => setShowSubmit(!showSubmit)} style={{
                    padding: '6px 12px', borderRadius: 8, background: C.lime + '10', border: `1px solid ${C.lime}40`,
                    color: C.lime, fontFamily: 'Outfit', fontSize: 12, cursor: 'pointer', fontWeight: 500
                  }}>+ Enqueue Job</button>
                </div>

                {showSubmit && (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16, padding: '12px', background: C.s2, borderRadius: 12, border: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
                    <select value={submitName} onChange={e => setSubmitName(e.target.value)} style={selectStyle}>
                      {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select value={submitQueue} onChange={e => setSubmitQueue(e.target.value)} style={selectStyle}>
                      <option value="high">high priority</option>
                      <option value="default">default</option>
                      <option value="low">low priority</option>
                    </select>
                    <select value={submitCount} onChange={e => setSubmitCount(e.target.value)} style={selectStyle}>
                      <option value="1">1 job</option>
                      <option value="5">5 jobs</option>
                      <option value="10">10 jobs</option>
                      <option value="25">25 jobs</option>
                      <option value="50">50 jobs</option>
                      <option value="100">100 jobs</option>
                    </select>
                    <button onClick={submitJob} style={{
                      fontSize: 12, padding: "6px 16px", borderRadius: 8, fontFamily: 'Outfit',
                      border: "none", background: C.lime, color: C.s1, cursor: "pointer", fontWeight: 600
                    }}>Run</button>
                  </div>
                )}

                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={throughput} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gLime" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.lime} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={C.lime} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={C.border} strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="t" tick={{ fill: C.muted, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: C.muted, fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Area type="monotone" dataKey="v" name="Throughput" stroke={C.lime} strokeWidth={2} fill="url(#gLime)" dot={false} activeDot={{ r: 5, fill: C.lime }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* ── queue depth bars ── */}
              <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
                <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: C.text, margin: '0 0 4px' }}>Queue Depth</p>
                <p style={{ fontFamily: 'Outfit', fontSize: 12, color: C.muted, margin: '0 0 20px' }}>Pending & running jobs</p>
                {queueDepth.map(d => {
                  const col = d.name === 'high' ? C.pink : d.name === 'default' ? C.violet : C.subtle;
                  return (
                    <div key={d.name} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontFamily: 'Outfit', fontSize: 12, color: C.subtle, textTransform: 'capitalize' }}>{d.name}</span>
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: col }}>{d.count}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: C.s2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(d.count / maxQ * 100, 100)}%`, background: col, borderRadius: 99, transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }} />
                      </div>
                    </div>
                  )
                })}

                <div style={{ marginTop: 24, padding: '12px', borderRadius: 10, background: C.s2, border: `1px solid ${C.border}` }}>
                  <p style={{ fontFamily: 'Outfit', fontSize: 12, color: C.muted, margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: (onlineWorkersCount > 0 || workers.length > 0) ? C.lime : C.muted,
                        boxShadow: (onlineWorkersCount > 0 || workers.length > 0) ? `0 0 8px ${C.lime}` : 'none',
                        display: 'inline-block'
                      }} />
                      Workers Online:
                    </span>
                    <span style={{ color: (onlineWorkersCount > 0 || workers.length > 0) ? C.lime : C.pink, fontWeight: 600, fontFamily: 'JetBrains Mono' }}>
                      {Math.max(onlineWorkersCount, workers.length)}
                    </span>
                  </p>
                </div>
              </div>

              {/* ── recent failures feed ── */}
              <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 20px', display: 'flex', flexDirection: 'column', gridColumn: '1 / 2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: C.text, margin: 0 }}>Recent Failures</p>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.amber }}>{retrying.length} retrying</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                  {failedList.length === 0 && (
                    <p style={{ fontFamily: 'Outfit', fontSize: 13, color: C.muted }}>No recent failures. System healthy.</p>
                  )}
                  {failedList.map((a, i) => {
                    const col = a.status === 'retrying' ? C.amber : C.pink;
                    const Icon = a.status === 'retrying' ? Clock : AlertCircle;
                    return (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: col + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <Icon size={13} color={col} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: 'Outfit', fontWeight: 500, fontSize: 12, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.muted, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.error || 'failed'}</p>
                        </div>
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted, flexShrink: 0, marginTop: 2 }}>{new Date(a.updated_at).toLocaleTimeString()}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Active Jobs Preview */}
              <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px', gridColumn: '2 / 4' }}>
                <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: C.text, margin: '0 0 16px' }}>Active Jobs</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                    <thead>
                      <tr>
                        {["ID", "Job", "Queue", "Status"].map(h => (
                          <th key={h} style={{ textAlign: 'left', paddingBottom: 10, color: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 400, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 6).map(j => (
                        <tr key={j.id} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={{ padding: '10px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: C.subtle }}>{j.id.slice(0, 8)}</td>
                          <td style={{ padding: '10px 0', fontFamily: 'Outfit', fontSize: 13, color: C.text }}>{j.name}</td>
                          <td style={{ padding: '10px 0' }}><QueueBadge queue={j.queue} /></td>
                          <td style={{ padding: '10px 0' }}><StatusPill status={j.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontFamily: 'Outfit', fontSize: 12, color: C.lime, margin: '12px 0 0', cursor: 'pointer' }} onClick={() => setActiveNav('jobs')}>View all jobs →</p>
              </div>

            </div>
          )}

          {/* ── jobs table view ── */}
          {(activeNav === 'jobs' || activeNav === 'deadletter') && (
            <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {["all", "running", "pending", "done", "failed", "retrying"].map(s => {
                  const active = filter === s;
                  return (
                    <button key={s} onClick={() => setFilter(s)} style={{
                      fontSize: 12, padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontFamily: 'Outfit',
                      border: active ? `1px solid ${C.lime}50` : `1px solid ${C.border}`,
                      background: active ? `${C.lime}14` : 'transparent',
                      color: active ? C.lime : C.muted, transition: "all .15s"
                    }}>
                      {s} {counts[s] ? <span style={{ opacity: .7, fontSize: 10, marginLeft: 4 }}>{counts[s]}</span> : ""}
                    </button>
                  );
                })}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr>
                      {["ID", "Job", "Queue", "Worker", "Status", "Attempts", "Created"].map(h => (
                        <th key={h} style={{
                          textAlign: "left", padding: "12px",
                          color: C.muted, fontWeight: 400, fontSize: 10, fontFamily: 'JetBrains Mono',
                          borderBottom: `1px solid ${C.border}`,
                          textTransform: "uppercase"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeNav === 'deadletter' ? deadletter : filtered).map(job => (
                      <tr key={job.id}
                        onClick={() => setSelected(selected?.id === job.id ? null : job)}
                        style={{
                          borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                          background: selected?.id === job.id ? C.s2 : "transparent",
                          transition: "background .1s"
                        }}
                        onMouseEnter={e => { if (selected?.id !== job.id) e.currentTarget.style.background = C.s2; }}
                        onMouseLeave={e => { if (selected?.id !== job.id) e.currentTarget.style.background = "transparent"; }}
                      >
                        <td style={{ padding: "12px", fontFamily: "JetBrains Mono", fontSize: 11, color: C.subtle }}>{job.id.slice(0, 8)}</td>
                        <td style={{ padding: "12px", fontFamily: "Outfit", fontSize: 13, color: C.text, fontWeight: 500 }}>{job.name}</td>
                        <td style={{ padding: "12px" }}><QueueBadge queue={job.queue} /></td>
                        <td style={{ padding: "12px", fontFamily: "JetBrains Mono", fontSize: 11, color: C.subtle }}>{job.worker_id ? job.worker_id.slice(0, 8) : "—"}</td>
                        <td style={{ padding: "12px" }}><StatusPill status={job.status} /></td>
                        <td style={{ padding: "12px", color: C.muted, fontSize: 12 }}>{job.attempts || 0}</td>
                        <td style={{ padding: "12px", color: C.muted, fontSize: 11, fontFamily: 'JetBrains Mono' }}>{new Date(job.created_at).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selected && (
                <div style={{
                  marginTop: 16, border: `1px solid ${C.border}`, padding: "20px", borderRadius: 12,
                  background: C.s2, animation: "slideDown .15s ease"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ fontFamily: "JetBrains Mono", fontSize: 12, color: C.subtle }}>{selected.id}</span>
                    <button onClick={() => setSelected(null)} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 18 }}>✕</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 16 }}>
                    {[["Name", selected.name], ["Queue", selected.queue], ["Status", selected.status],
                    ["Attempts", `${selected.attempts || 0}/${selected.max_attempts || 5}`],
                    ["Worker", selected.worker_id || "—"],
                    ["Updated", new Date(selected.updated_at).toLocaleTimeString()]
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: "uppercase", fontFamily: 'JetBrains Mono' }}>{k}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text, fontFamily: 'Outfit' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {selected.error && (
                    <div style={{ background: C.pink + '10', border: `1px solid ${C.pink}40`, borderRadius: 8, padding: "12px", marginBottom: 12, fontSize: 13, color: C.pink, fontFamily: 'Outfit' }}>
                      {selected.error}
                    </div>
                  )}
                  {selected.payload && (
                    <pre style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.subtle, borderRadius: 8, padding: 16, fontSize: 12, overflow: "auto", margin: 0, fontFamily: 'JetBrains Mono' }}>
                      {JSON.stringify(selected.payload, null, 2)}
                    </pre>
                  )}

                  {activeNav === 'deadletter' && (
                    <button onClick={() => requeueJob(selected.id)} style={{
                      marginTop: 16, fontSize: 12, padding: "8px 16px", borderRadius: 8, fontFamily: 'Outfit',
                      border: `1px solid ${C.border}`, background: C.bg, color: C.text, cursor: "pointer"
                    }}>↻ Requeue Job</button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── workflows ── */}
          {activeNav === 'workflows' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
                <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 16, color: C.lime, margin: '0 0 8px' }}>✦ Generate Workflow via AI</p>
                <p style={{ fontFamily: 'Outfit', fontSize: 13, color: C.muted, margin: '0 0 16px' }}>Describe in plain English to automatically construct a DAG</p>
                <textarea
                  value={nlDescription} onChange={e => setNlDescription(e.target.value)}
                  placeholder='e.g. "Send welcome email and resize profile picture in parallel. After both finish, generate invoice."'
                  style={{
                    width: "100%", minHeight: 80, fontSize: 13, padding: 14,
                    borderRadius: 12, border: `1px solid ${C.border}`,
                    background: C.s2, color: C.text, resize: "vertical", fontFamily: "Outfit", outline: "none"
                  }}
                />
                <button onClick={generateWorkflow} disabled={nlLoading} style={{
                  marginTop: 16, fontSize: 13, padding: "10px 24px", borderRadius: 10, fontFamily: 'Outfit',
                  border: "none", background: nlLoading ? C.s2 : C.lime, color: nlLoading ? C.muted : C.bg,
                  cursor: nlLoading ? "default" : "pointer", fontWeight: 600, transition: "all .15s"
                }}>
                  {nlLoading ? "Generating…" : "✦ Generate & Run"}
                </button>
              </div>

              <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
                <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: C.text, margin: '0 0 16px' }}>Recent Workflows</p>
                {safeWorkflows.map(wf => (
                  <div key={wf.id} onClick={() => fetchWorkflowDetail(wf.id)} style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "16px", borderBottom: `1px solid ${C.border}`,
                    cursor: "pointer", borderRadius: 12, transition: "background .1s"
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = C.s2}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <Activity size={24} color={C.violet} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, fontFamily: "Outfit", color: C.text }}>{wf.name}</div>
                      <div style={{ fontSize: 11, color: C.subtle, fontFamily: 'JetBrains Mono', marginTop: 4 }}>{wf.id.slice(0, 8)}… · {new Date(wf.created_at).toLocaleString()}</div>
                    </div>
                    <StatusPill status={wf.status} />
                  </div>
                ))}
              </div>

              {selectedWorkflow && (
                <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "Outfit", color: C.text }}>{selectedWorkflow.name}</div>
                      <div style={{ fontSize: 11, color: C.subtle, fontFamily: 'JetBrains Mono', marginTop: 4 }}>{selectedWorkflow.id}</div>
                    </div>
                    <button onClick={() => setSelectedWorkflow(null)} style={{ border: "none", background: "none", cursor: "pointer", color: C.muted, fontSize: 20 }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 12, textTransform: "uppercase", fontFamily: 'JetBrains Mono' }}>Workflow Steps</div>
                  {(selectedWorkflow.steps || []).map(step => (
                    <div key={step.id} style={{
                      display: "flex", alignItems: "center", gap: 16,
                      padding: "12px 0", borderBottom: `1px solid ${C.border}`
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: C.text, fontFamily: 'Outfit' }}>{step.name}</div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 4, fontFamily: 'Outfit' }}>
                          <span style={{ color: C.subtle }}>{step.job_name}</span> · <QueueBadge queue={step.queue} />
                          {step.depends_on?.length > 0 && <span style={{ marginLeft: 8 }}>· after: {step.depends_on.join(", ")}</span>}
                        </div>
                      </div>
                      <StatusPill status={step.job_status || step.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── workers ── */}
          {activeNav === 'workers' && (
            <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
              <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 16, color: C.text, margin: '0 0 8px' }}>Active Workers</p>
              <p style={{ fontFamily: 'Outfit', fontSize: 13, color: C.muted, margin: '0 0 24px' }}>Run <code style={{ background: C.s2, padding: "2px 6px", borderRadius: 4, color: C.text }}>npm run dev</code> in worker directory to scale.</p>

              {workers.length === 0 && <p style={{ color: C.subtle, fontFamily: 'Outfit' }}>No workers active.</p>}
              {workers.map(([id, info]) => {
                const isRunning = info.lastJob.status === "running";
                return (
                  <div key={id} style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "16px 0", borderBottom: `1px solid ${C.border}`
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 14,
                      background: C.s2, color: C.lime,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1px solid ${C.border}`
                    }}>
                      <Zap size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: "JetBrains Mono" }}>{id}</div>
                        <span style={{ fontSize: 10, color: isRunning ? C.bg : C.lime, background: isRunning ? C.lime : C.lime + '20', padding: "2px 8px", borderRadius: 10, fontFamily: 'Outfit', fontWeight: 600 }}>
                          {isRunning ? "BUSY" : "ONLINE"}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: C.muted, marginTop: 6, fontFamily: 'Outfit' }}>
                        Last Job: <span style={{ color: C.subtle }}>{info.lastJob.name}</span> · {info.done} jobs completed
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: 'JetBrains Mono' }}>
                        Heartbeat: {new Date(info.lastJob.updated_at).toLocaleTimeString()}
                      </div>
                    </div>
                    <StatusPill status={info.lastJob.status} />
                  </div>
                );
              })}
            </div>
          )}

          {/* ── FL Orchestrator Tab ── */}
          {activeNav === 'fl' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Header row */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  id="btn-setup-clients"
                  disabled={flSetupLoading}
                  onClick={async () => {
                    setFlSetupLoading(true);
                    try {
                      const res = await fetch(`${API}/fl/setup-clients`, { method: 'POST' });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d.error);
                      showToast(`Registered ${d.count} simulated clients`, 'success');
                      fetchFlScores(); fetchFlRounds();
                    } catch (e) { showToast(e.message, 'error'); }
                    finally { setFlSetupLoading(false); }
                  }}
                  style={{ padding: '8px 16px', borderRadius: 8, fontFamily: 'Outfit', fontSize: 12,
                    background: flSetupLoading ? C.s2 : C.violet + '22', border: `1px solid ${C.violet}50`,
                    color: C.violet, cursor: flSetupLoading ? 'default' : 'pointer', fontWeight: 600 }}
                >
                  {flSetupLoading ? 'Setting up…' : '⚙ Setup Simulated Clients'}
                </button>
                <button
                  id="btn-refresh-scores"
                  onClick={() => { fetchFlScores(); fetchFlRounds(); showToast('Refreshed', 'success'); }}
                  style={{ padding: '8px 16px', borderRadius: 8, fontFamily: 'Outfit', fontSize: 12,
                    background: C.s1, border: `1px solid ${C.border}`, color: C.muted, cursor: 'pointer' }}
                >
                  ↻ Refresh
                </button>
              </div>

              {/* Score distribution chart + Start Round */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
                <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
                  <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: C.text, margin: '0 0 4px' }}>Client Score Distribution</p>
                  <p style={{ fontFamily: 'Outfit', fontSize: 12, color: C.muted, margin: '0 0 16px' }}>Composite score per FL client (0–1 scale)</p>
                  {flScores.length === 0
                    ? <p style={{ color: C.muted, fontFamily: 'Outfit', fontSize: 13 }}>No clients scored yet. Click "Setup Simulated Clients" first.</p>
                    : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={flScores.slice(0, 10).map(s => ({ name: s.client_id.replace('fl-sim-', 'C'), score: s.total }))} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                          <CartesianGrid stroke={C.border} strokeDasharray="3 6" vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 1]} tick={{ fill: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                          <Tooltip content={<Tip />} />
                          <Bar dataKey="score" name="Total Score" radius={[4,4,0,0]}>
                            {flScores.slice(0, 10).map((s, i) => (
                              <Cell key={s.client_id} fill={s.total > 0.75 ? C.lime : s.total > 0.55 ? C.violet : C.pink} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </div>

                {/* Start Round Panel */}
                <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: C.text, margin: 0 }}>Start FL Round</p>
                  {[['Round #', flRoundNum, setFlRoundNum], ['Top-K', flRoundK, setFlRoundK]].map(([label, val, setter]) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontFamily: 'JetBrains Mono', textTransform: 'uppercase' }}>{label}</div>
                      <input type="number" value={val} onChange={e => setter(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
                          background: C.s2, color: C.text, fontSize: 13, fontFamily: 'Outfit', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontFamily: 'JetBrains Mono', textTransform: 'uppercase' }}>Strategy</div>
                    <select value={flRoundStrategy} onChange={e => setFlRoundStrategy(e.target.value)} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
                      <option value="intelligent">Intelligent (O2)</option>
                      <option value="random">Random (Baseline)</option>
                    </select>
                  </div>
                  <button
                    id="btn-start-round"
                    disabled={flRoundLoading}
                    onClick={async () => {
                      setFlRoundLoading(true);
                      try {
                        const res = await fetch(`${API}/fl/rounds`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ round_number: parseInt(flRoundNum), k: parseInt(flRoundK), strategy: flRoundStrategy, duration_ms: 600 })
                        });
                        const d = await res.json();
                        if (!res.ok) throw new Error(d.error);
                        showToast(`Round ${flRoundNum} started — ${d.selection.k_selected} clients selected`, 'success');
                        setFlRoundNum(n => String(parseInt(n) + 1));
                        fetchFlRounds(); fetchFlScores();
                      } catch (e) { showToast(e.message, 'error'); }
                      finally { setFlRoundLoading(false); }
                    }}
                    style={{ marginTop: 4, padding: '10px', borderRadius: 10, fontFamily: 'Outfit', fontSize: 13,
                      border: 'none', background: flRoundLoading ? C.s2 : C.lime, color: flRoundLoading ? C.muted : C.bg,
                      cursor: flRoundLoading ? 'default' : 'pointer', fontWeight: 700, transition: 'all .15s' }}
                  >
                    {flRoundLoading ? 'Starting…' : '▶ Start Round'}
                  </button>
                </div>
              </div>

              {/* Live Client Scores Table */}
              <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
                <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: C.text, margin: '0 0 16px' }}>Live Client Scores</p>
                {flScores.length === 0
                  ? <p style={{ color: C.muted, fontFamily: 'Outfit', fontSize: 13 }}>No scored clients. Setup simulated clients first.</p>
                  : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                        <thead>
                          <tr>
                            {['Rank', 'Client ID', 'Reliability', 'Compute', 'Network', 'Data Quality', 'Availability', 'Total Score', 'Status'].map(h => (
                              <th key={h} style={{ textAlign: 'left', paddingBottom: 10, color: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 400, textTransform: 'uppercase', paddingRight: 12 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {flScores.map(s => {
                            const statusCol = s._client?.status === 'available' ? C.emerald : s._client?.status === 'busy' ? C.amber : C.pink;
                            return (
                              <tr key={s.client_id} style={{ borderTop: `1px solid ${C.border}` }}>
                                <td style={{ padding: '9px 12px 9px 0', fontFamily: 'JetBrains Mono', fontSize: 12, color: C.muted }}>{s.rank}</td>
                                <td style={{ padding: '9px 12px 9px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: C.text, fontWeight: 600 }}>{s.client_id.replace('fl-sim-', '')}</td>
                                {[s.reliability, s.compute, s.network, s.data_quality, s.availability].map((v, vi) => (
                                  <td key={vi} style={{ padding: '9px 12px 9px 0', fontFamily: 'JetBrains Mono', fontSize: 11 }}>
                                    <span style={{ color: v >= 0.7 ? C.emerald : v >= 0.4 ? C.amber : C.pink }}>{(v * 100).toFixed(0)}%</span>
                                  </td>
                                ))}
                                <td style={{ padding: '9px 12px 9px 0' }}>
                                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700,
                                    color: s.total >= 0.70 ? C.lime : s.total >= 0.50 ? C.amber : C.pink }}>
                                    {s.total.toFixed(3)}
                                  </span>
                                </td>
                                <td style={{ padding: '9px 0' }}>
                                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10,
                                    background: statusCol + '18', color: statusCol, fontFamily: 'Outfit', fontWeight: 600,
                                    border: `1px solid ${statusCol}40` }}>
                                    {s._client?.status || '—'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>

              {/* FL Rounds History */}
              <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
                <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: C.text, margin: '0 0 16px' }}>FL Rounds History</p>
                {flRounds.length === 0
                  ? <p style={{ color: C.muted, fontFamily: 'Outfit', fontSize: 13 }}>No FL rounds run yet.</p>
                  : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['Round #', 'Strategy', 'K', 'Selected', 'Avg Score', 'Avg Reliability', 'Status', 'Time'].map(h => (
                              <th key={h} style={{ textAlign: 'left', paddingBottom: 10, color: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 400, textTransform: 'uppercase', paddingRight: 16 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {flRounds.map(r => {
                            const stratCol = r.strategy === 'intelligent' ? C.lime : C.violet;
                            const statCol = r.status === 'done' ? C.emerald : r.status === 'running' ? C.lime : r.status === 'failed' ? C.pink : C.muted;
                            return (
                              <tr key={r.id} onClick={() => fetchFlRoundDetail(r.id)}
                                style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}
                                onMouseEnter={e => e.currentTarget.style.background = C.s2}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <td style={{ padding: '10px 16px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 12, color: C.text, fontWeight: 600 }}>#{r.round_number}</td>
                                <td style={{ padding: '10px 16px 10px 0' }}>
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontFamily: 'Outfit', fontWeight: 600,
                                    background: stratCol + '18', color: stratCol, border: `1px solid ${stratCol}40` }}>
                                    {r.strategy}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 16px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted }}>{r.k}</td>
                                <td style={{ padding: '10px 16px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: C.text }}>{r.clients_selected ?? '—'}/{r.k}</td>
                                <td style={{ padding: '10px 16px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: C.lime }}>{r.avg_selected_score ? Number(r.avg_selected_score).toFixed(3) : '—'}</td>
                                <td style={{ padding: '10px 16px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: C.emerald }}>{r.avg_selected_reliability ? Number(r.avg_selected_reliability).toFixed(3) : '—'}</td>
                                <td style={{ padding: '10px 16px 10px 0' }}>
                                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontFamily: 'Outfit',
                                    background: statCol + '18', color: statCol, border: `1px solid ${statCol}40`, fontWeight: 600 }}>
                                    {r.status}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 0', fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted }}>{new Date(r.created_at).toLocaleTimeString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                {/* Round detail drawer */}
                {flSelectedRound && (
                  <div style={{ marginTop: 16, background: C.s2, borderRadius: 14, border: `1px solid ${C.border}`, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: C.text, margin: 0 }}>
                        Round #{flSelectedRound.round_number} — {flSelectedRound.strategy} — Client Rankings
                      </p>
                      <button onClick={() => setFlSelectedRound(null)} style={{ border: 'none', background: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>✕</button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Rank', 'Client', 'Reliability', 'Compute', 'Network', 'Data Quality', 'Total', 'Selected'].map(h => (
                            <th key={h} style={{ textAlign: 'left', paddingBottom: 8, color: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 400, textTransform: 'uppercase', paddingRight: 12 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(flSelectedRound.selection_results || []).map(r => (
                          <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ padding: '8px 12px 8px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted }}>{r.rank}</td>
                            <td style={{ padding: '8px 12px 8px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: C.text }}>{r.client_id.replace('fl-sim-', '')}</td>
                            {[r.reliability_score, r.compute_score, r.network_score, r.data_quality_score].map((v, i) => (
                              <td key={i} style={{ padding: '8px 12px 8px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: parseFloat(v) >= 0.7 ? C.emerald : parseFloat(v) >= 0.4 ? C.amber : C.pink }}>
                                {(parseFloat(v) * 100).toFixed(0)}%
                              </td>
                            ))}
                            <td style={{ padding: '8px 12px 8px 0', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: parseFloat(r.total_score) >= 0.7 ? C.lime : C.amber }}>{Number(r.total_score).toFixed(3)}</td>
                            <td style={{ padding: '8px 0' }}>
                              {r.selected
                                ? <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 10, background: C.lime + '18', color: C.lime, fontFamily: 'Outfit', fontWeight: 700, border: `1px solid ${C.lime}40` }}>✓ Selected</span>
                                : <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 10, background: C.muted + '18', color: C.muted, fontFamily: 'Outfit', border: `1px solid ${C.border}` }}>Not Selected</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Experiment Runner */}
              <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
                <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 16, color: C.lime, margin: '0 0 4px' }}>⚗ Run O2 Baseline Comparison Experiment</p>
                <p style={{ fontFamily: 'Outfit', fontSize: 13, color: C.muted, margin: '0 0 18px' }}>
                  Runs <strong style={{ color: C.text }}>Random</strong> vs <strong style={{ color: C.lime }}>Intelligent</strong> selection over N rounds each.
                  Uses real TaskQueue infrastructure. Model accuracy is simulated analytically.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  {[['Rounds per strategy', flExpRounds, setFlExpRounds], ['Top-K', flExpK, setFlExpK], ['Failure probability', flExpFailProb, setFlExpFailProb]].map(([label, val, setter]) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, fontFamily: 'JetBrains Mono', textTransform: 'uppercase' }}>{label}</div>
                      <input type="text" value={val} onChange={e => setter(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
                          background: C.s2, color: C.text, fontSize: 13, fontFamily: 'Outfit', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                </div>
                <button
                  id="btn-run-experiment"
                  disabled={flExpLoading}
                  onClick={async () => {
                    setFlExpLoading(true); setFlExpResult(null);
                    try {
                      const res = await fetch(`${API}/fl/experiment`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rounds: parseInt(flExpRounds), k: parseInt(flExpK), fail_prob: parseFloat(flExpFailProb), duration_ms: 500, reset: true })
                      });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d.error);
                      setFlExpResult(d);
                      showToast('Experiment completed!', 'success');
                      fetchFlRounds(); fetchFlScores();
                    } catch (e) { showToast(`Experiment failed: ${e.message}`, 'error'); }
                    finally { setFlExpLoading(false); }
                  }}
                  style={{ padding: '11px 28px', borderRadius: 10, fontFamily: 'Outfit', fontSize: 13,
                    border: 'none', background: flExpLoading ? C.s2 : C.lime,
                    color: flExpLoading ? C.muted : C.bg, cursor: flExpLoading ? 'default' : 'pointer',
                    fontWeight: 700, transition: 'all .15s' }}
                >
                  {flExpLoading ? '⏳ Running experiment (this takes ~1–2 min)…' : '⚗ Run Experiment'}
                </button>

                {flExpResult && (
                  <div style={{ marginTop: 20 }}>
                    <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: C.text, margin: '0 0 12px' }}>Experiment Results</p>
                    <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            {['Metric', 'Random (Baseline)', 'Intelligent (O2)', 'Improvement'].map(h => (
                              <th key={h} style={{ textAlign: 'left', paddingBottom: 10, paddingRight: 20, color: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 400, textTransform: 'uppercase' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ['Final Accuracy', flExpResult.random?.summary?.final_accuracy?.toFixed(4), flExpResult.intelligent?.summary?.final_accuracy?.toFixed(4), '+' + flExpResult.comparison?.accuracy_improvement?.toFixed(4), flExpResult.comparison?.accuracy_improvement > 0],
                            ['Final Loss', flExpResult.random?.summary?.final_loss?.toFixed(4), flExpResult.intelligent?.summary?.final_loss?.toFixed(4), '-' + flExpResult.comparison?.loss_reduction?.toFixed(4), flExpResult.comparison?.loss_reduction > 0],
                            ['Avg Selected Score', flExpResult.random?.summary?.avg_selected_score?.toFixed(4), flExpResult.intelligent?.summary?.avg_selected_score?.toFixed(4), '+' + flExpResult.comparison?.score_improvement?.toFixed(4), flExpResult.comparison?.score_improvement > 0],
                            ['Avg Reliability', flExpResult.random?.summary?.avg_selected_reliability?.toFixed(4), flExpResult.intelligent?.summary?.avg_selected_reliability?.toFixed(4), '+' + flExpResult.comparison?.reliability_improvement?.toFixed(4), flExpResult.comparison?.reliability_improvement > 0],
                            ['Total Job Failures', flExpResult.random?.summary?.total_job_failures, flExpResult.intelligent?.summary?.total_job_failures, (flExpResult.comparison?.failure_reduction ?? 0) + ' fewer', flExpResult.comparison?.failure_reduction > 0],
                            ['Recovery Events', flExpResult.random?.summary?.total_recovery_events, flExpResult.intelligent?.summary?.total_recovery_events, (flExpResult.comparison?.recovery_reduction ?? 0) + ' fewer', flExpResult.comparison?.recovery_reduction >= 0],
                            ['Avg Round Time (ms)', flExpResult.random?.summary?.avg_round_time_ms, flExpResult.intelligent?.summary?.avg_round_time_ms, (flExpResult.comparison?.avg_time_diff_ms ?? 0) + 'ms', flExpResult.comparison?.avg_time_diff_ms <= 0],
                            ['Task Success Rate', flExpResult.random?.summary?.avg_task_success_rate?.toFixed(4), flExpResult.intelligent?.summary?.avg_task_success_rate?.toFixed(4), '+' + flExpResult.comparison?.task_success_improvement?.toFixed(4), flExpResult.comparison?.task_success_improvement > 0],
                          ].map(([metric, randVal, intVal, delta, positive]) => (
                            <tr key={metric} style={{ borderTop: `1px solid ${C.border}` }}>
                              <td style={{ padding: '10px 20px 10px 0', fontFamily: 'Outfit', fontSize: 13, color: C.subtle, fontWeight: 500 }}>{metric}</td>
                              <td style={{ padding: '10px 20px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 12, color: C.violet }}>{randVal}</td>
                              <td style={{ padding: '10px 20px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 12, color: C.lime, fontWeight: 700 }}>{intVal}</td>
                              <td style={{ padding: '10px 0', fontFamily: 'JetBrains Mono', fontSize: 12, color: positive ? C.emerald : C.pink, fontWeight: 600 }}>{delta}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div style={{ background: C.s2, borderRadius: 14, padding: '16px 20px' }}>
                        <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 13, color: C.text, margin: '0 0 12px' }}>Accuracy vs FL Rounds</p>
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                            <CartesianGrid stroke={C.border} strokeDasharray="3 6" vertical={false} />
                            <XAxis dataKey="round_number" type="number" domain={[1, parseInt(flExpRounds)]} tick={{ fill: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0.4, 1]} tick={{ fill: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                            <Tooltip content={<Tip />} />
                            <Line data={flExpResult.random?.rounds_data || []} dataKey="cumulative_accuracy" name="Random" stroke={C.violet} strokeWidth={2} dot={{ r: 3, fill: C.violet }} type="monotone" />
                            <Line data={flExpResult.intelligent?.rounds_data || []} dataKey="cumulative_accuracy" name="Intelligent" stroke={C.lime} strokeWidth={2} dot={{ r: 3, fill: C.lime }} type="monotone" />
                          </LineChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                          <span style={{ fontSize: 11, color: C.violet, fontFamily: 'Outfit' }}>● Random</span>
                          <span style={{ fontSize: 11, color: C.lime, fontFamily: 'Outfit' }}>● Intelligent</span>
                        </div>
                      </div>
                      <div style={{ background: C.s2, borderRadius: 14, padding: '16px 20px' }}>
                        <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 13, color: C.text, margin: '0 0 12px' }}>Avg Selected Score per Round</p>
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                            <CartesianGrid stroke={C.border} strokeDasharray="3 6" vertical={false} />
                            <XAxis dataKey="round_number" type="number" domain={[1, parseInt(flExpRounds)]} tick={{ fill: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 1]} tick={{ fill: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                            <Tooltip content={<Tip />} />
                            <Line data={flExpResult.random?.rounds_data || []} dataKey="avg_selected_score" name="Random Avg Score" stroke={C.violet} strokeWidth={2} dot={{ r: 3, fill: C.violet }} type="monotone" />
                            <Line data={flExpResult.intelligent?.rounds_data || []} dataKey="avg_selected_score" name="Intelligent Avg Score" stroke={C.lime} strokeWidth={2} dot={{ r: 3, fill: C.lime }} type="monotone" />
                          </LineChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                          <span style={{ fontSize: 11, color: C.violet, fontFamily: 'Outfit' }}>● Random</span>
                          <span style={{ fontSize: 11, color: C.lime, fontFamily: 'Outfit' }}>● Intelligent</span>
                        </div>
                      </div>
                    </div>
                    <p style={{ fontFamily: 'Outfit', fontSize: 11, color: C.muted, marginTop: 12 }}>
                      ⚠ Model accuracy is analytically simulated based on selected-client data quality × reliability scores.
                      Round timing, job counts, failure counts, and recovery events are real measurements from the TaskQueue infrastructure.
                    </p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── FL Clients tab ── */}
          {activeNav === 'fl_clients' && (() => {
            // Sorting
            const sortClients = (list) => {
              const { key, dir } = flClientSort;
              return [...list].sort((a, b) => {
                const av = key === 'score' ? (a.score ?? -1) : (a[key] ?? '');
                const bv = key === 'score' ? (b.score ?? -1) : (b[key] ?? '');
                if (typeof av === 'number' && typeof bv === 'number') return dir === 'desc' ? bv - av : av - bv;
                return dir === 'desc' ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
              });
            };
            const toggleSort = (key) => setFlClientSort(prev =>
              prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }
            );
            const colHdr = (label, key) => (
              <th
                onClick={() => toggleSort(key)}
                style={{ textAlign: 'left', padding: '10px 12px 10px 0', color: flClientSort.key === key ? C.lime : C.muted,
                  fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 400, textTransform: 'uppercase',
                  cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
              >{label} {flClientSort.key === key ? (flClientSort.dir === 'desc' ? '↓' : '↑') : ''}</th>
            );

            let visClients = flClients;
            if (flClientsFilter !== 'all') visClients = visClients.filter(c => c.status === flClientsFilter);
            if (flClientsSearch.trim()) {
              const q = flClientsSearch.toLowerCase();
              visClients = visClients.filter(c =>
                (c.id || '').toLowerCase().includes(q) ||
                (c.name || '').toLowerCase().includes(q) ||
                (c.source || '').toLowerCase().includes(q)
              );
            }
            visClients = sortClients(visClients);

            const statusColor = (s) => s === 'active' ? C.emerald : s === 'unhealthy' ? C.pink : C.muted;
            const bar = (v, color) => (
              <div style={{ width: 60, height: 5, borderRadius: 3, background: C.s2, overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle', marginLeft: 6 }}>
                <div style={{ width: `${Math.min((v ?? 0) * 100, 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
              </div>
            );

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ── Stats bar ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Total Clients', value: flClients.length, accent: C.lime },
                    { label: 'Active', value: flClients.filter(c => c.status === 'active').length, accent: C.emerald },
                    { label: 'Unhealthy', value: flClients.filter(c => c.status === 'unhealthy').length, accent: C.pink },
                    { label: 'On Cooldown', value: flClients.filter(c => (c.cooldown_rounds_left || 0) > 0).length, accent: C.amber },
                  ].map(({ label, value, accent }) => (
                    <div key={label} style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 20px' }}>
                      <p style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</p>
                      <p style={{ fontFamily: 'DM Serif Display', fontSize: 34, color: accent, margin: 0, lineHeight: 1 }}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* ── Controls row ── */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    placeholder="Search by id / name / source…"
                    value={flClientsSearch}
                    onChange={e => setFlClientsSearch(e.target.value)}
                    style={{ ...selectStyle, width: 240, padding: '7px 14px', borderRadius: 20 }}
                  />
                  {['all', 'active', 'inactive', 'unhealthy'].map(s => (
                    <button key={s} onClick={() => setFlClientsFilter(s)} style={{
                      fontSize: 12, padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'Outfit',
                      border: flClientsFilter === s ? `1px solid ${C.lime}50` : `1px solid ${C.border}`,
                      background: flClientsFilter === s ? `${C.lime}14` : 'transparent',
                      color: flClientsFilter === s ? C.lime : C.muted,
                    }}>{s}</button>
                  ))}
                  <button onClick={fetchFlClients} style={{
                    marginLeft: 'auto', fontSize: 12, padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${C.border}`, background: 'transparent', color: C.subtle, fontFamily: 'Outfit',
                  }}>↻ Refresh</button>
                  <a href={`${API}/fl/clients/template`} download style={{
                    fontSize: 12, padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${C.violet}50`, background: `${C.violet}12`, color: C.violet,
                    fontFamily: 'Outfit', textDecoration: 'none', display: 'inline-block',
                  }}>⬇ Template CSV</a>
                  <a href={`${API}/fl/clients/export`} download style={{
                    fontSize: 12, padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${C.emerald}50`, background: `${C.emerald}12`, color: C.emerald,
                    fontFamily: 'Outfit', textDecoration: 'none', display: 'inline-block',
                  }}>⬇ Export CSV</a>
                </div>

                {/* ── Client Table ── */}
                <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '20px 24px', overflowX: 'auto' }}>
                  <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: C.text, margin: '0 0 16px' }}>
                    Client Roster <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted, marginLeft: 8 }}>{visClients.length} shown</span>
                  </p>
                  {flClientsLoading && <p style={{ fontFamily: 'Outfit', fontSize: 13, color: C.muted }}>Loading…</p>}
                  {!flClientsLoading && flClients.length === 0 && (
                    <p style={{ fontFamily: 'Outfit', fontSize: 13, color: C.muted }}>
                      No clients registered. Use the Seed panel below to generate some.
                    </p>
                  )}
                  {visClients.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                      <thead>
                        <tr>
                          {colHdr('ID', 'id')}
                          {colHdr('Name', 'name')}
                          {colHdr('Status', 'status')}
                          {colHdr('CPU', 'cpu_cores')}
                          {colHdr('RAM', 'ram_gb')}
                          {colHdr('Latency', 'network_latency_ms')}
                          {colHdr('Dataset', 'dataset_size')}
                          {colHdr('Quality', 'data_quality')}
                          {colHdr('Score', 'score')}
                          {colHdr('Source', 'source')}
                          <th style={{ color: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono', textTransform: 'uppercase', padding: '10px 0' }}>Toggle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visClients.map(c => (
                          <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}
                            onMouseEnter={e => e.currentTarget.style.background = C.s2}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '10px 12px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: C.subtle, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.id}</td>
                            <td style={{ padding: '10px 12px 10px 0', fontFamily: 'Outfit', fontSize: 13, color: C.text }}>{c.name}</td>
                            <td style={{ padding: '10px 12px 10px 0' }}>
                              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: statusColor(c.status) + '18', color: statusColor(c.status), border: `1px solid ${statusColor(c.status)}40`, fontFamily: 'Outfit', fontWeight: 600 }}>{c.status}</span>
                            </td>
                            <td style={{ padding: '10px 12px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 12, color: C.subtle }}>{c.cpu_cores}c</td>
                            <td style={{ padding: '10px 12px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 12, color: C.subtle }}>{c.ram_gb}GB</td>
                            <td style={{ padding: '10px 12px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 12, color: (c.network_latency_ms || 0) > 150 ? C.amber : C.subtle }}>{c.network_latency_ms}ms</td>
                            <td style={{ padding: '10px 12px 10px 0', fontFamily: 'JetBrains Mono', fontSize: 12, color: C.subtle }}>{(c.dataset_size || 0).toLocaleString()}</td>
                            <td style={{ padding: '10px 12px 10px 0' }}>
                              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: (c.data_quality || 0) >= 0.8 ? C.emerald : (c.data_quality || 0) >= 0.6 ? C.amber : C.pink }}>{(c.data_quality || 0).toFixed(2)}</span>
                            </td>
                            <td style={{ padding: '10px 12px 10px 0' }}>
                              {c.score != null && (
                                <>
                                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: C.lime, fontWeight: 700 }}>{c.score.toFixed(3)}</span>
                                  {bar(c.score, C.lime)}
                                </>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px 10px 0', fontFamily: 'Outfit', fontSize: 11, color: C.muted }}>{c.source}</td>
                            <td style={{ padding: '10px 0' }}>
                              <button
                                onClick={() => toggleClientStatus(c.id, c.status)}
                                style={{
                                  fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Outfit',
                                  border: `1px solid ${c.status === 'active' ? C.pink + '50' : C.emerald + '50'}`,
                                  background: c.status === 'active' ? `${C.pink}12` : `${C.emerald}12`,
                                  color: c.status === 'active' ? C.pink : C.emerald,
                                }}
                              >{c.status === 'active' ? 'Deactivate' : 'Activate'}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* ── Bottom row: Generate + Selection Preview ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>

                  {/* Generate panel */}
                  <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '20px 24px' }}>
                    <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: C.text, margin: '0 0 4px' }}>Generate Clients</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 12, color: C.muted, margin: '0 0 16px' }}>Seed simulated FL clients into the registry</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'Outfit', fontSize: 12, color: C.subtle }}>Count</span>
                        <input
                          type="number" min="1" max="100" value={flSeedCount}
                          onChange={e => setFlSeedCount(e.target.value)}
                          style={{ ...selectStyle, width: 80, textAlign: 'right' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'Outfit', fontSize: 12, color: C.subtle }}>Profile</span>
                        <select value={flSeedProfile} onChange={e => setFlSeedProfile(e.target.value)} style={selectStyle}>
                          <option value="mixed">Mixed</option>
                          <option value="reliable">Reliable</option>
                          <option value="flaky">Flaky</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'Outfit', fontSize: 12, color: C.subtle }}>Seed</span>
                        <input
                          type="number" value={flSeedSeed}
                          onChange={e => setFlSeedSeed(e.target.value)}
                          style={{ ...selectStyle, width: 80, textAlign: 'right' }}
                        />
                      </div>
                      <button
                        onClick={seedClients}
                        disabled={flSeedLoading}
                        style={{
                          marginTop: 8, fontSize: 13, padding: '9px', borderRadius: 10, fontFamily: 'Outfit',
                          border: 'none', background: flSeedLoading ? C.s2 : C.violet, color: flSeedLoading ? C.muted : '#fff',
                          cursor: flSeedLoading ? 'default' : 'pointer', fontWeight: 600,
                        }}
                      >{flSeedLoading ? 'Generating…' : '✦ Generate Clients'}</button>
                    </div>
                  </div>

                  {/* Selection Preview panel */}
                  <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '20px 24px' }}>
                    <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: C.text, margin: '0 0 4px' }}>Selection Preview</p>
                    <p style={{ fontFamily: 'Outfit', fontSize: 12, color: C.muted, margin: '0 0 16px' }}>Preview which clients would be picked — no round started</p>

                    {/* Controls */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={flPreviewStrategy} onChange={e => setFlPreviewStrategy(e.target.value)} style={selectStyle}>
                        <option value="intelligent">Intelligent</option>
                        <option value="random">Random</option>
                        <option value="epsilon_greedy">Epsilon-Greedy</option>
                      </select>
                      <span style={{ fontFamily: 'Outfit', fontSize: 12, color: C.muted }}>K =</span>
                      <input type="number" min="1" max="20" value={flPreviewK}
                        onChange={e => setFlPreviewK(e.target.value)}
                        style={{ ...selectStyle, width: 60 }}
                      />
                      <button onClick={runSelectionPreview} disabled={flPreviewLoading} style={{
                        fontSize: 12, padding: '7px 18px', borderRadius: 8, cursor: flPreviewLoading ? 'default' : 'pointer',
                        border: 'none', background: flPreviewLoading ? C.s2 : C.lime, color: flPreviewLoading ? C.muted : C.bg,
                        fontFamily: 'Outfit', fontWeight: 600,
                      }}>{flPreviewLoading ? 'Running…' : '▶ Preview'}</button>
                    </div>

                    {/* Weight sliders */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', marginBottom: 14 }}>
                      {Object.entries(flPreviewWeights).map(([factor, val]) => (
                        <div key={factor}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.subtle, textTransform: 'uppercase' }}>{factor.replace('_', ' ')}</span>
                            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.lime }}>{(val * 100).toFixed(0)}%</span>
                          </div>
                          <input type="range" min="0" max="1" step="0.01" value={val}
                            onChange={e => setFlPreviewWeights(prev => ({ ...prev, [factor]: parseFloat(e.target.value) }))}
                            style={{ width: '100%', accentColor: C.lime, cursor: 'pointer' }}
                          />
                        </div>
                      ))}
                    </div>
                    <p style={{ fontFamily: 'Outfit', fontSize: 11, color: C.muted, margin: '0 0 14px' }}>
                      Sum: <span style={{ color: Math.abs(Object.values(flPreviewWeights).reduce((s,v)=>s+v,0) - 1) < 0.01 ? C.emerald : C.amber }}>
                        {Object.values(flPreviewWeights).reduce((s,v)=>s+v,0).toFixed(2)}
                      </span> — auto-normalised on run
                    </p>

                    {/* Results */}
                    {flPreviewResult && (
                      <div style={{ background: C.s2, borderRadius: 12, padding: '14px 16px' }}>
                        <p style={{ fontFamily: 'Outfit', fontSize: 12, color: C.muted, margin: '0 0 10px' }}>
                          {flPreviewResult.k_selected}/{flPreviewResult.k_requested} selected · {flPreviewResult.eligible_count}/{flPreviewResult.total_pool} eligible
                          {flPreviewResult.warning && <span style={{ color: C.amber, marginLeft: 8 }}>⚠ {flPreviewResult.warning}</span>}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {(flPreviewResult.all || []).map(c => (
                            <div key={c.id} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 12px', borderRadius: 10,
                              background: c.selected ? `${C.lime}10` : 'transparent',
                              border: `1px solid ${c.selected ? C.lime + '30' : C.border}`,
                            }}>
                              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: c.selected ? C.lime : C.muted, minWidth: 40 }}>#{c.rank}</span>
                              <span style={{ fontFamily: 'Outfit', fontSize: 13, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.id}</span>
                              {/* Factor stacked bar */}
                              <div style={{ display: 'flex', gap: 2, height: 12, width: 100, flexShrink: 0 }}>
                                {c.breakdown && Object.entries(c.breakdown).map(([f, v], i) => {
                                  const cols = [C.lime, C.violet, C.pink, C.amber, C.emerald];
                                  return <div key={f} title={`${f}: ${v.toFixed(3)}`} style={{ flex: v, background: cols[i % 5], borderRadius: 2, opacity: 0.85 }} />;
                                })}
                              </div>
                              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: c.selected ? C.lime : C.muted, fontWeight: c.selected ? 700 : 400, minWidth: 42, textAlign: 'right' }}>{c.score.toFixed(3)}</span>
                              {c.selected && <span style={{ fontSize: 10, color: C.lime }}>✓</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            );
          })()}

        </div>
      </div>


      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: C.s1, border: `1px solid ${toast.type === "success" ? C.lime : C.pink}`,
          color: toast.type === "success" ? C.lime : C.pink,
          borderRadius: 12, padding: "12px 20px", fontSize: 13, fontFamily: 'Outfit',
          boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
          animation: "slideUp .2s ease", zIndex: 100, fontWeight: 500
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        body { margin:0; background: ${C.bg}; }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius:6px; }
      `}</style>
    </div>
  )
}
