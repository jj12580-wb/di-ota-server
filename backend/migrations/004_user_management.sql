CREATE TABLE IF NOT EXISTS t_user (
  user_id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(128) NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'enabled',
  auth_source VARCHAR(32) NOT NULL DEFAULT 'local',
  last_login_at TIMESTAMPTZ,
  last_operation_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_t_user_status'
  ) THEN
    ALTER TABLE t_user
      ADD CONSTRAINT chk_t_user_status
      CHECK (status IN ('enabled', 'disabled'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_t_user_auth_source'
  ) THEN
    ALTER TABLE t_user
      ADD CONSTRAINT chk_t_user_auth_source
      CHECK (auth_source IN ('local', 'sso'));
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS t_role (
  role_code VARCHAR(32) PRIMARY KEY,
  display_name VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_user_role (
  user_id VARCHAR(64) NOT NULL REFERENCES t_user(user_id) ON DELETE CASCADE,
  role_code VARCHAR(32) NOT NULL REFERENCES t_role(role_code) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_code)
);

CREATE INDEX IF NOT EXISTS idx_t_user_status ON t_user(status);
CREATE INDEX IF NOT EXISTS idx_t_user_username ON t_user(username);
CREATE INDEX IF NOT EXISTS idx_t_user_role_user ON t_user_role(user_id);
CREATE INDEX IF NOT EXISTS idx_t_user_role_role ON t_user_role(role_code);

INSERT INTO t_role (role_code, display_name)
VALUES
  ('admin', '管理员'),
  ('release', '发布工程师'),
  ('readonly', '只读用户'),
  ('audit', '审计用户')
ON CONFLICT (role_code) DO NOTHING;