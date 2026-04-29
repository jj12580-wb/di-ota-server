package store

import (
	"context"
	"database/sql"
)

type CreateReleaseTaskExtParams struct {
	TaskID           string
	PackageID        string
	TargetGroup      string
	ProductModel     string
	HardwareVersion  string
	FailureThreshold string
	State            string
	CanaryPercent    int32
	ScheduleTime     sql.NullTime
	ForceUpgrade     bool
}

func (q *Queries) CreateReleaseTaskExt(ctx context.Context, arg CreateReleaseTaskExtParams) (TReleaseTask, error) {
	row := q.db.QueryRowContext(ctx, `
INSERT INTO t_release_task (
  task_id,
  package_id,
  target_group,
  product_model,
  hardware_version,
  failure_threshold,
  state,
  canary_percent,
  schedule_time,
  force_upgrade
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
RETURNING task_id, package_id, target_group, product_model, hardware_version,
          failure_threshold, state, created_at, canary_percent, schedule_time, force_upgrade
`,
		arg.TaskID,
		arg.PackageID,
		arg.TargetGroup,
		arg.ProductModel,
		arg.HardwareVersion,
		arg.FailureThreshold,
		arg.State,
		arg.CanaryPercent,
		arg.ScheduleTime,
		arg.ForceUpgrade,
	)

	var out TReleaseTask
	err := row.Scan(
		&out.TaskID,
		&out.PackageID,
		&out.TargetGroup,
		&out.ProductModel,
		&out.HardwareVersion,
		&out.FailureThreshold,
		&out.State,
		&out.CreatedAt,
		&out.CanaryPercent,
		&out.ScheduleTime,
		&out.ForceUpgrade,
	)
	return out, err
}

type ListMatchingRunningTasksNowParams struct {
	TargetGroup     string
	ProductModel    string
	HardwareVersion string
}

func (q *Queries) ListMatchingRunningTasksNow(ctx context.Context, arg ListMatchingRunningTasksNowParams) ([]TReleaseTask, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT task_id, package_id, target_group, product_model, hardware_version,
       failure_threshold, state, created_at, canary_percent, schedule_time, force_upgrade
FROM t_release_task
WHERE state = 'Running'
  AND target_group = $1
  AND product_model = $2
  AND hardware_version = $3
  AND (schedule_time IS NULL OR schedule_time <= NOW())
ORDER BY created_at DESC
`, arg.TargetGroup, arg.ProductModel, arg.HardwareVersion)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]TReleaseTask, 0, 8)
	for rows.Next() {
		var i TReleaseTask
		if err := rows.Scan(
			&i.TaskID,
			&i.PackageID,
			&i.TargetGroup,
			&i.ProductModel,
			&i.HardwareVersion,
			&i.FailureThreshold,
			&i.State,
			&i.CreatedAt,
			&i.CanaryPercent,
			&i.ScheduleTime,
			&i.ForceUpgrade,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (q *Queries) GetUpgradeRecordStatus(ctx context.Context, deviceID, taskID string) (sql.NullString, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT status
FROM t_upgrade_record
WHERE device_id = $1 AND task_id = $2
`, deviceID, taskID)
	var status sql.NullString
	err := row.Scan(&status)
	if err == sql.ErrNoRows {
		return sql.NullString{}, nil
	}
	return status, err
}
