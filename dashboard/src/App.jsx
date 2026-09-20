import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Database, Activity, Settings,
  Zap, ArrowUpRight, ArrowDownRight, Clock, AlertCircle, TrendingUp, CheckCircle2
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

const API = "http://localhost:3000";
const WS  = "ws://localhost:3001";

// ─── palette ────────────────────────────────────────────────────────────────
const C = {
  bg:       '#05030E',
  s1:       '#0C0920',   // surface 1
  s2:       '#120E2A',   // surface 2
  border:   '#221A42',
  lime:     '#CCFF00',   // primary accent
  pink:     '#FF3CAC',   // secondary accent
  violet:   '#7B5CE8',   // tertiary
  amber:    '#FFB800',
  emerald:  '#00E5A0',
  text:     '#EDE8F8',
  muted:    '#5A4B7A',
  subtle:   '#9385BE',
}

const navItems = [
  { id: 'dashboard',  label: 'Overview',     icon: LayoutDashboard },
  { id: 'jobs',       label: 'Jobs',         icon: Database },
  { id: 'workflows',  label: 'Workflows',    icon: Activity },
  { id: 'workers',    label: 'Workers',      icon: Zap },
  { id: 'deadletter', label: 'Dead-letter',  icon: AlertCircle },
]

const JOB_TYPES = [
  "send_welcome_email","resize_image","generate_invoice",
  "fraud_check","send_otp_sms","slow_job","fail_always"
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
  
  const [jobs, setJobs]             = useState([]);
  const [workflows, setWorkflows]   = useState([]);
  const [throughput, setTP]         = useState(Array.from({length:12}, () => ({ t:"", v:0 })));
  const [wsStatus, setWsStatus]     = useState("connecting");
  const [healthStatus, setHealthStatus] = useState(null);
  const [filter, setFilter]         = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected]     = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitName, setSubmitName] = useState("send_welcome_email");
  const [submitQueue, setSubmitQueue] = useState("default");
  const [submitDelay, setSubmitDelay] = useState("0");
  const [toast, setToast]           = useState(null);
  const [nlDescription, setNlDescription] = useState("");
  const [nlLoading, setNlLoading]   = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  
  const triggerRef = useRef(null)
  const sidebarRef = useRef(null)
  const wsRef = useRef(null);

  useEffect(() => { setTimeout(() => setMounted(true), 80) }, [])

  const showSidebar  = () => setSidebarVisible(true)
  const hideSidebar  = () => setSidebarVisible(false)

  async function fetchJobs() {
    try { setJobs(await (await fetch(`${API}/jobs?limit=200`)).json()); }
    catch(e) { console.error(e); }
  }
  async function fetchWorkflows() {
    try { setWorkflows(await (await fetch(`${API}/workflows`)).json()); }
    catch(e) { console.error(e); }
  }
  async function fetchWorkflowDetail(id) {
    try { setSelectedWorkflow(await (await fetch(`${API}/workflows/${id}`)).json()); }
    catch(e) { console.error(e); }
  }
  async function fetchHealth() {
    try { setHealthStatus(await (await fetch(`${API}/health`)).json()); }
    catch(e) { console.error(e); }
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
            const now = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
            return [...prev.slice(1), { t: now, v: (prev[prev.length-1]?.v || 0) + 1 }];
          });
          fetchHealth(); 
        }
      };
      ws.onclose = () => { setWsStatus("reconnecting"); setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    }
    connect();
    const iv = setInterval(() => { fetchJobs(); fetchWorkflows(); fetchHealth(); }, 10000);
    return () => { clearInterval(iv); wsRef.current?.close(); };
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
      const body = { name: submitName, queue: submitQueue, payload: { to: "demo@example.com" } };
      const delay = parseInt(submitDelay, 10);
      if (delay > 0) body.delay_seconds = delay;
      const res = await fetch(`${API}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json()).error || "failed");
      showToast(`Enqueued ${submitName} → ${submitQueue}${delay ? ` (in ${delay}s)` : ""}`, "success");
      setShowSubmit(false);
      fetchJobs();
    } catch(e) { showToast(`Failed: ${e.message}`, "error"); }
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
    } catch(e) { showToast(`AI failed: ${e.message}`, "error"); }
    finally { setNlLoading(false); }
  }

  async function requeueJob(jobId) {
    try {
      const res = await fetch(`${API}/jobs/${jobId}/requeue`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "failed");
      showToast("Job requeued", "success");
      fetchJobs();
    } catch(e) { showToast(`Requeue failed: ${e.message}`, "error"); }
  }

  let filtered = filter === "all" ? jobs : jobs.filter(j => j.status === filter);
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(j => 
      j.id.toLowerCase().includes(q) || 
      j.name.toLowerCase().includes(q) || 
      j.queue.toLowerCase().includes(q) || 
      (j.worker_id && j.worker_id.toLowerCase().includes(q)) ||
      j.status.toLowerCase().includes(q)
    );
  }

  const counts     = jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status]||0)+1; return acc; }, {});
  const queueDepth = ["high","default","low"].map(q => ({
    name: q,
    count: jobs.filter(j => j.queue === q && ["pending","running"].includes(j.status)).length
  }));
  const maxQ = Math.max(1, ...queueDepth.map(q => q.count));

  const workerMap = {};
  jobs.forEach(j => {
    if (j.worker_id) {
      if (!workerMap[j.worker_id]) workerMap[j.worker_id] = { lastJob: j, done: 0, running: 0 };
      if (j.status === "running") workerMap[j.worker_id].running++;
      if (j.status === "done")    workerMap[j.worker_id].done++;
      const cur = workerMap[j.worker_id].lastJob;
      if (new Date(j.updated_at||j.created_at) > new Date(cur.updated_at||cur.created_at))
        workerMap[j.worker_id].lastJob = j;
    }
  });
  const workers    = Object.entries(workerMap);
  const retrying   = jobs.filter(j => j.status === "retrying");
  const failedList = jobs.filter(j => j.status === "failed" || j.status === "retrying").slice(0, 5);
  const deadletter = jobs.filter(j => j.status === "failed");

  return (
    <div style={{ width: '100vw', height: '100vh', background: C.bg, overflow: 'hidden', position: 'relative',
      opacity: mounted ? 1 : 0, transition: 'opacity 0.5s ease', color: C.text }}>

      {/* ── hover trigger zone ── */}
      <div
        ref={triggerRef}
        onMouseEnter={showSidebar}
        style={{ position: 'fixed', top: 0, left: 0, width: 32, height: '100vh', zIndex: 50, cursor: 'default' }}
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
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${C.lime}, ${C.violet})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
      <div style={{ width: '100%', height: '100vh', overflow: 'hidden auto', padding: '0 0 32px' }}>
        
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
            <BigStat label="Total Jobs"   value={jobs.length} delta={`${counts.done||0} done`} up accent={C.lime} />
            <BigStat label="Queued"       value={counts.pending||0} delta="active queue" up accent={C.amber} />
            <BigStat label="Failed"       value={counts.failed||0} delta={counts.failed ? "needs review" : "all clear"} up={!counts.failed} accent={counts.failed ? C.pink : C.emerald} />
          </div>
        </div>

        <div style={{ margin: '24px 40px', height: 1, background: C.border }} />

        <div style={{ padding: '0 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          
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
                    padding: '6px 12px', borderRadius: 8, background: C.lime+'10', border: `1px solid ${C.lime}40`,
                    color: C.lime, fontFamily: 'Outfit', fontSize: 12, cursor: 'pointer', fontWeight: 500
                  }}>+ Enqueue Job</button>
                </div>

                {showSubmit && (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16, padding: '12px', background: C.s2, borderRadius: 12, border: `1px solid ${C.border}` }}>
                     <select value={submitName} onChange={e => setSubmitName(e.target.value)} style={selectStyle}>
                        {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={submitQueue} onChange={e => setSubmitQueue(e.target.value)} style={selectStyle}>
                        <option value="high">high priority</option>
                        <option value="default">default</option>
                        <option value="low">low priority</option>
                      </select>
                      <button onClick={submitJob} style={{
                        fontSize:12, padding:"6px 16px", borderRadius:8, fontFamily: 'Outfit',
                        border:"none", background: C.lime, color: C.s1, cursor:"pointer", fontWeight:600
                      }}>Run</button>
                  </div>
                )}

                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={throughput} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gLime" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={C.lime} stopOpacity={0.18} />
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
                      <div style={{ height: '100%', width: `${Math.min(d.count/maxQ*100, 100)}%`, background: col, borderRadius: 99, transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }} />
                    </div>
                  </div>
                )})}
                
                <div style={{ marginTop: 24, padding: '12px', borderRadius: 10, background: C.s2, border: `1px solid ${C.border}` }}>
                  <p style={{ fontFamily: 'Outfit', fontSize: 12, color: C.muted, margin: 0, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Workers Online:</span> <span style={{color: C.lime}}>{workers.length}</span>
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
                 <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {["ID", "Job", "Queue", "Status"].map(h => (
                           <th key={h} style={{ textAlign: 'left', paddingBottom: 10, color: C.muted, fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 400, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0,6).map(j => (
                        <tr key={j.id} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={{ padding: '10px 0', fontFamily: 'JetBrains Mono', fontSize: 11, color: C.subtle }}>{j.id.slice(0,8)}</td>
                          <td style={{ padding: '10px 0', fontFamily: 'Outfit', fontSize: 13, color: C.text }}>{j.name}</td>
                          <td style={{ padding: '10px 0' }}><QueueBadge queue={j.queue} /></td>
                          <td style={{ padding: '10px 0' }}><StatusPill status={j.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
                 <p style={{ fontFamily: 'Outfit', fontSize: 12, color: C.lime, margin: '12px 0 0', cursor: 'pointer' }} onClick={() => setActiveNav('jobs')}>View all jobs →</p>
              </div>

            </div>
          )}

          {/* ── jobs table view ── */}
          {(activeNav === 'jobs' || activeNav === 'deadletter') && (
            <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {["all","running","pending","done","failed","retrying"].map(s => {
                  const active = filter === s;
                  return (
                    <button key={s} onClick={() => setFilter(s)} style={{
                      fontSize: 12, padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontFamily: 'Outfit',
                      border: active ? `1px solid ${C.lime}50` : `1px solid ${C.border}`,
                      background: active ? `${C.lime}14` : 'transparent',
                      color: active ? C.lime : C.muted, transition: "all .15s"
                    }}>
                      {s} {counts[s] ? <span style={{ opacity:.7, fontSize: 10, marginLeft: 4 }}>{counts[s]}</span> : ""}
                    </button>
                  );
                })}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth: 600 }}>
                  <thead>
                    <tr>
                      {["ID", "Job", "Queue", "Worker", "Status", "Attempts", "Created"].map(h => (
                        <th key={h} style={{
                          textAlign:"left", padding:"12px",
                          color: C.muted, fontWeight:400, fontSize:10, fontFamily: 'JetBrains Mono',
                          borderBottom: `1px solid ${C.border}`,
                          textTransform:"uppercase"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeNav === 'deadletter' ? deadletter : filtered).map(job => (
                      <tr key={job.id}
                        onClick={() => setSelected(selected?.id === job.id ? null : job)}
                        style={{ borderBottom:`1px solid ${C.border}`, cursor:"pointer",
                          background: selected?.id === job.id ? C.s2 : "transparent",
                          transition:"background .1s"
                        }}
                        onMouseEnter={e => { if(selected?.id !== job.id) e.currentTarget.style.background=C.s2; }}
                        onMouseLeave={e => { if(selected?.id !== job.id) e.currentTarget.style.background="transparent"; }}
                      >
                        <td style={{ padding:"12px", fontFamily:"JetBrains Mono", fontSize:11, color:C.subtle }}>{job.id.slice(0,8)}</td>
                        <td style={{ padding:"12px", fontFamily:"Outfit", fontSize:13, color:C.text, fontWeight: 500 }}>{job.name}</td>
                        <td style={{ padding:"12px" }}><QueueBadge queue={job.queue} /></td>
                        <td style={{ padding:"12px", fontFamily:"JetBrains Mono", fontSize:11, color:C.subtle }}>{job.worker_id ? job.worker_id.slice(0,8) : "—"}</td>
                        <td style={{ padding:"12px" }}><StatusPill status={job.status} /></td>
                        <td style={{ padding:"12px", color:C.muted, fontSize: 12 }}>{job.attempts||0}</td>
                        <td style={{ padding:"12px", color:C.muted, fontSize:11, fontFamily: 'JetBrains Mono' }}>{new Date(job.created_at).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selected && (
                <div style={{
                  marginTop: 16, border:`1px solid ${C.border}`, padding:"20px", borderRadius: 12,
                  background: C.s2, animation:"slideDown .15s ease"
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
                    <span style={{ fontFamily:"JetBrains Mono", fontSize:12, color:C.subtle }}>{selected.id}</span>
                    <button onClick={() => setSelected(null)} style={{ border:"none", background:"none", cursor:"pointer", color:C.muted, fontSize:18 }}>✕</button>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:16 }}>
                    {[["Name",selected.name],["Queue",selected.queue],["Status",selected.status],
                      ["Attempts",`${selected.attempts||0}/${selected.max_attempts||5}`],
                      ["Worker",selected.worker_id||"—"],
                      ["Updated",new Date(selected.updated_at).toLocaleTimeString()]
                    ].map(([k,v]) => (
                      <div key={k}>
                        <div style={{ fontSize:10, color:C.muted, marginBottom:4, textTransform:"uppercase", fontFamily: 'JetBrains Mono' }}>{k}</div>
                        <div style={{ fontSize:13, fontWeight:500, color:C.text, fontFamily: 'Outfit' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {selected.error && (
                    <div style={{ background: C.pink+'10', border:`1px solid ${C.pink}40`, borderRadius:8, padding:"12px", marginBottom:12, fontSize:13, color:C.pink, fontFamily: 'Outfit' }}>
                      {selected.error}
                    </div>
                  )}
                  {selected.payload && (
                    <pre style={{ background:C.bg, border:`1px solid ${C.border}`, color:C.subtle, borderRadius:8, padding:16, fontSize:12, overflow:"auto", margin:0, fontFamily: 'JetBrains Mono' }}>
                      {JSON.stringify(selected.payload, null, 2)}
                    </pre>
                  )}
                  
                  {activeNav === 'deadletter' && (
                     <button onClick={() => requeueJob(selected.id)} style={{
                        marginTop: 16, fontSize:12, padding:"8px 16px", borderRadius:8, fontFamily: 'Outfit',
                        border:`1px solid ${C.border}`, background:C.bg, color:C.text, cursor:"pointer"
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
                      width:"100%", minHeight:80, fontSize:13, padding:14,
                      borderRadius:12, border:`1px solid ${C.border}`,
                      background:C.s2, color:C.text, resize:"vertical", fontFamily:"Outfit", outline:"none"
                    }}
                  />
                  <button onClick={generateWorkflow} disabled={nlLoading} style={{
                    marginTop:16, fontSize:13, padding:"10px 24px", borderRadius:10, fontFamily: 'Outfit',
                    border:"none", background: nlLoading ? C.s2 : C.lime, color: nlLoading ? C.muted : C.bg,
                    cursor: nlLoading ? "default" : "pointer", fontWeight:600, transition:"all .15s"
                  }}>
                    {nlLoading ? "Generating…" : "✦ Generate & Run"}
                  </button>
                </div>

                <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
                  <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 15, color: C.text, margin: '0 0 16px' }}>Recent Workflows</p>
                  {workflows.map(wf => (
                    <div key={wf.id} onClick={() => fetchWorkflowDetail(wf.id)} style={{
                      display:"flex", alignItems:"center", gap:16,
                      padding:"16px", borderBottom:`1px solid ${C.border}`,
                      cursor:"pointer", borderRadius: 12, transition:"background .1s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background=C.s2}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}
                    >
                      <Activity size={24} color={C.violet} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500, fontFamily:"Outfit", color:C.text }}>{wf.name}</div>
                        <div style={{ fontSize:11, color:C.subtle, fontFamily: 'JetBrains Mono', marginTop: 4 }}>{wf.id.slice(0,8)}… · {new Date(wf.created_at).toLocaleString()}</div>
                      </div>
                      <StatusPill status={wf.status} />
                    </div>
                  ))}
                </div>

                {selectedWorkflow && (
                <div style={{ background: C.s1, border: `1px solid ${C.border}`, borderRadius: 18, padding: '22px 24px' }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
                    <div>
                      <div style={{ fontSize:16, fontWeight:600, fontFamily:"Outfit", color:C.text }}>{selectedWorkflow.name}</div>
                      <div style={{ fontSize:11, color:C.subtle, fontFamily: 'JetBrains Mono', marginTop: 4 }}>{selectedWorkflow.id}</div>
                    </div>
                    <button onClick={() => setSelectedWorkflow(null)} style={{ border:"none", background:"none", cursor:"pointer", color:C.muted, fontSize:20 }}>✕</button>
                  </div>
                  <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:12, textTransform:"uppercase", fontFamily: 'JetBrains Mono' }}>Workflow Steps</div>
                  {(selectedWorkflow.steps||[]).map(step => (
                    <div key={step.id} style={{
                      display:"flex", alignItems:"center", gap:16,
                      padding:"12px 0", borderBottom:`1px solid ${C.border}`
                    }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:500, color:C.text, fontFamily: 'Outfit' }}>{step.name}</div>
                        <div style={{ fontSize:12, color:C.muted, marginTop: 4, fontFamily: 'Outfit' }}>
                          <span style={{ color: C.subtle }}>{step.job_name}</span> · <QueueBadge queue={step.queue} />
                          {step.depends_on?.length > 0 && <span style={{ marginLeft: 8 }}>· after: {step.depends_on.join(", ")}</span>}
                        </div>
                      </div>
                      <StatusPill status={step.job_status||step.status} />
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
               <p style={{ fontFamily: 'Outfit', fontSize: 13, color: C.muted, margin: '0 0 24px' }}>Run <code style={{ background:C.s2, padding:"2px 6px", borderRadius:4, color:C.text }}>npm run dev</code> in worker directory to scale.</p>
               
               {workers.length === 0 && <p style={{ color: C.subtle, fontFamily: 'Outfit' }}>No workers active.</p>}
               {workers.map(([id, info]) => {
                const isRunning = info.lastJob.status === "running";
                return (
                  <div key={id} style={{
                    display:"flex", alignItems:"center", gap:16,
                    padding:"16px 0", borderBottom:`1px solid ${C.border}`
                  }}>
                    <div style={{
                      width:48, height:48, borderRadius:14,
                      background: C.s2, color: C.lime,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      border:`1px solid ${C.border}`
                    }}>
                      <Zap size={20} />
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontSize:14, fontWeight:600, color:C.text, fontFamily:"JetBrains Mono" }}>{id}</div>
                        <span style={{ fontSize:10, color: isRunning ? C.bg : C.lime, background: isRunning ? C.lime : C.lime+'20', padding: "2px 8px", borderRadius: 10, fontFamily: 'Outfit', fontWeight: 600 }}>
                          {isRunning ? "BUSY" : "ONLINE"}
                        </span>
                      </div>
                      <div style={{ fontSize:13, color:C.muted, marginTop: 6, fontFamily: 'Outfit' }}>
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

        </div>
      </div>
      
      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", bottom:24, right:24,
          background: C.s1, border:`1px solid ${toast.type === "success" ? C.lime : C.pink}`,
          color: toast.type === "success" ? C.lime : C.pink,
          borderRadius:12, padding:"12px 20px", fontSize:13, fontFamily: 'Outfit',
          boxShadow:"0 8px 30px rgba(0,0,0,0.5)",
          animation:"slideUp .2s ease", zIndex:100, fontWeight: 500
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

const selectStyle = {
  fontSize:12, padding:"6px 12px", borderRadius:8, fontFamily: 'Outfit',
  border:`1px solid #221A42`, background:"#0C0920",
  color:"#EDE8F8", cursor:"pointer", outline: "none",
};