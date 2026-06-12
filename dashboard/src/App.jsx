import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API = "http://localhost:3000";
const WS  = "ws://localhost:3001";

const STATUS = {
  done:     { bg: "#0d3d2a", text: "#4ade80", dot: "#22c55e" },
  running:  { bg: "#0c2340", text: "#60a5fa", dot: "#3b82f6" },
  pending:  { bg: "#2d2008", text: "#fbbf24", dot: "#f59e0b" },
  failed:   { bg: "#2d0f0f", text: "#f87171", dot: "#ef4444" },
  retrying: { bg: "#2d1a08", text: "#fb923c", dot: "#f97316" },
};

const QUEUE_COLORS = { high: "#ef4444", default: "#3b82f6", low: "#6b7280" };

const QUEUE_BADGE = {
  high:    { bg: "#3d0f0f", text: "#fca5a5" },
  default: { bg: "#0c1f3d", text: "#93c5fd" },
  low:     { bg: "#1a1a1a", text: "#9ca3af" },
};

function StatusPill({ status }) {
  const c = STATUS[status] || { bg: "#1a1a1a", text: "#9ca3af", dot: "#6b7280" };
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 600,
      display: "inline-flex", alignItems: "center", gap: 5,
      letterSpacing: ".02em"
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: c.dot, display: "inline-block",
        boxShadow: `0 0 6px ${c.dot}`,
        animation: status === "running" ? "pulse 1.4s infinite" : "none"
      }} />
      {status}
    </span>
  );
}

function QueueBadge({ queue }) {
  const c = QUEUE_BADGE[queue] || QUEUE_BADGE.default;
  return (
    <span style={{
      fontSize: 11, padding: "2px 8px", borderRadius: 10,
      background: c.bg, color: c.text, fontWeight: 500
    }}>
      {queue}
    </span>
  );
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#111827",
      border: "1px solid #1f2937",
      borderRadius: 12,
      padding: "14px 16px",
      position: "relative",
      overflow: "hidden",
      transition: "border-color .2s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = accent || "#374151"}
    onMouseLeave={e => e.currentTarget.style.borderColor = "#1f2937"}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 2, background: accent || "#374151", borderRadius: "12px 12px 0 0"
      }} />
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#f9fafb", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const NAV_ITEMS = [
  { section: "Overview", items: [
    { key: "dashboard", label: "Dashboard", icon: "▦" },
    { key: "jobs",      label: "Jobs",      icon: "≣", badgeKey: "pending" },
    { key: "workflows", label: "Workflows", icon: "⬡" },
  ]},
  { section: "System", items: [
    { key: "workers",    label: "Workers",    icon: "▣" },
    { key: "deadletter", label: "Dead-letter", icon: "✕", badgeKey: "failed" },
  ]}
];

const JOB_TYPES = [
  "send_welcome_email","resize_image","generate_invoice",
  "fraud_check","send_otp_sms","slow_job","fail_always"
];

const ACCENT = {
  dashboard: "#3b82f6",
  jobs:      "#8b5cf6",
  workflows: "#06b6d4",
  workers:   "#10b981",
  deadletter:"#ef4444",
};

export default function App() {
  const [jobs, setJobs]             = useState([]);
  const [workflows, setWorkflows]   = useState([]);
  const [throughput, setTP]         = useState(Array.from({length:12}, () => ({ t:"", v:0 })));
  const [wsStatus, setWsStatus]     = useState("connecting");
  const [filter, setFilter]         = useState("all");
  const [selected, setSelected]     = useState(null);
  const [page, setPage]             = useState("dashboard");
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitName, setSubmitName] = useState("send_welcome_email");
  const [submitQueue, setSubmitQueue] = useState("default");
  const [submitDelay, setSubmitDelay] = useState("0");
  const [toast, setToast]           = useState(null);
  const [nlDescription, setNlDescription] = useState("");
  const [nlLoading, setNlLoading]   = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const wsRef = useRef(null);

  async function fetchJobs() {
    try { setJobs(await (await fetch(`${API}/jobs?limit=50`)).json()); }
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

  useEffect(() => {
    fetchJobs();
    fetchWorkflows();
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
            return [msg.job, ...prev].slice(0, 50);
          });
          setTP(prev => {
            const now = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
            return [...prev.slice(1), { t: now, v: (prev[prev.length-1]?.v || 0) + 1 }];
          });
        }
      };
      ws.onclose = () => { setWsStatus("reconnecting"); setTimeout(connect, 2000); };
      ws.onerror = () => ws.close();
    }
    connect();
    const iv = setInterval(() => { fetchJobs(); fetchWorkflows(); }, 5000);
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

  const filtered   = filter === "all" ? jobs : jobs.filter(j => j.status === filter);
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
  const deadletter = jobs.filter(j => j.status === "failed");

  const accent = ACCENT[page] || "#3b82f6";

  return (
    <div style={{ minHeight:"100vh", background:"#030712", fontFamily:"Inter,system-ui,sans-serif", color:"#f9fafb" }}>

      {/* Top bar */}
      <div style={{
        background:"#0a0f1a", borderBottom:"1px solid #1f2937",
        padding:"0 24px", height:52,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:10
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontSize:18, fontWeight:800, letterSpacing:"-.02em" }}>
            task<span style={{ color: accent }}>queue</span>
          </div>
          <span style={{
            display:"inline-flex", alignItems:"center", gap:5,
            fontSize:11, fontWeight:500,
            color: wsStatus === "live" ? "#4ade80" : "#fbbf24",
            background: wsStatus === "live" ? "#0d3d2a" : "#2d2008",
            padding:"2px 8px", borderRadius:20,
            border:`1px solid ${wsStatus === "live" ? "#166534" : "#92400e"}`,
          }}>
            <span style={{
              width:6, height:6, borderRadius:"50%",
              background: wsStatus === "live" ? "#22c55e" : "#f59e0b",
              animation: wsStatus === "live" ? "pulse 1.4s infinite" : "none"
            }} />
            {wsStatus}
          </span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => { fetchJobs(); fetchWorkflows(); }} style={{
            fontSize:12, padding:"6px 14px", borderRadius:8,
            border:"1px solid #1f2937", background:"transparent",
            color:"#9ca3af", cursor:"pointer",
            transition:"all .15s"
          }}
          onMouseEnter={e => { e.currentTarget.style.background="#111827"; e.currentTarget.style.color="#f9fafb"; }}
          onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#9ca3af"; }}
          >↻ Refresh</button>
          <button onClick={() => setShowSubmit(s => !s)} style={{
            fontSize:12, padding:"6px 14px", borderRadius:8,
            border:`1px solid ${accent}`,
            background: showSubmit ? accent : "transparent",
            color: showSubmit ? "#fff" : accent,
            cursor:"pointer", fontWeight:600,
            transition:"all .15s"
          }}>+ Enqueue job</button>
        </div>
      </div>

      {/* Submit panel */}
      {showSubmit && (
        <div style={{
          background:"#0a0f1a", borderBottom:"1px solid #1f2937",
          padding:"10px 24px", display:"flex", gap:8, alignItems:"center",
          animation:"slideDown .2s ease"
        }}>
          <select value={submitName} onChange={e => setSubmitName(e.target.value)} style={selectStyle}>
            {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={submitQueue} onChange={e => setSubmitQueue(e.target.value)} style={selectStyle}>
            <option value="high">high priority</option>
            <option value="default">default</option>
            <option value="low">low priority</option>
          </select>
          <select value={submitDelay} onChange={e => setSubmitDelay(e.target.value)} style={selectStyle}>
            <option value="0">immediately</option>
            <option value="15">+15 seconds</option>
            <option value="30">+30 seconds</option>
            <option value="60">+60 seconds</option>
          </select>
          <button onClick={submitJob} style={{
            fontSize:12, padding:"6px 16px", borderRadius:8,
            border:"none", background: accent,
            color:"#fff", cursor:"pointer", fontWeight:600
          }}>▶ Run</button>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"200px 1fr" }}>
        {/* Sidebar */}
        <div style={{
          background:"#040810", borderRight:"1px solid #111827",
          padding:"16px 0", minHeight:"calc(100vh - 52px)",
          position:"sticky", top:52, alignSelf:"start", height:"calc(100vh - 52px)", overflowY:"auto"
        }}>
          {NAV_ITEMS.map(section => (
            <div key={section.section} style={{ marginBottom:8 }}>
              <div style={{
                fontSize:10, fontWeight:700, color:"#374151",
                padding:"8px 16px 4px", letterSpacing:".1em", textTransform:"uppercase"
              }}>
                {section.section}
              </div>
              {section.items.map(item => {
                const isActive = page === item.key;
                const badgeVal = item.badgeKey ? (counts[item.badgeKey] || 0) : 0;
                const itemAccent = ACCENT[item.key];
                return (
                  <div key={item.key} onClick={() => setPage(item.key)} style={{
                    display:"flex", alignItems:"center", gap:10,
                    padding:"8px 16px", fontSize:13, cursor:"pointer",
                    borderLeft: isActive ? `2px solid ${itemAccent}` : "2px solid transparent",
                    background: isActive ? `${itemAccent}18` : "transparent",
                    color: isActive ? itemAccent : "#6b7280",
                    transition:"all .15s", margin:"1px 0",
                    fontWeight: isActive ? 600 : 400,
                  }}
                  onMouseEnter={e => { if(!isActive) { e.currentTarget.style.background="#111827"; e.currentTarget.style.color="#d1d5db"; }}}
                  onMouseLeave={e => { if(!isActive) { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#6b7280"; }}}
                  >
                    <span style={{ fontSize:14, opacity: isActive ? 1 : .6 }}>{item.icon}</span>
                    <span>{item.label}</span>
                    {badgeVal > 0 && (
                      <span style={{
                        marginLeft:"auto", fontSize:10, padding:"1px 6px",
                        borderRadius:10, background:"#3d0f0f", color:"#fca5a5",
                        fontWeight:700, minWidth:18, textAlign:"center"
                      }}>{badgeVal}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ padding:"20px", minHeight:"calc(100vh - 52px)" }}>

          {/* ── DASHBOARD ── */}
          {page === "dashboard" && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
                <MetricCard label="Total Jobs"  value={jobs.length}        sub={`${counts.done||0} completed`}   accent="#3b82f6" />
                <MetricCard label="Running"     value={counts.running||0}  sub="active right now"                accent="#06b6d4" />
                <MetricCard label="Pending"     value={counts.pending||0}  sub="waiting in queue"                accent="#f59e0b" />
                <MetricCard label="Failed"      value={counts.failed||0}   sub={counts.failed ? "need attention" : "all clear"} accent={counts.failed ? "#ef4444" : "#10b981"} />
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                <div style={card}>
                  <div style={cardTitle}>Throughput</div>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={throughput}>
                      <XAxis dataKey="t" tick={{ fontSize:9, fill:"#4b5563" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize:9, fill:"#4b5563" }} width={20} />
                      <Tooltip contentStyle={{ background:"#111827", border:"1px solid #1f2937", borderRadius:6, fontSize:11, color:"#f9fafb" }} />
                      <Line type="monotone" dataKey="v" stroke="#3b82f6" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={card}>
                  <div style={cardTitle}>Queue Depth</div>
                  {queueDepth.map(q => (
                    <div key={q.name} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                      <span style={{ fontSize:11, width:52, color:"#6b7280", fontFamily:"monospace" }}>{q.name}</span>
                      <div style={{ flex:1, height:8, background:"#1f2937", borderRadius:4, overflow:"hidden" }}>
                        <div style={{
                          width:`${Math.min(q.count/maxQ*100,100)}%`,
                          height:"100%",
                          background: QUEUE_COLORS[q.name],
                          borderRadius:4,
                          transition:"width .4s ease",
                          boxShadow:`0 0 8px ${QUEUE_COLORS[q.name]}66`
                        }} />
                      </div>
                      <span style={{ fontSize:11, color:"#4b5563", minWidth:16, textAlign:"right" }}>{q.count}</span>
                    </div>
                  ))}
                  <div style={{ fontSize:11, color:"#374151", marginTop:8 }}>
                    {workers.length} worker{workers.length !== 1?"s":""} · {counts.done||0} jobs done
                  </div>
                </div>
              </div>

              <div style={{ ...card, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                  <div style={cardTitle}>Retry Activity</div>
                  <span style={{ fontSize:11, color:"#fb923c" }}>{retrying.length} retrying</span>
                </div>
                {retrying.length === 0 && (
                  <div style={{ fontSize:12, color:"#374151", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ color:"#22c55e" }}>✓</span> No jobs retrying — system healthy
                  </div>
                )}
                {retrying.slice(0,5).map(j => (
                  <div key={j.id} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"7px 0", borderBottom:"1px solid #111827", fontSize:12 }}>
                    <span style={{ color:"#f97316", fontSize:14 }}>↻</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"monospace", fontSize:11, color:"#d1d5db" }}>{j.id.slice(0,8)}… · {j.name}</div>
                      <div style={{ fontSize:11, color:"#4b5563" }}>{j.error || "retrying with backoff"}</div>
                    </div>
                    <span style={{ fontSize:11, color:"#ef4444" }}>attempt {j.attempts}/{j.max_attempts||5}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── JOBS TABLE ── */}
          {(page === "dashboard" || page === "jobs") && (
            <div style={{ ...card, padding:0 }}>
              <div style={{ padding:"10px 14px", borderBottom:"1px solid #111827", display:"flex", gap:6, flexWrap:"wrap" }}>
                {["all","running","pending","done","failed","retrying"].map(s => {
                  const sc = STATUS[s];
                  const active = filter === s;
                  return (
                    <button key={s} onClick={() => setFilter(s)} style={{
                      fontSize:11, padding:"4px 12px", borderRadius:20, cursor:"pointer",
                      border: active ? `1px solid ${sc?.dot||"#3b82f6"}` : "1px solid #1f2937",
                      background: active ? `${sc?.bg||"#0c2340"}` : "transparent",
                      color: active ? (sc?.text||"#60a5fa") : "#4b5563",
                      fontWeight: active ? 600 : 400,
                      transition:"all .15s"
                    }}>
                      {s} {counts[s] ? <span style={{ opacity:.7 }}>{counts[s]}</span> : ""}
                    </button>
                  );
                })}
              </div>

              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr>
                    {["Job Name","Queue","Status","Attempts","Created"].map(h => (
                      <th key={h} style={{
                        textAlign:"left", padding:"8px 14px",
                        color:"#374151", fontWeight:600, fontSize:10,
                        borderBottom:"1px solid #111827",
                        textTransform:"uppercase", letterSpacing:".06em",
                        background:"#040810"
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} style={{ padding:28, textAlign:"center", color:"#374151", fontSize:13 }}>
                      No jobs yet — click "+ Enqueue job" to get started
                    </td></tr>
                  )}
                  {filtered.map(job => (
                    <tr key={job.id}
                      onClick={() => setSelected(selected?.id === job.id ? null : job)}
                      style={{
                        borderBottom:"1px solid #0a0f1a",
                        cursor:"pointer",
                        background: selected?.id === job.id ? "#0c1f3d" : "transparent",
                        transition:"background .1s"
                      }}
                      onMouseEnter={e => { if(selected?.id !== job.id) e.currentTarget.style.background="#0a0f1a"; }}
                      onMouseLeave={e => { if(selected?.id !== job.id) e.currentTarget.style.background="transparent"; }}
                    >
                      <td style={{ padding:"9px 14px", fontFamily:"monospace", fontSize:11, color:"#e2e8f0" }}>{job.name}</td>
                      <td style={{ padding:"9px 14px" }}><QueueBadge queue={job.queue} /></td>
                      <td style={{ padding:"9px 14px" }}><StatusPill status={job.status} /></td>
                      <td style={{ padding:"9px 14px", color:"#4b5563" }}>{job.attempts||0}</td>
                      <td style={{ padding:"9px 14px", color:"#374151", fontSize:11 }}>{new Date(job.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selected && (
                <div style={{
                  borderTop:"1px solid #1f2937", padding:"14px 16px",
                  background:"#040810", animation:"slideDown .15s ease"
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                    <span style={{ fontFamily:"monospace", fontSize:10, color:"#374151" }}>{selected.id}</span>
                    <button onClick={() => setSelected(null)} style={{ border:"none", background:"none", cursor:"pointer", color:"#4b5563", fontSize:18, lineHeight:1 }}>✕</button>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:10 }}>
                    {[["Name",selected.name],["Queue",selected.queue],["Status",selected.status],
                      ["Attempts",`${selected.attempts||0}/${selected.max_attempts||5}`],
                      ["Worker",selected.worker_id||"—"],
                      ["Updated",new Date(selected.updated_at).toLocaleTimeString()]
                    ].map(([k,v]) => (
                      <div key={k} style={{
                        background:"#0a0f1a", border:"1px solid #1f2937",
                        borderRadius:8, padding:"8px 10px"
                      }}>
                        <div style={{ fontSize:10, color:"#374151", marginBottom:2, textTransform:"uppercase", letterSpacing:".06em" }}>{k}</div>
                        <div style={{ fontSize:12, fontWeight:500, color:"#e2e8f0" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {selected.error && (
                    <div style={{ background:"#2d0f0f", border:"1px solid #7f1d1d", borderRadius:8, padding:"8px 10px", marginBottom:8, fontSize:12, color:"#f87171" }}>
                      {selected.error}
                    </div>
                  )}
                  {selected.payload && (
                    <pre style={{ background:"#040810", border:"1px solid #1f2937", color:"#94a3b8", borderRadius:8, padding:10, fontSize:11, overflow:"auto", margin:0 }}>
                      {JSON.stringify(selected.payload, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── WORKFLOWS ── */}
          {page === "workflows" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{
                ...card,
                background:"linear-gradient(135deg, #0a0f1a 0%, #0c1f3d 100%)",
                border:"1px solid #1e3a5f"
              }}>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:4, color:"#93c5fd" }}>✦ Generate workflow</div>
                <div style={{ fontSize:12, color:"#374151", marginBottom:10 }}>
                  Describe in plain English — the LLM converts it to a DAG and runs it automatically.
                </div>
                <textarea
                  value={nlDescription}
                  onChange={e => setNlDescription(e.target.value)}
                  placeholder='e.g. "Send welcome email and resize profile picture in parallel. After both finish, generate invoice."'
                  style={{
                    width:"100%", minHeight:72, fontSize:12, padding:10,
                    borderRadius:8, border:"1px solid #1e3a5f",
                    background:"#040810", color:"#e2e8f0",
                    resize:"vertical", fontFamily:"inherit", boxSizing:"border-box",
                    outline:"none"
                  }}
                />
                <button onClick={generateWorkflow} disabled={nlLoading} style={{
                  marginTop:8, fontSize:12, padding:"7px 18px", borderRadius:8,
                  border:"none",
                  background: nlLoading ? "#1e3a5f" : "#3b82f6",
                  color: nlLoading ? "#4b5563" : "#fff",
                  cursor: nlLoading ? "default" : "pointer",
                  fontWeight:600, transition:"all .15s"
                }}>
                  {nlLoading ? "Generating…" : "✦ Generate & Run"}
                </button>
              </div>

              <div style={{ ...card, padding:0 }}>
                <div style={{ padding:"10px 14px", borderBottom:"1px solid #111827", fontSize:12, fontWeight:600, color:"#6b7280" }}>
                  Recent workflows
                </div>
                {workflows.length === 0 && (
                  <div style={{ padding:24, textAlign:"center", color:"#374151", fontSize:12 }}>
                    No workflows yet — generate one above or POST to /workflows
                  </div>
                )}
                {workflows.map(wf => (
                  <div key={wf.id} onClick={() => fetchWorkflowDetail(wf.id)} style={{
                    display:"flex", alignItems:"center", gap:10,
                    padding:"10px 14px", borderBottom:"1px solid #0a0f1a",
                    cursor:"pointer", transition:"background .1s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.background="#0a0f1a"}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}
                  >
                    <span style={{ fontSize:18, color:"#06b6d4" }}>⬡</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:500, fontFamily:"monospace", color:"#e2e8f0" }}>{wf.name}</div>
                      <div style={{ fontSize:11, color:"#374151" }}>{wf.id.slice(0,8)}… · {new Date(wf.created_at).toLocaleString()}</div>
                    </div>
                    <StatusPill status={wf.status} />
                  </div>
                ))}
              </div>

              {selectedWorkflow && (
                <div style={{ ...card, animation:"slideDown .15s ease" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600, fontFamily:"monospace", color:"#e2e8f0" }}>{selectedWorkflow.name}</div>
                      <div style={{ fontSize:11, color:"#374151" }}>{selectedWorkflow.id}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <StatusPill status={selectedWorkflow.status} />
                      <button onClick={() => setSelectedWorkflow(null)} style={{ border:"none", background:"none", cursor:"pointer", color:"#4b5563", fontSize:18 }}>✕</button>
                    </div>
                  </div>
                  <div style={{ fontSize:10, fontWeight:700, color:"#374151", marginBottom:8, textTransform:"uppercase", letterSpacing:".08em" }}>Steps</div>
                  {(selectedWorkflow.steps||[]).map(step => (
                    <div key={step.id} style={{
                      display:"flex", alignItems:"center", gap:10,
                      padding:"9px 0", borderBottom:"1px solid #111827"
                    }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:500, color:"#d1d5db" }}>{step.name}</div>
                        <div style={{ fontSize:11, color:"#374151" }}>
                          {step.job_name} · {step.queue}
                          {step.depends_on?.length > 0 && <> · after: {step.depends_on.join(", ")}</>}
                        </div>
                      </div>
                      <StatusPill status={step.job_status||step.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── WORKERS ── */}
          {page === "workers" && (
            <div style={card}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:2, color:"#34d399" }}>Workers</div>
              <div style={{ fontSize:12, color:"#374151", marginBottom:14 }}>
                Derived from worker_id on processed jobs. Run <code style={{ background:"#111827", padding:"1px 6px", borderRadius:4, color:"#94a3b8" }}>cd worker && npm run dev</code> in additional terminals to scale.
              </div>
              {workers.length === 0 && (
                <div style={{ fontSize:12, color:"#374151" }}>No workers have processed a job yet.</div>
              )}
              {workers.map(([id, info]) => (
                <div key={id} style={{
                  display:"flex", alignItems:"center", gap:12,
                  padding:"10px 0", borderBottom:"1px solid #111827"
                }}>
                  <div style={{
                    width:36, height:36, borderRadius:10,
                    background:"#0d2d20", color:"#34d399",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:12, fontWeight:700, flexShrink:0,
                    border:"1px solid #166534"
                  }}>
                    {id.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:500, color:"#d1d5db", fontFamily:"monospace" }}>{id}</div>
                    <div style={{ fontSize:11, color:"#374151" }}>
                      last: {info.lastJob.name} · {info.done} completed
                    </div>
                  </div>
                  <StatusPill status={info.lastJob.status} />
                </div>
              ))}
            </div>
          )}

          {/* ── DEAD-LETTER ── */}
          {page === "deadletter" && (
            <div style={card}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:2, color:"#f87171" }}>Dead-letter Queue</div>
              <div style={{ fontSize:12, color:"#374151", marginBottom:14 }}>
                Jobs that exhausted all retry attempts. Requeue resets attempts and tries again.
              </div>
              {deadletter.length === 0 && (
                <div style={{ fontSize:12, color:"#374151", display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ color:"#22c55e" }}>✓</span> No permanently failed jobs
                </div>
              )}
              {deadletter.map(j => (
                <div key={j.id} style={{
                  display:"flex", alignItems:"flex-start", gap:10,
                  padding:"10px 0", borderBottom:"1px solid #111827"
                }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontFamily:"monospace", color:"#d1d5db" }}>{j.id} · {j.name}</div>
                    <div style={{ fontSize:11, color:"#f87171", marginTop:2 }}>{j.error}</div>
                    <div style={{ fontSize:11, color:"#374151", marginTop:1 }}>{j.attempts} attempts · {j.queue}</div>
                  </div>
                  <button onClick={() => requeueJob(j.id)} style={{
                    fontSize:11, padding:"5px 12px", borderRadius:8,
                    border:"1px solid #374151", background:"transparent",
                    color:"#9ca3af", cursor:"pointer", flexShrink:0,
                    transition:"all .15s"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background="#111827"; e.currentTarget.style.color="#f9fafb"; }}
                  onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#9ca3af"; }}
                  >↻ Requeue</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position:"fixed", bottom:20, right:20,
          background: toast.type === "success" ? "#0d3d2a" : toast.type === "error" ? "#2d0f0f" : "#111827",
          border:`1px solid ${toast.type === "success" ? "#166534" : toast.type === "error" ? "#7f1d1d" : "#1f2937"}`,
          color: toast.type === "success" ? "#4ade80" : toast.type === "error" ? "#f87171" : "#e2e8f0",
          borderRadius:10, padding:"10px 16px", fontSize:12, maxWidth:320,
          boxShadow:"0 4px 20px rgba(0,0,0,.6)",
          animation:"slideUp .2s ease",
          zIndex:100
        }}>
          {toast.type === "success" ? "✓ " : toast.type === "error" ? "✕ " : ""}{toast.msg}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        body { margin:0; background:#030712; }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:#040810; }
        ::-webkit-scrollbar-thumb { background:#1f2937; border-radius:4px; }
        textarea:focus, select:focus { outline:none; border-color:#3b82f6 !important; }
        option { background:#0a0f1a; color:#e2e8f0; }
      `}</style>
    </div>
  );
}

const card = {
  background:"#0a0f1a",
  border:"1px solid #111827",
  borderRadius:12,
  padding:"14px 16px",
};

const cardTitle = {
  fontSize:13, fontWeight:600, marginBottom:10, color:"#9ca3af"
};

const selectStyle = {
  fontSize:12, padding:"6px 10px", borderRadius:8,
  border:"1px solid #1f2937", background:"#040810",
  color:"#e2e8f0", cursor:"pointer"
};