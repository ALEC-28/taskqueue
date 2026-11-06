# Product Requirements Document
## Fault-Tolerant Federated Learning Orchestrator with Intelligent Client Selection

---

## 1. Problem Statement
Real-world Federated Learning (FL) deployments fail operationally, not algorithmically. Clients drop out mid-training, networks degrade, compute varies, and data is non-IID. Most FL research optimizes model accuracy while ignoring the orchestration layer — client selection, fault recovery, scheduling — that production systems actually need. This project builds that missing operational layer: a distributed task orchestrator (TaskQueue) extended with an FL-specific orchestration service (TaskQueue-FL) that manages the full training lifecycle reliably.

## 2. Target Users
- **Primary**: ML/systems researchers and engineers evaluating FL orchestration strategies.
- **Secondary**: Academic evaluators (examiners) assessing distributed-systems and research depth.
- **Tertiary**: Engineers prototyping FL pipelines who need a self-hosted, non-cloud-locked orchestrator.

## 3. Goals
- Prove reliability-aware client selection improves convergence vs random selection (RQ1).
- Demonstrate fault-tolerant scheduling maintains accuracy under client failure (RQ2).
- Measure orchestration overhead vs efficiency gains (RQ3).
- Ship a reusable, general-purpose task queue (TaskQueue) as the underlying infra.

## 4. Core Features
1. Distributed job/task queue (Redis + Postgres) — existing, complete.
2. DAG workflow engine with parallel step execution — existing, complete.
3. Heartbeat-based crash recovery, zero job loss — existing, complete.
4. NL → DAG generation via LLM — existing, complete.
5. TypeScript SDK + CLI (`tq`) — existing, complete.
6. **FL Orchestrator (new)**: FastAPI service coordinating client selection, model distribution, aggregation (FedAvg/FedProx), and fault recovery via TaskQueue.
7. **Intelligent Client Selection Engine**: multi-factor scoring (reliability 0.35, dataset size 0.25, data quality 0.20, compute 0.10, network 0.10).
8. **Client Simulator**: configurable failure modes (dropout, slow network, non-IID data, variable compute).
9. **FL Monitoring Dashboard**: per-round metrics, client health, experiment comparison.

## 5. MVP Scope
In scope for MVP (Months 2–4 of plan):
- Node↔Python HTTP contract (`/fl/train`, `/internal/step-complete`)
- Basic client simulation (few clients, no failure injection)
- Client selection scoring engine (fixed weights)
- End-to-end DAG: `client_selection → model_distribute → local_training → aggregate → evaluate`
- One complete orchestrated training round

Out of MVP, deferred to later months: failure injection, ablation tuning, fault-tolerant retries/replacement, full monitoring dashboard, comparative evaluation.

## 6. User Stories
- As a researcher, I can trigger an FL training round via API so training is reproducible.
- As a researcher, I can configure client scoring weights so I can test different selection strategies.
- As an operator, I want crashed training jobs auto-requeued so a round doesn't fail from one client dropping.
- As an evaluator, I want per-round metrics (accuracy, loss, comm cost) so I can compare selection strategies.
- As a developer, I can simulate heterogeneous clients locally without real distributed hardware.

## 7. Success Metrics
- Convergence: fewer rounds to target accuracy under reliability-based selection vs random (RQ1 target: measurable improvement, report % delta).
- Fault recovery: 0% job loss on simulated client crash; recovery detected within 30s (inherited from TaskQueue heartbeat).
- Comm cost: total bytes transferred per round tracked and compared across strategies.
- System: full round completes end-to-end via DAG with zero manual intervention.

## 8. Assumptions
- Flower (flwr) + PyTorch used for FL algorithms (FedAvg, FedProx only).
- Client simulation is local/single-machine (no real edge devices).
- TaskQueue core (Node.js) is stable and unchanged during FL work.
- Differential privacy / secure aggregation explicitly out of scope.

## 9. Risks
| Risk | Mitigation |
|---|---|
| Scoring weights are arbitrary | Treat as tunable hyperparameters; ablation study in Month 5 |
| Client simulator too trivial | 3+ failure modes with configurable severity |
| Node↔Python contract breaks | Lock HTTP contract in Month 2 before FL code starts |
| "Privacy-preserving" overclaim | Explicitly scope out DP-SGD in report |
| Evaluation underscoped | One deep experiment only: reliability vs random selection |

## 10. Out of Scope
- Differential privacy / secure aggregation
- Real multi-device/edge deployment
- Multi-tenancy, billing, SaaS features (future phase, not this project)
- Algorithms beyond FedAvg/FedProx

## 11. Acceptance Criteria
- [ ] FL round runs end-to-end through TaskQueue DAG with no manual step triggering
- [ ] Client selection engine scores and ranks clients per configurable weights
- [ ] Simulated client failure mid-round is detected and recovered (retry or replacement) with no round failure
- [ ] Dashboard shows live per-round accuracy/loss and client health
- [ ] Controlled experiment (reliability vs random) produces reproducible, reported results
