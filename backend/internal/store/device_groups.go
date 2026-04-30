package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

type DeviceGroup struct {
	GroupID   string         `json:"group_id"`
	GroupCode string         `json:"group_code"`
	GroupName string         `json:"group_name"`
	PlatformID sql.NullInt32 `json:"platform_id"`
	OrgID      sql.NullInt32 `json:"org_id"`
	CreatedBy  string         `json:"created_by"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
}

type DeviceGroupListItem struct {
	DeviceGroup
	DeviceCount int64 `json:"device_count"`
}

func (q *Queries) CreateDeviceGroup(ctx context.Context, groupID, code, name string, platformID, orgID sql.NullInt32, createdBy string) (DeviceGroup, error) {
	row := q.db.QueryRowContext(ctx, `
INSERT INTO t_device_group (
  group_id, group_code, group_name, platform_id, org_id, created_by
) VALUES (
  $1, $2, $3, $4, $5, $6
)
RETURNING group_id, group_code, group_name, platform_id, org_id, created_by, created_at, updated_at
`, groupID, strings.TrimSpace(code), strings.TrimSpace(name), platformID, orgID, strings.TrimSpace(createdBy))

	var out DeviceGroup
	if err := row.Scan(&out.GroupID, &out.GroupCode, &out.GroupName, &out.PlatformID, &out.OrgID, &out.CreatedBy, &out.CreatedAt, &out.UpdatedAt); err != nil {
		return DeviceGroup{}, err
	}
	return out, nil
}

func (q *Queries) GetDeviceGroup(ctx context.Context, groupID string) (DeviceGroup, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT group_id, group_code, group_name, platform_id, org_id, created_by, created_at, updated_at
FROM t_device_group
WHERE group_id = $1
`, strings.TrimSpace(groupID))
	var out DeviceGroup
	err := row.Scan(&out.GroupID, &out.GroupCode, &out.GroupName, &out.PlatformID, &out.OrgID, &out.CreatedBy, &out.CreatedAt, &out.UpdatedAt)
	return out, err
}

func (q *Queries) GetDeviceGroupByCode(ctx context.Context, code string) (DeviceGroup, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT group_id, group_code, group_name, platform_id, org_id, created_by, created_at, updated_at
FROM t_device_group
WHERE group_code = $1
`, strings.TrimSpace(code))
	var out DeviceGroup
	err := row.Scan(&out.GroupID, &out.GroupCode, &out.GroupName, &out.PlatformID, &out.OrgID, &out.CreatedBy, &out.CreatedAt, &out.UpdatedAt)
	return out, err
}

func (q *Queries) UpdateDeviceGroup(ctx context.Context, groupID, code, name string, platformID, orgID sql.NullInt32) (DeviceGroup, error) {
	row := q.db.QueryRowContext(ctx, `
UPDATE t_device_group
SET group_code = $2,
    group_name = $3,
    platform_id = $4,
    org_id = $5,
    updated_at = NOW()
WHERE group_id = $1
RETURNING group_id, group_code, group_name, platform_id, org_id, created_by, created_at, updated_at
`, strings.TrimSpace(groupID), strings.TrimSpace(code), strings.TrimSpace(name), platformID, orgID)
	var out DeviceGroup
	err := row.Scan(&out.GroupID, &out.GroupCode, &out.GroupName, &out.PlatformID, &out.OrgID, &out.CreatedBy, &out.CreatedAt, &out.UpdatedAt)
	return out, err
}

func (q *Queries) DeleteDeviceGroup(ctx context.Context, groupID string) error {
	_, err := q.db.ExecContext(ctx, `DELETE FROM t_device_group WHERE group_id = $1`, strings.TrimSpace(groupID))
	return err
}

func (q *Queries) CountDeviceGroups(ctx context.Context, keyword string, platformID, orgID sql.NullInt32) (int64, error) {
	kw := strings.TrimSpace(keyword)
	args := []interface{}{}
	where := []string{"1=1"}
	if kw != "" {
		args = append(args, "%"+kw+"%")
		where = append(where, fmt.Sprintf("(group_code ILIKE $%d OR group_name ILIKE $%d)", len(args), len(args)))
	}
	if platformID.Valid {
		args = append(args, platformID.Int32)
		where = append(where, fmt.Sprintf("platform_id = $%d", len(args)))
	}
	if orgID.Valid {
		args = append(args, orgID.Int32)
		where = append(where, fmt.Sprintf("org_id = $%d", len(args)))
	}

	query := "SELECT COUNT(*) FROM t_device_group WHERE " + strings.Join(where, " AND ")
	row := q.db.QueryRowContext(ctx, query, args...)
	var out int64
	return out, row.Scan(&out)
}

func (q *Queries) ListDeviceGroups(ctx context.Context, keyword string, platformID, orgID sql.NullInt32, limit, offset int32) ([]DeviceGroupListItem, error) {
	kw := strings.TrimSpace(keyword)
	args := []interface{}{limit, offset}
	where := []string{"1=1"}
	if kw != "" {
		args = append(args, "%"+kw+"%")
		where = append(where, fmt.Sprintf("(g.group_code ILIKE $%d OR g.group_name ILIKE $%d)", len(args), len(args)))
	}
	if platformID.Valid {
		args = append(args, platformID.Int32)
		where = append(where, fmt.Sprintf("g.platform_id = $%d", len(args)))
	}
	if orgID.Valid {
		args = append(args, orgID.Int32)
		where = append(where, fmt.Sprintf("g.org_id = $%d", len(args)))
	}

	query := `
SELECT g.group_id, g.group_code, g.group_name, g.platform_id, g.org_id,
       g.created_by, g.created_at, g.updated_at,
       COALESCE(m.cnt, 0) AS device_count
FROM t_device_group g
LEFT JOIN (
  SELECT group_id, COUNT(*) AS cnt
  FROM t_device_group_member
  GROUP BY group_id
) m ON m.group_id = g.group_id
WHERE ` + strings.Join(where, " AND ") + `
ORDER BY g.updated_at DESC
LIMIT $1 OFFSET $2
`

	rows, err := q.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]DeviceGroupListItem, 0, 16)
	for rows.Next() {
		var i DeviceGroupListItem
		if err := rows.Scan(
			&i.GroupID, &i.GroupCode, &i.GroupName, &i.PlatformID, &i.OrgID,
			&i.CreatedBy, &i.CreatedAt, &i.UpdatedAt, &i.DeviceCount,
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

func (q *Queries) ListDeviceGroupMembers(ctx context.Context, groupID string, limit, offset int32) ([]string, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT sn
FROM t_device_group_member
WHERE group_id = $1
ORDER BY sn ASC
LIMIT $2 OFFSET $3
`, strings.TrimSpace(groupID), limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0, limit)
	for rows.Next() {
		var sn string
		if err := rows.Scan(&sn); err != nil {
			return nil, err
		}
		out = append(out, sn)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (q *Queries) CountDeviceGroupMembers(ctx context.Context, groupID string) (int64, error) {
	row := q.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM t_device_group_member WHERE group_id = $1`, strings.TrimSpace(groupID))
	var out int64
	return out, row.Scan(&out)
}

func (q *Queries) AddDeviceGroupMembers(ctx context.Context, groupID string, sns []string) (int64, error) {
	if len(sns) == 0 {
		return 0, nil
	}

	unique := make(map[string]struct{}, len(sns))
	out := make([]string, 0, len(sns))
	for _, sn := range sns {
		sn = strings.TrimSpace(sn)
		if sn == "" {
			continue
		}
		if _, ok := unique[sn]; ok {
			continue
		}
		unique[sn] = struct{}{}
		out = append(out, sn)
	}
	if len(out) == 0 {
		return 0, nil
	}

	res, err := q.db.ExecContext(ctx, `
INSERT INTO t_device_group_member (group_id, sn)
SELECT $1, sn
FROM UNNEST($2::text[]) AS sn
ON CONFLICT (group_id, sn) DO NOTHING
`, strings.TrimSpace(groupID), out)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

func (q *Queries) RemoveDeviceGroupMembers(ctx context.Context, groupID string, sns []string) (int64, error) {
	if len(sns) == 0 {
		return 0, nil
	}

	unique := make(map[string]struct{}, len(sns))
	out := make([]string, 0, len(sns))
	for _, sn := range sns {
		sn = strings.TrimSpace(sn)
		if sn == "" {
			continue
		}
		if _, ok := unique[sn]; ok {
			continue
		}
		unique[sn] = struct{}{}
		out = append(out, sn)
	}
	if len(out) == 0 {
		return 0, nil
	}

	res, err := q.db.ExecContext(ctx, `
DELETE FROM t_device_group_member
WHERE group_id = $1 AND sn = ANY($2::text[])
`, strings.TrimSpace(groupID), out)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

