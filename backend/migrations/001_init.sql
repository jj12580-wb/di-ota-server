CREATE TABLE IF NOT EXISTS t_package (
  package_id VARCHAR(64) PRIMARY KEY,
  product_code VARCHAR(64) NOT NULL,
  version VARCHAR(64) NOT NULL,
  file_hash VARCHAR(128) NOT NULL,
  signature TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_release_task (
  task_id VARCHAR(64) PRIMARY KEY,
  package_id VARCHAR(64) NOT NULL REFERENCES t_package(package_id),
  target_group VARCHAR(64) NOT NULL,
  product_model VARCHAR(64) NOT NULL,
  hardware_version VARCHAR(64) NOT NULL,
  failure_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.0500,
  state VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_t_package_status'
  ) THEN
    ALTER TABLE t_package
      ADD CONSTRAINT chk_t_package_status
      CHECK (status IN ('Draft', 'Published', 'Deprecated'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_t_release_task_state'
  ) THEN
    ALTER TABLE t_release_task
      ADD CONSTRAINT chk_t_release_task_state
      CHECK (state IN ('Running', 'Paused', 'Completed', 'RolledBack', 'Failed'));
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS t_device (
  device_id VARCHAR(64) PRIMARY KEY,
  device_group VARCHAR(64) NOT NULL,
  product_model VARCHAR(64) NOT NULL,
  hardware_version VARCHAR(64) NOT NULL,
  current_version VARCHAR(64) NOT NULL,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_upgrade_record (
  id BIGSERIAL PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL,
  task_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_id, task_id)
);

CREATE TABLE IF NOT EXISTS t_audit_log (
  id BIGSERIAL PRIMARY KEY,
  trace_id VARCHAR(64) NOT NULL,
  operator VARCHAR(64) NOT NULL,
  operation_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(64) NOT NULL,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_task_stats (
  id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  failure_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0000,
  error_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_idempotency (
  idem_key VARCHAR(128) PRIMARY KEY,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_filter ON t_release_task(target_group, product_model, hardware_version, state);
CREATE INDEX IF NOT EXISTS idx_upgrade_record_task ON t_upgrade_record(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_trace ON t_audit_log(trace_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_created_at ON t_idempotency(created_at);
CREATE INDEX IF NOT EXISTS idx_task_stats_snapshot_time ON t_task_stats(snapshot_time);
