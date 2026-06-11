# TaskQueue
**Distributed Task Queue & Workflow Engine**

## Day 1 — Getting Started

### 1. Start infrastructure
```bash
docker compose up -d
```
Starts Redis on :6379 and Postgres on :5432. DB schema auto-runs from init.sql.

### 2. Install API dependencies
```bash
cd api && npm install
```

### 3. Install Worker dependencies
```bash
cd worker && npm install
```

### 4. Start the API (terminal 1)
```bash
cd api && npm run dev
```
You should see:
```
[redis] connected
[api] listening on http://localhost:3000
```

### 5. Start the Worker (terminal 2)
```bash
cd worker && npm run dev
```
You should see:
```
[worker] starting — id: your-hostname-12345
[worker] listening on queues: queue:high, queue:default, queue:low
```

### 6. Submit your first job (terminal 3)
```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"name": "send_welcome_email", "queue": "default", "payload": {"to": "test@example.com"}}'
```

### 7. Check the job status
```bash
curl http://localhost:3000/jobs/<id from step 6>
```

### Day 1 success criteria ✓
- Job submitted → appears in Postgres as `pending`
- Worker picks it up → status changes to `running`
- Worker completes → status changes to `done`
- Full round trip in under 1 second

## Project Structure
```
taskqueue/
├── docker-compose.yml   # Redis + Postgres
├── init.sql             # DB schema
├── api/
│   ├── index.js         # Express server (POST /jobs, GET /jobs/:id)
│   ├── db.js            # Postgres connection pool
│   ├── queue.js         # Redis enqueue helper
│   └── package.json
└── worker/
    ├── index.js         # Worker process (BRPOP loop)
    └── package.json
```

## Week 1 APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /jobs | Submit a new job |
| GET | /jobs/:id | Get job status |
| GET | /jobs | List recent jobs |
| GET | /health | Health check |
