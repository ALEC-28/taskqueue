-- Jobs table: the source of truth for every job in the system
CREATE TABLE IF NOT EXISTS jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  queue         TEXT NOT NULL DEFAULT 'default',
  payload       JSONB,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','done','failed','retrying')),
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 5,
  error         TEXT,
  worker_id     TEXT,
  last_heartbeat TIMESTAMPTZ,
  run_at        TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Index for the scheduler and dashboard queries
CREATE INDEX IF NOT EXISTS idx_jobs_status   ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_queue    ON jobs(queue);
CREATE INDEX IF NOT EXISTS idx_jobs_run_at   ON jobs(run_at);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Workflows table: parent record for a DAG workflow run
CREATE TABLE IF NOT EXISTS workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','failed')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Workflow steps: individual DAG nodes, linked to a job when enqueued
CREATE TABLE IF NOT EXISTS workflow_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  job_id      UUID REFERENCES jobs(id),
  name        TEXT NOT NULL,
  job_name    TEXT NOT NULL,
  queue       TEXT NOT NULL DEFAULT 'default',
  payload     JSONB DEFAULT '{}',
  depends_on  TEXT[] DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','done','failed')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);

CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Federated Learning Clients table
CREATE TABLE IF NOT EXISTS fl_clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  cpu_capability      JSONB NOT NULL DEFAULT '{}',
  memory_capability   JSONB NOT NULL DEFAULT '{}',
  gpu_capability      JSONB DEFAULT NULL,
  network_latency     NUMERIC NOT NULL DEFAULT 0.0,
  data_quality_score  NUMERIC NOT NULL DEFAULT 1.0,
  reliability_score   NUMERIC NOT NULL DEFAULT 1.0,
  status              TEXT NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available','busy','unhealthy','offline')),
  failure_count       INT NOT NULL DEFAULT 0,
  successful_task_count INT NOT NULL DEFAULT 0,
  last_heartbeat      TIMESTAMPTZ DEFAULT now(),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fl_clients_client_id ON fl_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_fl_clients_status    ON fl_clients(status);

CREATE TRIGGER fl_clients_updated_at
  BEFORE UPDATE ON fl_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Objective 2: Intelligent Client Selection ──────────────────────────────

-- FL Rounds: one record per FL training round
CREATE TABLE IF NOT EXISTS fl_rounds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number  INT NOT NULL,
  strategy      TEXT NOT NULL DEFAULT 'intelligent'
                  CHECK (strategy IN ('intelligent', 'random')),
  k             INT NOT NULL DEFAULT 3,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','done','failed')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fl_rounds_number   ON fl_rounds(round_number);
CREATE INDEX IF NOT EXISTS idx_fl_rounds_strategy ON fl_rounds(strategy);

-- FL Selection Results: per-client scores and selection decisions per round
CREATE TABLE IF NOT EXISTS fl_selection_results (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id             UUID NOT NULL REFERENCES fl_rounds(id) ON DELETE CASCADE,
  client_id            TEXT NOT NULL,
  reliability_score    NUMERIC(8,4) NOT NULL DEFAULT 0,
  compute_score        NUMERIC(8,4) NOT NULL DEFAULT 0,
  network_score        NUMERIC(8,4) NOT NULL DEFAULT 0,
  data_quality_score   NUMERIC(8,4) NOT NULL DEFAULT 0,
  availability_score   NUMERIC(8,4) NOT NULL DEFAULT 0,
  total_score          NUMERIC(8,4) NOT NULL DEFAULT 0,
  rank                 INT NOT NULL,
  selected             BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fl_selection_round  ON fl_selection_results(round_id);
CREATE INDEX IF NOT EXISTS idx_fl_selection_client ON fl_selection_results(client_id);