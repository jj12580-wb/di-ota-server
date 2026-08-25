-- Single-device release tasks: pin snapshot to one device_id.
ALTER TABLE t_release_task
  ADD COLUMN IF NOT EXISTS target_device_id VARCHAR(128) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_release_task_target_device
  ON t_release_task(target_device_id)
  WHERE target_device_id <> '';
