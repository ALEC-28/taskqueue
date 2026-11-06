# UI/UX Document
## Fault-Tolerant Federated Learning Orchestrator with Intelligent Client Selection

---

## 1. Design Principles
- Dark-first, data-dense, operator-facing — not consumer UI. Matches existing TaskQueue dashboard (`#030712` base).
- Real-time by default: WebSocket-driven, no manual refresh.
- Every state (loading/empty/error) always designed, never left blank.
- Section-based accent colors for fast visual scanning across a dense dashboard.

## 2. User Journey
1. Operator opens dashboard → sees system overview (jobs + FL rounds at a glance).
2. Configures client scoring weights → starts an FL round.
3. Watches round progress live (client selection → training → aggregate → evaluate).
4. If a client fails, sees it flagged, watches auto-recovery happen.
5. Round completes → reviews metrics → compares against a prior run.

## 3. Navigation (sidebar, existing pattern extended)
- **Dashboard** — overview (existing)
- **Jobs** — filterable job list (existing)
- **Workflows** — NL-to-DAG + list (existing)
- **Workers** — worker stats (existing)
- **Dead-letter** — failed jobs + requeue (existing)
- **FL Rounds** *(new)* — round list, start new round, live round view
- **Clients** *(new)* — client roster, scores, health history
- **Experiments** *(new)* — compare completed round metrics across runs

## 4. Screens & Flows

### 4.1 FL Rounds — List
- Table: round id, status (pending/running/done/failed), algorithm (FedAvg/FedProx), started, duration, accuracy.
- "+ Start Round" button → opens config modal (model version, algorithm, client count).
- Row click → Round Detail.

### 4.2 FL Rounds — Detail (live)
- DAG visual: `client_selection → model_distribute → local_training (parallel) → aggregate → evaluate`, each node colored by status (pending/running/done/failed).
- Client strip: avatars/chips per selected client, colored by health (alive/slow/failed/replaced).
- Live metrics panel: accuracy/loss line chart updating per round tick, comm cost counter.
- On client failure: chip flashes red → transitions to "retrying" or "replaced by Client X" with a toast notification.

### 4.3 Clients — Roster
- Table: client id, reliability, dataset size, data quality, compute, network, computed score, status.
- Score weight editor (sliders, must sum to 1.0, live-validated, disabled Save until valid).
- Client detail drawer: failure history, past round participation.

### 4.4 Experiments — Comparison
- Multi-select rounds → overlay accuracy/loss charts, side-by-side comm cost + convergence speed table.
- Filter by algorithm/selection strategy (reliability-based vs random).

## 5. Components (reused/extended from existing dashboard)
- Status pill with glowing animated dot (existing pattern) — extended states: `selecting`, `distributing`, `training`, `aggregating`, `evaluating`, `failed`, `recovered`.
- Toast system (existing, green/red typed) — add amber for "client replaced/retried".
- Drawer (existing slideDown/slideUp) — reused for client & round detail.
- DAG node graph — new component, SVG-based, reusable across Workflows and FL Rounds screens.
- Weight slider group — new, 5 sliders auto-normalizing to sum 1.0.

## 6. Forms
- **Start Round**: model version (dropdown), algorithm (FedAvg/FedProx toggle), client count (number input), min score threshold (optional). Validate before submit; disable submit while invalid.
- **Weight Editor**: 5 sliders (Reliability, Dataset Size, Data Quality, Compute, Network). Auto-normalize or block save if sum ≠ 1.0 ± 0.001, inline error text.

## 7. Loading / Error / Empty States
- **Loading**: skeleton rows for tables, pulsing DAG nodes while round initializes.
- **Empty**: "No FL rounds yet — start one" with CTA button on FL Rounds screen; same pattern for Clients (no clients registered) and Experiments (need ≥2 completed rounds to compare).
- **Error**: inline red banner on failed API calls with retry button; round-level failure shows failed DAG node in red with hover tooltip explaining cause (e.g., "all clients failed").
- **Partial failure** (client fails but round continues): amber state on that client chip only, round-level status stays "running".

## 8. Responsive Behavior
- Primary target: desktop (operator dashboard, wide screens for DAG + charts).
- Tablet: sidebar collapses to icons, tables become horizontally scrollable, DAG graph scales down with pinch/scroll.
- Mobile: not a target use case for MVP (research/ops tool); graceful degrade to stacked cards for round list only, full detail views desktop-only with a "best viewed on desktop" notice.

## 9. Accessibility
- Color never sole indicator of status — always paired with icon/label (e.g., ✓ done, ✕ failed, not just color).
- Sufficient contrast on dark theme (WCAG AA minimum) for text and status pills.
- Keyboard navigable tables and modals; focus trap in modals/drawers.
- Charts include accessible data table fallback (toggle) for screen readers.

## 10. Typography
- Sans-serif system stack (existing), monospace for ids/metrics/logs (matches CLI/dashboard developer-tool feel).
- Scale: 12px (meta/labels) / 14px (body/table) / 18px (section headers) / 24px (page titles).

## 11. Colors (extends existing per-section accents)
| Section | Accent |
|---|---|
| Dashboard | Blue |
| Jobs | Purple |
| Workflows | Cyan |
| Workers | Emerald |
| Dead-letter | Red |
| FL Rounds *(new)* | Orange |
| Clients *(new)* | Teal |
| Experiments *(new)* | Violet |

Base background `#030712` (existing), status colors: green=healthy/done, amber=degraded/retrying, red=failed, gray=pending/idle.

## 12. Spacing
- 8px base grid (4/8/12/16/24/32 scale), consistent with existing dashboard cards/tables.
- Cards: 16px internal padding, 24px gap between panels.
- DAG node graph: min 80px node spacing to keep parallel branches legible.
