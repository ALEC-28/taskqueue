import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const API = "http://localhost:3000";
const WS  = "ws://localhost:3001";

const STATUS_COLORS = {
  done:     { bg: "#d1fae5", text: "#065f46" },
  running:  { bg: "#dbeafe", text: "#1e40af" },
  pending:  { bg: "#fef9c3", text: "#854d0e" },
  failed:   { bg: "#fee2e2", text: "#991b1b" },
  retrying: { bg: "#ffedd5", text: "#9a3412" },
};

const QUEUE_COLORS = { high: "#ef4444", default: "#3b82f6", low: "#9ca3af" };

function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || { bg: "#f3f4f6", text: "#374151" };
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.text, display: "inline-block" }} />
      {status}
    </span>
  );
}

function MetricCard({ label, value, sub, subColor }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor || "#6b7280", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function App() {
  const [jobs, setJobs]       = useState([]);
  const [throughput, setTP]   = useState(Array(12).fill({ t: "", v: 0 }));
  const [wsStatus, setWsStatus] = useState("connecting");
  const [filter, setFilter]   = useState("all");
  const [selected, setSelected] = useState(null);
  const wsRef = useRef(null);

  // ── Fetch jobs from API ──
  async function fetchJobs() {
    try {
      const res = await fetch(`${API}/jobs?limit=30`);
      const data = await res.json();
      setJobs(data);
    } catch (e) { console.error("fetch error", e); }
  }

  // ── WebSocket ──
  useEffect(() => {
    fetchJobs();

    function connect() {
      const ws = new WebSocket(WS);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("live");
        console.log("[ws] connected");
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "job_update") {
          setJobs(prev => {
            const exists = prev.find(j => j.id === msg.job.id);
            if (exists) return prev.map(j => j.id === msg.job.id ? { ...j, ...msg.job } : j);
            return [msg.job, ...prev].slice(0, 30);
          });
          // update throughput
          setTP(prev => {
            const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const next = [...prev.slice(1), { t: now, v: (prev[prev.length - 1]?.v || 0) + 1 }];
            return next;
          });
        }
      };

      ws.onclose = () => {
        setWsStatus("reconnecting");
        setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    const interval = setInterval(fetchJobs, 5000);
    return () => { clearInterval(interval); wsRef.current?.close(); };
  }, []);

  const filtered = filter === "all" ? jobs : jobs.filter(j => j.status === filter);
  const counts = jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc; }, {});
  const queueDepth = ["high", "default", "low"].map(q => ({
    name: q, count: jobs.filter(j => j.queue === q && j.status === "pending").length
  }));

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
            task<span style={{ color: "#3b82f6" }}>queue</span>
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, color: wsStatus === "live" ? "#059669" : "#d97706",
            background: wsStatus === "live" ? "#d1fae5" : "#fef3c7",
            padding: "2px 8px", borderRadius: 20
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: wsStatus === "live" ? "#059669" : "#d97706",
              animation: wsStatus === "live" ? "pulse 1.4s infinite" : "none"
            }} />
            {wsStatus}
          </span>
        </div>
        <button
          onClick={fetchJobs}
          style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
        >
          ↻ Refresh
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>

        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          <MetricCard label="Total Jobs"   value={jobs.length} sub={`${counts.done || 0} done`} subColor="#059669" />
          <MetricCard label="Running"      value={counts.running || 0} sub="active workers" />
          <MetricCard label="Pending"      value={counts.pending || 0} sub="in queue" subColor="#d97706" />
          <MetricCard label="Failed"       value={counts.failed || 0} sub="need attention" subColor={counts.failed ? "#dc2626" : "#6b7280"} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12, marginBottom: 12 }}>
          {/* Throughput chart */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Throughput</div>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={throughput}>
                <XAxis dataKey="t" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={20} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="v" stroke="#3b82f6" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Queue depth */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Queue Depth</div>
            {queueDepth.map(q => (
              <div key={q.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, width: 55, color: "#6b7280" }}>{q.name}</span>
                <div style={{ flex: 1, height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(q.count * 10, 100)}%`, height: "100%", background: QUEUE_COLORS[q.name], borderRadius: 3, transition: "width .3s" }} />
                </div>
                <span style={{ fontSize: 11, color: "#9ca3af", minWidth: 16 }}>{q.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Jobs table */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          {/* Filter pills */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["all", "running", "pending", "done", "failed", "retrying"].map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{
                fontSize: 12, padding: "4px 12px", borderRadius: 20, cursor: "pointer",
                border: filter === s ? "1px solid #3b82f6" : "1px solid #e5e7eb",
                background: filter === s ? "#eff6ff" : "#fff",
                color: filter === s ? "#1d4ed8" : "#6b7280", fontWeight: filter === s ? 600 : 400
              }}>
                {s} {counts[s] ? <span style={{ opacity: .6 }}>{counts[s]}</span> : ""}
              </button>
            ))}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Job Name", "Queue", "Status", "Attempts", "Created"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 14px", color: "#6b7280", fontWeight: 500, fontSize: 11, borderBottom: "1px solid #f3f4f6" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#9ca3af" }}>No jobs yet — submit one to get started</td></tr>
              )}
              {filtered.map(job => (
                <tr key={job.id} onClick={() => setSelected(selected?.id === job.id ? null : job)}
                  style={{ borderBottom: "1px solid #f9fafb", cursor: "pointer", background: selected?.id === job.id ? "#eff6ff" : "transparent" }}>
                  <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 11, color: "#111827" }}>{job.name}</td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#f3f4f6", color: "#374151" }}>{job.queue}</span>
                  </td>
                  <td style={{ padding: "9px 14px" }}><StatusPill status={job.status} /></td>
                  <td style={{ padding: "9px 14px", color: "#6b7280" }}>{job.attempts || 0}</td>
                  <td style={{ padding: "9px 14px", color: "#9ca3af" }}>{new Date(job.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Detail drawer */}
          {selected && (
            <div style={{ borderTop: "1px solid #e5e7eb", padding: "14px 16px", background: "#f9fafb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>{selected.id}</span>
                <button onClick={() => setSelected(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16 }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 8 }}>
                {[["Name", selected.name], ["Queue", selected.queue], ["Status", selected.status],
                  ["Attempts", `${selected.attempts || 0} / ${selected.max_attempts || 5}`],
                  ["Worker", selected.worker_id || "—"],
                  ["Updated", new Date(selected.updated_at).toLocaleTimeString()]
                ].map(([k, v]) => (
                  <div key={k} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 10px" }}>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#111827" }}>{v}</div>
                  </div>
                ))}
              </div>
              {selected.payload && (
                <pre style={{ background: "#1e293b", color: "#e2e8f0", borderRadius: 6, padding: 10, fontSize: 11, overflow: "auto", margin: 0 }}>
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        body { margin: 0; }
        tr:hover td { background: #f9fafb !important; }
      `}</style>
    </div>
  );
}