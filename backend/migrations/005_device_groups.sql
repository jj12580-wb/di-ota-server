CREATE TABLE IF NOT EXISTS t_device_group (
  group_id VARCHAR(64) PRIMARY KEY,
  group_code VARCHAR(64) NOT NULL UNIQUE,
  group_name VARCHAR(128) NOT NULL,
  platform_id INT,
  org_id INT,
  created_by VARCHAR(64) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_t_device_group_platform_id ON t_device_group(platform_id);
CREATE INDEX IF NOT EXISTS idx_t_device_group_org_id ON t_device_group(org_id);
CREATE INDEX IF NOT EXISTS idx_t_device_group_created_by ON t_device_group(created_by);

CREATE TABLE IF NOT EXISTS t_device_group_member (
  group_id VARCHAR(64) NOT NULL REFERENCES t_device_group(group_id) ON DELETE CASCADE,
  sn VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, sn)
);

CREATE INDEX IF NOT EXISTS idx_t_device_group_member_sn ON t_device_group_member(sn);

