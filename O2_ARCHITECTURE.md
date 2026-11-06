# Objective 2 (O2): Reliability-Aware Intelligent Client Selection Architecture

## 1. Overview
Objective 2 (O2) enhances the TaskQueue Federated Learning Orchestrator with an **Intelligent, Multi-Factor Client Selection Engine**. Rather than randomly choosing participating clients per round (standard baseline FedAvg), the orchestrator evaluates all registered clients across 5 normalized performance and reliability metrics to select the **Top-K highest-performing nodes**.

---

## 2. Multi-Factor Client Scoring Model

### Mathematical Formulation
For each candidate client $i$, the overall selection score $S_i \in [0, 1]$ is computed as a weighted linear combination of five normalized sub-scores:

$$S_i = w_{\text{rel}} \cdot R_i + w_{\text{comp}} \cdot C_i + w_{\text{net}} \cdot N_i + w_{\text{qual}} \cdot Q_i + w_{\text{avail}} \cdot A_i$$

Where the factor weights satisfy $\sum w = 1.0$:

| Factor | Parameter | Weight ($w$) | Description |
| :--- | :--- | :---: | :--- |
| **Reliability** | $R_i$ | **0.35** | Historical task success rate: $\frac{\text{successes}}{\text{successes} + \text{failures}}$ |
| **Compute Capability** | $C_i$ | **0.25** | Hardware power: Normalized CPU cores, RAM (GB), and GPU bonus |
| **Network Performance** | $N_i$ | **0.20** | Latency penalty: $\frac{1}{1 + \frac{\text{latency\_ms}}{100}}$ |
| **Data Quality** | $Q_i$ | **0.10** | Dataset quality/volume score ($0.0 - 1.0$) |
| **Availability** | $A_i$ | **0.10** | Binary status ($1$ if `available` & heartbeat $<30\text{s}$, else $0$) |

---

## 3. Sub-Score Derivation & Normalization

### 1. Reliability Score ($R_i$)
* Measures node stability over previous execution rounds.
* Range: $[0, 1]$. Default for new nodes with zero task history is $1.0$.
* Equation: $R_i = \frac{N_{\text{success}}}{N_{\text{success}} + N_{\text{failure}}}$

### 2. Compute Score ($C_i$)
* Evaluates hardware capacity relative to a max baseline ($32$ cores, $64$ GB RAM).
* Includes GPU bonus (+0.25) if present.
* Equation: $C_i = \min\left(1.0, \frac{\text{cores}}{32} \times 0.5 + \frac{\text{ram\_gb}}{64} \times 0.5 + \text{gpu\_bonus}\right)$

### 3. Network Score ($N_i$)
* Penalizes communication delays in federated aggregation.
* Equation: $N_i = \frac{1}{1 + \frac{\text{latency\_ms}}{100}}$
* 20ms latency $\rightarrow N_i = 0.833$; 300ms latency $\rightarrow N_i = 0.25$.

### 4. Data Quality Score ($Q_i$)
* Reflects local dataset richness (e.g. image resolution, label noise, sample volume).
* Range: $[0, 1]$, stored in `fl_clients.data_quality_score`.

### 5. Availability Score ($A_i$)
* Evaluates real-time readiness.
* If client `status === 'available'` and `now - last_heartbeat <= 30s` $\rightarrow 1.0$, otherwise $0.0$.

---

## 4. Selection Algorithm (Top-K vs Baseline)

```
        ┌────────────────────────────────────────────────────────┐
        │                 Registered FL Clients                  │
        └───────────────────────────┬────────────────────────────┘
                                    │
                         ┌──────────┴──────────┐
                         │  Eligibility Filter │
                         │ (Status & Heartbeat)│
                         └──────────┬──────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
        ┌─────────────────────────┐   ┌─────────────────────────┐
        │   Intelligent Strategy  │   │     Random Strategy     │
        ├─────────────────────────┤   ├─────────────────────────┤
        │ Compute score S_i for   │   │ Uniform random shuffle  │
        │ all eligible clients    │   │ of eligible clients     │
        │ Sort descending         │   │                         │
        │ Take Top-K              │   │ Take Top-K              │
        └────────────┬────────────┘   └────────────┬────────────┘
                     │                             │
                     └──────────────┬──────────────┘
                                    ▼
                        ┌───────────────────────┐
                        │ Save Selection Record │
                        │  to PostgreSQL DB     │
                        └───────────────────────┘
```

1. **Eligibility Filtering**: Excludes clients marked `busy`, `unhealthy`, `offline`, or with stale heartbeats ($>30\text{s}$).
2. **Scoring & Ranking**: In `intelligent` mode, all eligible clients are scored and sorted by $S_i \downarrow$. In `random` mode, eligible clients are randomly sampled.
3. **Execution Enqueue**: Enqueues $K$ FL training jobs into the TaskQueue system.
4. **Persistence**: Scores and selection flags for all evaluated nodes are logged in `fl_selection_results`.

---

## 5. Database Schema Additions

### `fl_rounds` Table
Tracks federated learning round executions.
```sql
CREATE TABLE IF NOT EXISTS fl_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_number INT NOT NULL,
    strategy VARCHAR(50) NOT NULL, -- 'intelligent' or 'random'
    k INT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'running',
    metrics JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);
```

### `fl_selection_results` Table
Records candidate scores and selection decisions for auditing and visualization.
```sql
CREATE TABLE IF NOT EXISTS fl_selection_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID REFERENCES fl_rounds(id) ON DELETE CASCADE,
    client_id VARCHAR(255) NOT NULL,
    score_total NUMERIC(6,4) NOT NULL,
    score_reliability NUMERIC(6,4) NOT NULL,
    score_compute NUMERIC(6,4) NOT NULL,
    score_network NUMERIC(6,4) NOT NULL,
    score_data_quality NUMERIC(6,4) NOT NULL,
    score_availability NUMERIC(6,4) NOT NULL,
    selected BOOLEAN NOT NULL DEFAULT FALSE,
    rank INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. Simulated Model Convergence & Experiment Model

### Healthcare Scenario Topology
10 simulated hospital/clinic nodes with heterogeneous hardware, network latency, and historical reliability:

| Client ID | Hardware Tier | Latency | Reliability | Role |
| :--- | :--- | :---: | :---: | :--- |
| `fl-sim-c1` | 16 Cores / 32GB | 20ms | 95% | Major Medical Center |
| `fl-sim-c2` | 8 Cores / 16GB | 60ms | 80% | Regional Hospital |
| `fl-sim-c3` | 4 Cores / 8GB | 120ms | 65% | Community Clinic |
| `fl-sim-c4` | 16 Cores / 32GB | 15ms | 98% | Academic Research Hospital |
| `fl-sim-c5` | 2 Cores / 4GB | 250ms | 50% | Remote Rural Health Post |
| `fl-sim-c6` | 8 Cores / 16GB | 80ms | 75% | Urban Clinic |
| `fl-sim-c7` | 12 Cores / 24GB | 40ms | 90% | Specialized Hospital |
| `fl-sim-c8` | 4 Cores / 8GB | 180ms | 60% | Mobile Diagnostic Unit |
| `fl-sim-c9` | 8 Cores / 16GB | 50ms | 85% | Outpatient Center |
| `fl-sim-c10` | 2 Cores / 4GB | 300ms | 45% | Telehealth Outpost |

### Analytical Model Convergence Formula
To rigorously compare `intelligent` vs `random` strategies without non-deterministic deep learning training overhead, model accuracy after round $r$ is modeled analytically as:

$$\text{Accuracy}(r) = 0.5 + 0.5 \times \left(1 - e^{-Q_{\text{round}} \cdot r \cdot 0.4}\right)$$

Where $Q_{\text{round}}$ is the effective round quality of selected clients:

$$Q_{\text{round}} = \frac{1}{K} \sum_{i \in \text{Selected}} \left( Q_i \cdot R_i \right)$$

Higher average quality and reliability among selected clients yields faster accuracy convergence and fewer round failures.

---

## 7. Verification & Test Suite

The implementation is verified by 24 unit and integration tests:

1. **O1 Core & Recovery Test Suite (10/10 Passed)**
   * Client registration, heartbeat, failure detection, TaskQueue dynamic replacement, workflow recovery, duplicate protection.
2. **O2 Intelligent Selection Test Suite (14/14 Passed)**
   * Scoring factor correctness, $[0, 1]$ normalization, descending score ranking, Top-K selection, busy/unhealthy/stale client exclusion, low-reliability vs high-reliability ranking, sub-$K$ fallback, weights sum verification, database persistence.

---

## 8. Summary of Results & Benefits
* **Faster Convergence**: Intelligent selection picks nodes with high data quality ($Q_i$) and reliability ($R_i$), reaching higher accuracy in fewer rounds.
* **Higher Node Stability**: Reduces straggler effects and network bottlenecks by prioritizing low-latency ($N_i$) and compute-capable ($C_i$) devices.
* **Seamless Fault Tolerance Integration**: Integrates directly with O1's TaskQueue architecture—if a selected client fails during a round, O1 automatically replaces it with the next best eligible client.
