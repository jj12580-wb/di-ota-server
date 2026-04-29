-- 002_enhance: 扩展包元数据、设备管理、升级状态字段

-- t_package: 增加文件大小、硬件版本范围、依赖版本、发布时间
ALTER TABLE t_package ADD COLUMN IF NOT EXISTS file_size BIGINT NOT NULL DEFAULT 0;
ALTER TABLE t_package ADD COLUMN IF NOT EXISTS name VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE t_package ADD COLUMN IF NOT EXISTS hardware_version_min VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE t_package ADD COLUMN IF NOT EXISTS hardware_version_max VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE t_package ADD COLUMN IF NOT EXISTS min_upgradable_version VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE t_package ADD COLUMN IF NOT EXISTS depends_on_version VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE t_package ADD COLUMN IF NOT EXISTS publish_time TIMESTAMPTZ;

-- t_device: 增加 tags 和 product_code
ALTER TABLE t_device ADD COLUMN IF NOT EXISTS product_code VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE t_device ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE t_device ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- t_upgrade_record: 增加 source_version 和 error_code
ALTER TABLE t_upgrade_record ADD COLUMN IF NOT EXISTS source_version VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE t_upgrade_record ADD COLUMN IF NOT EXISTS target_version VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE t_upgrade_record ADD COLUMN IF NOT EXISTS error_code VARCHAR(64) NOT NULL DEFAULT '';

-- t_release_task: 增加 canary 和 schedule 字段
ALTER TABLE t_release_task ADD COLUMN IF NOT EXISTS canary_percent INT NOT NULL DEFAULT 100;
ALTER TABLE t_release_task ADD COLUMN IF NOT EXISTS schedule_time TIMESTAMPTZ;
ALTER TABLE t_release_task ADD COLUMN IF NOT EXISTS force_upgrade BOOLEAN NOT NULL DEFAULT false;

-- 设备索引
CREATE INDEX IF NOT EXISTS idx_device_group ON t_device(device_group);
CREATE INDEX IF NOT EXISTS idx_device_model ON t_device(product_model);
CREATE INDEX IF NOT EXISTS idx_device_heartbeat ON t_device(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_upgrade_error ON t_upgrade_record(error_code);
CREATE INDEX IF NOT EXISTS idx_task_stats_task ON t_task_stats(task_id);
