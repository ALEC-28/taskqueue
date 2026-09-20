# System Architecture Document
## Fault-Tolerant Federated Learning Orchestrator with Intelligent Client Selection

---

## 1. Tech Stack
| Layer | Technology |
|---|---|
| Task Queue API | Node.js + Express |
| Broker | Redis (LPUSH/BRPOP) |
| State store | PostgreSQL |
| Workers | Node.js processes |
| Workflow engine | Custom DAG, topological sort |
| NL→DAG | Groq API (Llama 3.1) |
| Dashboard (TaskQueue) | React + Recharts + WebSocket |
| SDK / CLI | TypeScript (`taskqueue-js`, `tq`) |
| FL Orchestrator | Python + FastAPI |
| FL framework | Flower (flwr) |
| FL algorithms | PyTorch — FedAvg, FedProx |
| Infra | Docker Compose |

Reuse existing TaskQueue infra unchanged; add FL layer as a separate service. Avoids rewriting a working distributed system.

## 2. Components

### 2.1 TaskQueue Core (unchanged)
- **REST API**: job/workflow submission, `/workers`, `/health`.
- **Redis**: three priority queues (high/default/low), BRPOP competition across workers.
- **Workers**: pull jobs, execute, heartbeat every 10s, report status.
- **Scheduler**: polls every 5–30s for delayed jobs and stale (crashed) jobs.
- **Postgres**: `jobs`, `workflows`, `workflow_steps` — source of truth for state.
- **WebSocket server**: pushes real-time state to dashboard.

### 2.2 FL Orchestrator (new, Python/FastAPI)
- **FL API**: `POST /fl/train`, receives round triggers from TaskQueue DAG steps.
- **Client Selector**: scoring engine, ranks available clients each round.
- **Aggregator**: FedAvg/FedProx, combines client model updates into global model.
- **Model Store**: versioned global model checkpoints (filesystem or object store).
- **Client Simulator**: N simulated clients with injectable failure modes.
- **FL Monitoring**: writes per-round metrics to Postgres, exposes via API for dashboard.

## 3. Data Flow
```
Operator → POST /workflows (FL round DAG) → TaskQueue API
   → Redis enqueue: client_selection step
   → Worker picks up → calls FL API: client selector runs, scores clients
   → step-complete callback → TaskQueue advances DAG
   → model_distribute + local_training steps enqueued (parallel per selected client)
   → Client Simulator executes training (may fail per configured mode)
   → success/failure reported back via /internal/step-complete
   → on failure: TaskQueue heartbeat/scheduler detects stale job → requeue or FL layer triggers replacement
   → once all client steps resolve → aggregate step enqueued → FedAvg/FedProx runs
   → evaluate step → metrics written to fl_round_metrics
   → WebSocket pushes round status + metrics to dashboard
```

## 4. Integration Contract (Node ↔ Python)
Locked before FL implementation begins (Month 2):
- `POST /fl/train {client_id, round, model_version}` — Node → Python, triggers one client's training.
- `POST /internal/step-complete {step_id, result}` — Python → Node, advances the DAG step.
- Both endpoints internal-only; not exposed publicly. Shared-secret header for authentication between services.
- Idempotency: `step_id` used as dedupe key on the Node side to prevent double DAG advancement from duplicate callbacks.

## 5. Storage
- **Redis**: ephemeral queue state only, no long-term data.
- **Postgres**: durable state — jobs, workflows, FL rounds, client scores, round metrics, failure logs (new tables per SRS §5).
- **Model Store**: FL global model checkpoints, filesystem-based for MVP (path per `model_version`); can later move to S3-compatible store if needed — not required for this project's scope.

## 6. Security
- No auth for MVP (single-operator, local/dev deployment) beyond:
  - Groq API key server-side env var only.
  - Shared-secret header between TaskQueue and FL orchestrator internal calls.
- Explicitly no DP-SGD / secure aggregation — documented as out of scope, not a gap to hide.
- No real PII: client simulator uses synthetic data only.

## 7. Deployment
- `docker-compose.yml` covers Redis + Postgres (existing).
- API, worker(s), FL orchestrator run as separate processes/containers; can add Dockerfiles for FL service following the same pattern as `api/Dockerfile`.
- Local dev: multiple worker terminals + one FL orchestrator process, matches existing demo pattern in `DEMO.md`.
- No cloud/SaaS deployment in this project's scope (explicitly deferred in the 6-month expansion plan's later SaaS phase, not part of this thesis).

## 8. Monitoring
- Existing: WebSocket-driven live dashboard for jobs/workflows/workers.
- New: FL panel showing per-round accuracy/loss/comm-cost charts, client health table, and experiment run comparison (reuses Recharts + WebSocket pattern already built).

## 9. Scalability
- Horizontal: more TaskQueue workers = more throughput, Redis BRPOP handles distribution with zero config (already demonstrated: 3 workers / 20 jobs).
- FL Orchestrator: stateless per request aside from Model Store; can run multiple instances behind the same Postgres if needed, though single-instance is sufficient for this project's evaluation scale (5–10 simulated clients).
- Client Simulator: scales to N simulated clients as separate lightweight processes/threads; not designed for real distributed hardware in this project's scope.

## 10. Explicitly Avoided Over-Engineering
- No Kubernetes — Docker Compose sufficient for single-machine research deployment.
- No message broker beyond Redis (no Kafka) — job volume doesn't warrant it.
- No microservice sprawl — FL orchestrator is one FastAPI service, not split further.
- No custom auth/identity system — single-operator research tool.
