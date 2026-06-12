# TaskQueue
> Distributed Task Queue & Workflow Engine

A self-hosted, production-grade background job processing system built from first principles. Directly analogous to [Temporal](https://temporal.io/) (Uber), [Conductor](https://netflix.github.io/conductor/) (Netflix), and [Celery](https://docs.celeryq.dev/) — built as a final year B.Tech project.

---

## Features

- **Asynchronous job processing** — submit jobs via REST API, workers execute in background
- **At-least-once delivery** — Redis-backed queuing guarantees no job is lost
- **Automatic retry with exponential backoff** — failed jobs retry at 1s, 2s, 4s, 8s, 16s
- **Heartbeat-based crash recovery** — dead workers detected in 30s, jobs automatically requeued
- **DAG workflow engine** — define multi-step pipelines with parallel branches and dependencies
- **Natural language workflow generation** — describe workflows in plain English, LLM generates the DAG
- **Priority queues** — high / default / low priority with automatic draining order
- **Delayed jobs** — schedule jobs to run after N seconds
- **Live observability dashboard** — real-time React UI with WebSocket updates
- **Horizontal scaling** — run multiple workers, load distributes automatically

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API Server | Node.js + Express |
| Message Broker | Redis (LPUSH/BRPOP) |
| State Store | PostgreSQL |
| Workers | Node.js processes |
| Workflow Engine | Custom DAG (topological sort) |
| AI Interface | Groq API (Llama 3.1) |
| Dashboard | React + Recharts + WebSocket |
| Infrastructure | Docker + Docker Compose |

---

## Architecture

```
┌─────────────┐     POST /jobs      ┌─────────────────┐
│   Client    │ ──────────────────► │   REST API      │
└─────────────┘                     │   (Express)     │
                                    └────────┬────────┘
                                             │ LPUSH job_id
                                             ▼
                                    ┌─────────────────┐
                                    │     Redis       │
                                    │  queue:high     │
                                    │  queue:default  │
                                    │  queue:low      │
                                    └────────┬────────┘
                                             │ BRPOP
                              ┌──────────────┼──────────────┐
                              ▼              ▼              ▼
                         ┌────────┐    ┌────────┐    ┌────────┐
                         │Worker 1│    │Worker 2│    │Worker 3│
                         └────┬───┘    └────┬───┘    └────┬───┘
                              │             │              │
                              └──────────────┴──────────────┘
                                             │ UPDATE status
                                             ▼
                                    ┌─────────────────┐
                                    │   PostgreSQL    │
                                    │   jobs table    │
                                    │ workflows table │
                                    └─────────────────┘
                                             │
                                             │ WebSocket events
                                             ▼
                                    ┌─────────────────┐
                                    │ React Dashboard │
                                    │  localhost:5173 │
                                    └─────────────────┘
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- Docker Desktop

### 1. Clone and setup
```bash
git clone https://github.com/ALEC-28/taskqueue.git
cd taskqueue
```

### 2. Start infrastructure
```bash
docker compose up -d
```

### 3. Run the schema
```bash
docker exec -it taskqueue-postgres-1 psql -U admin -d taskqueue -f /docker-entrypoint-initdb.d/init.sql
```

### 4. Start API
```bash
cd api
npm install
GROQ_API_KEY=your_key npm run dev
```

### 5. Start Worker
```bash
cd worker
npm install
npm run dev
```

### 6. Start Dashboard
```bash
cd dashboard
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## API Reference

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/jobs` | Submit a new job |
| GET | `/jobs/:id` | Get job status |
| GET | `/jobs` | List recent jobs |
| GET | `/health` | Health check |

**Submit a job:**
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"name":"send_welcome_email","queue":"high","payload":{"to":"user@example.com"}}'
```

**Submit a delayed job (runs after 30s):**
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"name":"send_welcome_email","queue":"default","payload":{},"delay_seconds":30}'
```

### Workflows

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/workflows` | Submit a DAG workflow |
| GET | `/workflows/:id` | Get workflow + step status |
| GET | `/workflows` | List all workflows |
| POST | `/workflows/generate` | Generate workflow from natural language |

**Submit a DAG workflow:**
```bash
curl -X POST http://localhost:3000/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "order_pipeline",
    "steps": [
      {"name": "fraud_check", "job_name": "fraud_check", "queue": "high", "depends_on": []},
      {"name": "send_email", "job_name": "send_welcome_email", "queue": "default", "depends_on": []},
      {"name": "generate_invoice", "job_name": "generate_invoice", "queue": "default", "depends_on": ["fraud_check", "send_email"]}
    ]
  }'
```

**Generate workflow from plain English:**
```bash
curl -X POST http://localhost:3000/workflows/generate \
  -H "Content-Type: application/json" \
  -d '{"description":"Send a welcome email and resize the profile picture in parallel, then generate the invoice"}'
```

---

## Job Lifecycle

```
pending → running → done
                 ↘
               retrying → pending (retry loop)
                       ↘
                      failed (max attempts reached)
```

## Crash Recovery

Workers emit a heartbeat to Redis every **10 seconds**. A background scheduler checks every **30 seconds** for jobs stuck in `running` state with no heartbeat. Stale jobs are automatically requeued — guaranteeing **zero job loss** even on worker crashes.

## Scaling

Run multiple worker processes to scale horizontally:
```bash
# Terminal 1
cd worker && npm run dev

# Terminal 2
cd worker && npm run dev

# Terminal 3
cd worker && npm run dev
```

Redis distributes jobs across all workers automatically via BRPOP competition.

---

## Real-world Analogues

| Company | System | This project implements |
|---------|--------|------------------------|
| Uber | Temporal | Workflow engine, crash recovery |
| Netflix | Conductor | DAG execution, parallel branches |
| Airbnb | Airflow | Job pipelines, dependency resolution |
| Shopify | Sidekiq | Redis-backed queue, retry logic |

---

## Project Structure

```
taskqueue/
├── docker-compose.yml     # Redis + PostgreSQL
├── init.sql               # Database schema
├── api/
│   ├── index.js           # Express REST API
│   ├── db.js              # PostgreSQL connection
│   ├── queue.js           # Redis enqueue helper
│   ├── workflow.js        # DAG engine + topological sort
│   ├── ai.js              # LLM workflow generation (Groq)
│   ├── scheduler.js       # Delayed job scheduler
│   ├── ws.js              # WebSocket server
│   └── package.json
├── worker/
│   ├── index.js           # Worker process + heartbeat
│   └── package.json
└── dashboard/
    └── src/
        └── App.jsx        # React live dashboard
```

---

*Final Year B.Tech Project — CSE | AI Vertical | 2025–2026*
