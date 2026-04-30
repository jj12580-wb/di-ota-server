package store

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type UpgradeRecordListItem struct {
	ID            int64     `json:"id"`
	DeviceID      string    `json:"device_id"`
	TaskID        string    `json:"task_id"`
	PackageID     string    `json:"package_id"`
	TargetGroup   string    `json:"target_group"`
	ProductCode   string    `json:"product_code"`
	Version       string    `json:"version"`
	Status        string    `json:"status"`
	SourceVersion string    `json:"source_version"`
	TargetVersion string    `json:"target_version"`
	ErrorCode     string    `json:"error_code"`
	CreatedAt     time.Time `json:"created_at"`
	GroupName     string    `json:"group_name"`
}

type ListUpgradeRecordsParams struct {
	Limit     int32
	Offset    int32
	TaskID    string
	DeviceID  string
	GroupCode string
	PackageID string
	Version   string
	Status    string

	// Optional: if provided, filter device_id IN (sns...)
	DeviceIDs []string
}

func (q *Queries) ListUpgradeRecords(ctx context.Context, arg ListUpgradeRecordsParams) ([]UpgradeRecordListItem, error) {
	where := []string{"1=1"}
	args := []interface{}{arg.Limit, arg.Offset}

	if v := strings.TrimSpace(arg.TaskID); v != "" {
		args = append(args, v)
		where = append(where, fmt.Sprintf("ur.task_id = $%d", len(args)))
	}
	if v := strings.TrimSpace(arg.DeviceID); v != "" {
		args = append(args, "%"+v+"%")
		where = append(where, fmt.Sprintf("ur.device_id ILIKE $%d", len(args)))
	}
	if v := strings.TrimSpace(arg.GroupCode); v != "" {
		args = append(args, v)
		where = append(where, fmt.Sprintf("rt.target_group = $%d", len(args)))
	}
	if v := strings.TrimSpace(arg.PackageID); v != "" {
		args = append(args, v)
		where = append(where, fmt.Sprintf("rt.package_id = $%d", len(args)))
	}
	if v := strings.TrimSpace(arg.Version); v != "" {
		args = append(args, v)
		where = append(where, fmt.Sprintf("p.version = $%d", len(args)))
	}
	if v := strings.TrimSpace(arg.Status); v != "" {
		args = append(args, v)
		where = append(where, fmt.Sprintf("ur.status = $%d", len(args)))
	}
	if len(arg.DeviceIDs) > 0 {
		args = append(args, arg.DeviceIDs)
		where = append(where, fmt.Sprintf("ur.device_id = ANY($%d::text[])", len(args)))
	}

	query := `
SELECT ur.id, ur.device_id, ur.task_id, rt.package_id, rt.target_group,
       p.product_code, p.version,
       ur.status, ur.source_version, ur.target_version, ur.error_code, ur.created_at,
       COALESCE(g.group_name, '') AS group_name
FROM t_upgrade_record ur
LEFT JOIN t_release_task rt ON rt.task_id = ur.task_id
LEFT JOIN t_package p ON p.package_id = rt.package_id
LEFT JOIN t_device_group g ON g.group_code = rt.target_group
WHERE ` + strings.Join(where, " AND ") + `
ORDER BY ur.created_at DESC
LIMIT $1 OFFSET $2
`

	rows, err := q.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]UpgradeRecordListItem, 0, arg.Limit)
	for rows.Next() {
		var i UpgradeRecordListItem
		if err := rows.Scan(
			&i.ID, &i.DeviceID, &i.TaskID, &i.PackageID, &i.TargetGroup,
			&i.ProductCode, &i.Version,
			&i.Status, &i.SourceVersion, &i.TargetVersion, &i.ErrorCode, &i.CreatedAt,
			&i.GroupName,
		); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (q *Queries) CountUpgradeRecords(ctx context.Context, arg ListUpgradeRecordsParams) (int64, error) {
	where := []string{"1=1"}
	args := []interface{}{}

	if v := strings.TrimSpace(arg.TaskID); v != "" {
		args = append(args, v)
		where = append(where, fmt.Sprintf("ur.task_id = $%d", len(args)))
	}
	if v := strings.TrimSpace(arg.DeviceID); v != "" {
		args = append(args, "%"+v+"%")
		where = append(where, fmt.Sprintf("ur.device_id ILIKE $%d", len(args)))
	}
	if v := strings.TrimSpace(arg.GroupCode); v != "" {
		args = append(args, v)
		where = append(where, fmt.Sprintf("rt.target_group = $%d", len(args)))
	}
	if v := strings.TrimSpace(arg.PackageID); v != "" {
		args = append(args, v)
		where = append(where, fmt.Sprintf("rt.package_id = $%d", len(args)))
	}
	if v := strings.TrimSpace(arg.Version); v != "" {
		args = append(args, v)
		where = append(where, fmt.Sprintf("p.version = $%d", len(args)))
	}
	if v := strings.TrimSpace(arg.Status); v != "" {
		args = append(args, v)
		where = append(where, fmt.Sprintf("ur.status = $%d", len(args)))
	}
	if len(arg.DeviceIDs) > 0 {
		args = append(args, arg.DeviceIDs)
		where = append(where, fmt.Sprintf("ur.device_id = ANY($%d::text[])", len(args)))
	}

	query := `
SELECT COUNT(*)
FROM t_upgrade_record ur
LEFT JOIN t_release_task rt ON rt.task_id = ur.task_id
LEFT JOIN t_package p ON p.package_id = rt.package_id
WHERE ` + strings.Join(where, " AND ") + `
`

	row := q.db.QueryRowContext(ctx, query, args...)
	var out int64
	return out, row.Scan(&out)
}

