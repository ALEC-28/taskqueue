# Software Requirements Specification
## Fault-Tolerant Federated Learning Orchestrator with Intelligent Client Selection

---

## 1. System Overview
Two-service system: **TaskQueue** (Node.js distributed job/DAG engine, complete) and **TaskQueue-FL** (Python/FastAPI FL orchestrator, new), integrated via a locked HTTP contract.

## 2. User Roles & Permissions
| Role | Permissions |
|---|---|
| Operator/Researcher | Submit jobs/workflows/FL rounds, configure scoring weights, view dashboards, requeue failed jobs |
| Client (simulated) | Receives training tasks, reports results/heartbeats — no UI access |
| System (scheduler/aggregator) | Automated: heartbeat monitoring, requeue, aggregation — no human auth needed |

No multi-tenant auth required (single-operator research system). API key optional for LLM (Groq) calls only.

## 3. Functional Requirements

### 3.1 TaskQueue Core (existing — inherited)
- FR-1: `POST /jobs` accepts `{name, queue, payload, delay_seconds?, priority?}`, returns job id, status `pending`.
- FR-2: Workers execute via BRPOP; job transitions `pending → running → done|failed`.
- FR-3: Failed jobs retry with exponential backoff (1/2/4/8/16s), max 5 attempts, then dead-letter.
- FR-4: Workers emit heartbeat every 10s; scheduler requeues jobs with no heartbeat >30s.
- FR-5: `POST /workflows` accepts DAG (`steps[]` with `depends_on`); engine topologically sorts and executes, running independent steps in parallel.
- FR-6: `POST /workflows/generate` accepts NL description, LLM returns validated DAG JSON, executed automatically.
- FR-7: `GET /workers` returns worker health derived from `jobs.worker_id`/`updated_at`.

### 3.2 FL Orchestrator (new)
- FR-8: `POST /fl/train` accepts `{client_id, round, model_version}`; triggers local training on client simulator.
- FR-9: `POST /internal/step-complete` accepts `{step_id, result}` from Python back to TaskQueue to advance the DAG.
- FR-10: FL round DAG: `client_selection → model_distribute → local_training (parallel per client) → aggregate → evaluate`.
- FR-11: Client Selector computes score per client:
  `Score = 0.35×Reliability + 0.25×DatasetSize + 0.20×DataQuality + 0.10×Compute + 0.10×Network`
  Weights must be configurable (not hardcoded).
- FR-12: Aggregator supports FedAvg and FedProx; selectable per experiment run.
- FR-13: On client failure mid-round: retry same client (bounded attempts) or replace with next highest-scoring available client; round proceeds with partial aggregation if replacement unavailable.
- FR-14: Client Simulator supports configurable failure modes: dropout (probability), degraded network (latency/bandwidth), non-IID data (skew parameter), variable compute (speed multiplier) — each with a severity setting.
- FR-15: Monitoring stores per-round metrics: accuracy, loss, communication bytes, round duration, client health history.
- FR-16: Dashboard displays live round metrics and client health via WebSocket, and supports comparing multiple experiment runs.

## 4. Business Rules
- BR-1: A training round is not marked complete until aggregation + evaluation steps both succeed.
- BR-2: Client replacement only occurs if a replacement client score ≥ minimum threshold (configurable, default = lowest score among originally selected).
- BR-3: Scoring weights must sum to 1.0; system rejects invalid weight configs.
- BR-4: DP-SGD/secure aggregation explicitly not implemented; no privacy guarantee is claimed by the system.

## 5. Data Requirements
- `jobs`, `workflows`, `workflow_steps` tables — existing (Postgres).
- New: `fl_rounds` (round id, model_version, algorithm, status, started_at, completed_at)
- New: `fl_clients` (client_id, reliability, dataset_size, data_quality, compute_capacity, network_score, last_score, status)
- New: `fl_round_metrics` (round_id, accuracy, loss, comm_bytes, duration_ms)
- New: `fl_client_failures` (client_id, round_id, failure_type, severity, timestamp) — feeds scoring.

## 6. Validations
- Reject `/fl/train` if `client_id` unknown or `round` non-sequential.
- Reject scoring weight configs that don't sum to 1.0 ± 0.001.
- Reject workflow DAGs with cycles (existing cycle detection reused).
- Validate LLM-generated DAG JSON against schema before execution (existing).

## 7. Authentication & Authorization
- Single-operator system: no per-user auth required for MVP.
- Groq API key via environment variable, server-side only, never exposed to client.
- Internal Node↔Python callbacks (`/internal/step-complete`) restricted to internal network / shared secret header.

## 8. Error Handling & Edge Cases
- Client fails to respond within timeout → treated as dropout failure mode → triggers FR-13.
- All selected clients fail in a round → round marked `failed`, no partial aggregation attempted, logged for review.
- LLM returns invalid JSON → workflow generation request rejected with 400, no partial DAG created.
- Concurrent step-completion callbacks for the same step → idempotent handling (last-write-safe, no double-advance of DAG).

## 9. Security
- No DP/secure aggregation (explicitly out of scope — documented, not silently omitted).
- Internal service-to-service calls should not be exposed on public interfaces in any demo/deployment.
- No PII in client simulation data (synthetic datasets only).

## 10. Performance
- Heartbeat interval: 10s; stale detection: 30s (existing, reused for FL client health where applicable).
- Target: FL round with 5–10 simulated clients completes within a few minutes on a single dev machine.
- Dashboard updates pushed via WebSocket, not polling.

## 11. Acceptance Criteria (testable)
- AC-1: Submitting `POST /fl/train` for a valid client returns 202 and creates a traceable job in TaskQueue.
- AC-2: Killing a simulated client mid-round results in automatic retry/replacement and round still completes.
- AC-3: Changing scoring weights changes which clients are selected in the next round (verifiable via logs).
- AC-4: A full round with FedAvg and a full round with FedProx both produce evaluation metrics stored in `fl_round_metrics`.
- AC-5: Dashboard reflects round status changes within 2s of backend state change (WebSocket-driven).
