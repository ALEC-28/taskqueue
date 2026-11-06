-- ============================================================
-- Migration 002: FL Client Registry Schema Extension
-- Idempotent — safe to run multiple times on existing data.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Extend fl_clients with new columns
-- ────────────────────────────────────────────────────────────

ALTER TABLE fl_clients
  ADD COLUMN IF NOT EXISTS cpu_cores           INT            NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ram_gb              NUMERIC        NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS network_latency_ms  NUMERIC        NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS bandwidth_mbps      NUMERIC        NULL,
  ADD COLUMN IF NOT EXISTS dataset_size        INT            NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS data_quality        NUMERIC(3,2)   NOT NULL DEFAULT 0.80
                             CHECK (data_quality >= 0 AND data_quality <= 1),
  ADD COLUMN IF NOT EXISTS reliability_prior   NUMERIC        NULL,
  ADD COLUMN IF NOT EXISTS total_rounds        INT            NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS successful_rounds   INT            NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_failures INT           NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cooldown_rounds_left INT           NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source              TEXT           NOT NULL DEFAULT 'manual'
                             CHECK (source IN ('manual','csv','xlsx','json','simulated')),
  ADD COLUMN IF NOT EXISTS metadata            JSONB          NOT NULL DEFAULT '{}';

-- ────────────────────────────────────────────────────────────
-- 2. Update fl_clients.status CHECK to new vocabulary.
--    Map old values → new values first, then swap constraint.
-- ────────────────────────────────────────────────────────────

-- Map legacy status values

-- Drop old constraint and add new one
-- Drop old constraint FIRST, then remap values, then add the new constraint.
ALTER TABLE fl_clients DROP CONSTRAINT IF EXISTS fl_clients_status_check;

UPDATE fl_clients SET status = 'active'   WHERE status IN ('available','busy');
UPDATE fl_clients SET status = 'inactive' WHERE status IN ('unhealthy','offline');

ALTER TABLE fl_clients
  ADD CONSTRAINT fl_clients_status_check
    CHECK (status IN ('active','inactive','blacklisted'));

-- ────────────────────────────────────────────────────────────
-- 3. Backfill legacy JSONB capability columns → flat columns
--    (runs safely; does nothing if columns already populated)
-- ────────────────────────────────────────────────────────────

UPDATE fl_clients SET
  cpu_cores          = COALESCE((cpu_capability->>'cores')::int,  cpu_cores),
  ram_gb             = COALESCE((memory_capability->>'ram_gb')::numeric, ram_gb),
  network_latency_ms = COALESCE(network_latency::numeric, network_latency_ms),
  data_quality       = LEAST(1, GREATEST(0, COALESCE(data_quality_score::numeric, data_quality))),
  total_rounds       = COALESCE(successful_task_count, 0) + COALESCE(failure_count, 0),
  successful_rounds  = COALESCE(successful_task_count, 0)
WHERE TRUE;

-- ────────────────────────────────────────────────────────────
-- 4. Update fl_rounds.strategy CHECK to include epsilon_greedy
-- ────────────────────────────────────────────────────────────

ALTER TABLE fl_rounds DROP CONSTRAINT IF EXISTS fl_rounds_strategy_check;
ALTER TABLE fl_rounds
  ADD CONSTRAINT fl_rounds_strategy_check
    CHECK (strategy IN ('intelligent','random','epsilon_greedy'));

-- ────────────────────────────────────────────────────────────
-- 5. Add fl_round_clients table (new write target)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fl_round_clients (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id      UUID    NOT NULL REFERENCES fl_rounds(id) ON DELETE CASCADE,
  client_id     TEXT    NOT NULL,
  score         NUMERIC(8,4) NOT NULL DEFAULT 0,
  breakdown     JSONB   NOT NULL DEFAULT '{}',
  weights_used  JSONB   NOT NULL DEFAULT '{}',
  rank          INT     NOT NULL,
  selected      BOOLEAN NOT NULL DEFAULT false,
  reason        TEXT,
  strategy      TEXT    NOT NULL DEFAULT 'intelligent',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fl_rc_round    ON fl_round_clients(round_id);
CREATE INDEX IF NOT EXISTS idx_fl_rc_client   ON fl_round_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_fl_rc_selected ON fl_round_clients(round_id, selected);

-- ────────────────────────────────────────────────────────────
-- 6. Add ablation_runs table (for background ablation jobs)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fl_ablation_runs (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','done','failed')),
  config          JSONB   NOT NULL DEFAULT '{}',
  results         JSONB   NULL,
  error           TEXT    NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ NULL
);

-- ────────────────────────────────────────────────────────────
-- 7. Indexes for fast live-score queries
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fl_clients_source  ON fl_clients(source);
CREATE INDEX IF NOT EXISTS idx_fl_clients_cooldown ON fl_clients(cooldown_rounds_left);

COMMIT;
