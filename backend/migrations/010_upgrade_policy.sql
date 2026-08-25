-- Scoped upgrade policies: optional match fields (empty = wildcard).
-- Used by report-status to pick relaxed/strict mode (most specific match wins).

CREATE TABLE IF NOT EXISTS t_upgrade_policy (
  policy_id VARCHAR(64) PRIMARY KEY,
  device_id VARCHAR(128) NOT NULL DEFAULT '',
  product_code VARCHAR(64) NOT NULL DEFAULT '',
  product_model VARCHAR(64) NOT NULL DEFAULT '',
  hardware_version VARCHAR(64) NOT NULL DEFAULT '',
  device_group VARCHAR(64) NOT NULL DEFAULT '',
  current_version VARCHAR(64) NOT NULL DEFAULT '',
  report_status_mode VARCHAR(16) NOT NULL DEFAULT 'relaxed'
    CHECK (report_status_mode IN ('relaxed', 'strict')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_upgrade_policy_device
  ON t_upgrade_policy(device_id) WHERE device_id <> '';
CREATE INDEX IF NOT EXISTS idx_upgrade_policy_model
  ON t_upgrade_policy(product_model) WHERE product_model <> '';
CREATE INDEX IF NOT EXISTS idx_upgrade_policy_code
  ON t_upgrade_policy(product_code) WHERE product_code <> '';
