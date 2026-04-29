-- 003_task_and_package_state: 扩展任务状态与包状态枚举

ALTER TABLE t_release_task DROP CONSTRAINT IF EXISTS chk_t_release_task_state;
ALTER TABLE t_release_task
  ADD CONSTRAINT chk_t_release_task_state
  CHECK (state IN ('Draft', 'Running', 'Paused', 'Completed', 'RolledBack', 'Failed'));

ALTER TABLE t_package DROP CONSTRAINT IF EXISTS chk_t_package_status;
ALTER TABLE t_package
  ADD CONSTRAINT chk_t_package_status
  CHECK (status IN ('Draft', 'Published', 'Deprecated', 'Disabled', 'Archived'));
