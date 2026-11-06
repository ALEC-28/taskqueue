# Development Plan
## Fault-Tolerant Federated Learning Orchestrator with Intelligent Client Selection

---

## 1. Current State (baseline, already done)
TaskQueue core complete: API, Redis queue, Postgres, workers, heartbeat/crash recovery, DAG engine, NL→DAG, dashboard, SDK (`taskqueue-js`), CLI (`tq`). This plan covers only the **remaining work**: FL orchestrator + UI extensions.

## 2. Roadmap (maps to `TaskQueue_FL_Plan.md` timeline)

### Phase 0 — Setup (Month 1 remainder)
- [ ] Testing pass on existing API/worker/CLI
- [ ] README/demo video polish, tag `v1.0`
- **Priority**: High | **Dependency**: none | **DoD**: v1.0 tagged, all existing demo flows pass

### Phase 1 — Integration Contract + FL Foundation (Month 2)
- [ ] Lock HTTP contract: `POST /fl/train`, `POST /internal/step-complete` (request/response schemas frozen)
- [ ] Scaffold FastAPI service (`fl/` directory), Dockerfile
- [ ] Basic client simulation (few clients, no failure modes)
- [ ] Confirm one FL job runs through TaskQueue DAG end-to-end (single client, no scoring yet)
- **Priority**: High (blocks everything else) | **Dependency**: Phase 0 | **DoD**: one round completes via `/fl/train` → `/internal/step-complete`, visible in TaskQueue jobs table

### Phase 2 — Client Simulator (Month 3)
- [ ] Failure modes: dropout, degraded network, non-IID data, variable compute — each configurable severity
- [ ] Failure logging → `fl_client_failures` table
- **Priority**: High | **Dependency**: Phase 1 | **DoD**: each failure mode independently triggerable and logged; verified via test harness

### Phase 3 — Full Orchestration + Backend Tables (Month 4)
- [ ] DB migrations: `fl_rounds`, `fl_clients`, `fl_round_metrics`, `fl_client_failures`
- [ ] Client Selector: scoring engine (FR-11), configurable weights, weight-sum validation
- [ ] Full DAG: `client_selection → model_distribute → local_training (parallel) → aggregate → evaluate`
- [ ] Aggregator: FedAvg + FedProx (Flower + PyTorch)
- [ ] First full orchestrated round, end to end
- **Priority**: High | **Dependency**: Phase 1, 2 | **DoD**: full round completes with real scoring + aggregation, metrics persisted

### Phase 4 — Fault Tolerance + Scoring Tuning (Month 5)
- [ ] Retry failed training jobs (bounded attempts)
- [ ] Client replacement on dropout (next highest-scoring available client, BR-2 threshold)
- [ ] Partial aggregation when subset of clients fail
- [ ] Ablation study: vary scoring weights, record convergence impact
- **Priority**: High | **Dependency**: Phase 3 | **DoD**: simulated client crash mid-round → round still completes with correct handling (AC-2); ablation results documented

### Phase 5 — Frontend: FL Rounds / Clients / Experiments (Month 5–6, parallel with Phase 4/6)
- [ ] DAG node graph component (SVG, reusable)
- [ ] FL Rounds screens (list, detail/live)
- [ ] Clients screen (roster + weight editor)
- [ ] Experiments screen (comparison view)
- [ ] WebSocket events for FL round/client state
- **Priority**: Medium-High | **Dependency**: Phase 3 backend tables/API | **DoD**: all UI/UX doc screens implemented, live updates verified against a real round

### Phase 6 — Monitoring Dashboard Depth (Month 6)
- [ ] Per-round metrics charts (accuracy, loss, comm overhead)
- [ ] Client health history views
- [ ] Experiment management (save/tag/compare runs)
- **Priority**: Medium | **Dependency**: Phase 5 | **DoD**: dashboard supports comparing ≥2 completed experiments side by side

### Phase 7 — Evaluation (Month 7)
- [ ] Controlled experiment: reliability-based vs random selection
- [ ] FedAvg vs FedProx only
- [ ] Record: convergence speed, accuracy, failure recovery rate, comm cost
- **Priority**: High (core research deliverable) | **Dependency**: Phase 4, 6 | **DoD**: clean, reproducible results table + charts, no scope creep beyond this one experiment

### Phase 8 — Buffer, Report, Demo (Month 8 / Feb–Mar)
- [ ] Bug fixing buffer
- [ ] Final report (paper format), architecture doc finalization
- [ ] Demo video: live training round, crash recovery, NL workflow generation
- [ ] Presentation polish
- **Priority**: High | **Dependency**: all prior phases | **DoD**: report submitted, demo runs live without failure

## 3. Cross-Cutting: Testing (ongoing, every phase)
- Unit tests: scoring engine, aggregator math (FedAvg/FedProx), DAG advancement idempotency.
- Integration tests: `/fl/train` → `/internal/step-complete` round trip; full round with injected failures.
- Manual test checklist per phase before moving on (no phase starts with unresolved failing tests from prior phase).

## 4. Bug Fixing Policy
- Bugs found during a phase are fixed before advancing to next phase if they block core DAG flow or data integrity (jobs/metrics tables).
- Cosmetic/UI bugs may be logged and deferred to Phase 8 buffer.

## 5. Deployment
- Local Docker Compose for all phases (Redis + Postgres + API + FL service).
- No cloud/SaaS deployment in this project's scope — explicitly deferred per `TaskQueue_FL_Plan.md`.
- Tag releases at major milestones: `v1.0` (Phase 0), `v1.0-fl-alpha` (Phase 3), `v1.0-fl` (Phase 7 complete).

## 6. Milestones Summary
| Month | Milestone | Deliverable |
|---|---|---|
| 1 | TaskQueue v1.0 | Core closed, tagged |
| 2 | FL foundation | Basic FL execution through TaskQueue |
| 3 | Client simulator | Realistic heterogeneous simulator |
| 4 | Full orchestration | First complete orchestrated round |
| 5 | Fault tolerance | Fault-tolerant training + ablation results |
| 6 | Monitoring | Production-style FL dashboard |
| 7 | Evaluation | Controlled experiment, clean results |
| 8 | Final | Report + presentation-ready demo |

## 7. Definition of Done (project-level)
- [ ] All functional requirements (SRS §3) implemented and passing acceptance criteria (SRS §11)
- [ ] Full round (5–10 clients) completes end-to-end with zero manual intervention
- [ ] Fault injection scenarios recover correctly without round failure
- [ ] Dashboard reflects live state within 2s of backend change
- [ ] Controlled evaluation experiment reproducible from a documented command/config
- [ ] Final report + demo video delivered
