-- name: CreatePackage :one
INSERT INTO t_package (
  package_id,
  product_code,
  version,
  file_hash,
  signature,
  status
) VALUES (
  $1, $2, $3, $4, $5, $6
)
RETURNING package_id, product_code, version, file_hash, signature, status, created_at;

-- name: GetPackageByID :one
SELECT package_id, product_code, version, file_hash, signature, status, created_at
FROM t_package
WHERE package_id = $1;

-- name: CreateReleaseTask :one
INSERT INTO t_release_task (
  task_id,
  package_id,
  target_group,
  product_model,
  hardware_version,
  failure_threshold,
  state
) VALUES (
  $1, $2, $3, $4, $5, $6, $7
)
RETURNING task_id, package_id, target_group, product_model, hardware_version, failure_threshold, state, created_at;

-- name: GetReleaseTaskByID :one
SELECT task_id, package_id, target_group, product_model, hardware_version, failure_threshold, state, created_at
FROM t_release_task
WHERE task_id = $1;

-- name: UpdateReleaseTaskState :one
UPDATE t_release_task
SET state = $2
WHERE task_id = $1
RETURNING task_id, package_id, target_group, product_model, hardware_version, failure_threshold, state, created_at;

-- name: ListMatchingRunningTasks :many
SELECT task_id, package_id, target_group, product_model, hardware_version, failure_threshold, state, created_at
FROM t_release_task
WHERE state = 'Running'
  AND target_group = $1
  AND product_model = $2
  AND hardware_version = $3
ORDER BY created_at DESC;

-- name: UpsertUpgradeRecord :one
INSERT INTO t_upgrade_record (
  device_id,
  task_id,
  status
) VALUES (
  $1, $2, $3
)
ON CONFLICT (device_id, task_id)
DO UPDATE SET
  status = EXCLUDED.status,
  created_at = NOW()
RETURNING id, device_id, task_id, status, created_at;

-- name: CreateAuditLog :one
INSERT INTO t_audit_log (
  trace_id,
  operator,
  operation_type,
  resource_id,
  before_state,
  after_state
) VALUES (
  $1, $2, $3, $4, $5, $6
)
RETURNING id, trace_id, operator, operation_type, resource_id, before_state, after_state, created_at;

-- name: ListAuditLogsByResource :many
SELECT id, trace_id, operator, operation_type, resource_id, before_state, after_state, created_at
FROM t_audit_log
WHERE resource_id = $1
ORDER BY created_at DESC
LIMIT 100;

-- name: CreateIdempotency :one
INSERT INTO t_idempotency (
  idem_key,
  response
) VALUES (
  $1, $2
)
ON CONFLICT (idem_key)
DO UPDATE SET idem_key = t_idempotency.idem_key
RETURNING idem_key, response, created_at;

-- name: GetIdempotency :one
SELECT idem_key, response, created_at
FROM t_idempotency
WHERE idem_key = $1;

-- name: ListPackages :many
SELECT package_id, product_code, version, file_hash, signature, status, created_at
FROM t_package
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountPackages :one
SELECT COUNT(*) FROM t_package;

-- name: UpdatePackageStatus :one
UPDATE t_package
SET status = $2
WHERE package_id = $1
RETURNING package_id, product_code, version, file_hash, signature, status, created_at;

-- name: ListReleaseTasks :many
SELECT rt.task_id, rt.package_id, rt.target_group, rt.product_model,
       rt.hardware_version, rt.failure_threshold, rt.state, rt.created_at,
       p.product_code, p.version
FROM t_release_task rt
LEFT JOIN t_package p ON rt.package_id = p.package_id
ORDER BY rt.created_at DESC
LIMIT $1 OFFSET $2;

-- name: GetTaskStats :one
SELECT task_id, total_count, success_count, failed_count, failure_rate,
       error_distribution, snapshot_time
FROM t_task_stats
WHERE task_id = $1
ORDER BY snapshot_time DESC
LIMIT 1;

-- name: ListUpgradeRecordsByTask :many
SELECT id, device_id, task_id, status, created_at
FROM t_upgrade_record
WHERE task_id = $1
ORDER BY created_at DESC
LIMIT 100;

-- name: UpsertDevice :one
INSERT INTO t_device (device_id, device_group, product_model, hardware_version, current_version, product_code)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (device_id)
DO UPDATE SET
  current_version = EXCLUDED.current_version,
  last_heartbeat = NOW(),
  product_code = EXCLUDED.product_code
RETURNING device_id, device_group, product_model, hardware_version, current_version, product_code, last_heartbeat, tags, registered_at;

-- name: GetDeviceByID :one
SELECT device_id, device_group, product_model, hardware_version, current_version, product_code, last_heartbeat, tags, registered_at
FROM t_device
WHERE device_id = $1;

-- name: ListDevices :many
SELECT device_id, device_group, product_model, hardware_version, current_version, product_code, last_heartbeat, tags, registered_at
FROM t_device
ORDER BY last_heartbeat DESC
LIMIT $1 OFFSET $2;

-- name: CountDevices :one
SELECT COUNT(*) FROM t_device;
