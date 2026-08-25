package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

type DeviceRegistry struct {
	DeviceID           string
	DeviceGroup        string
	ProductModel       string
	HardwareVersion    string
	ProductCode        string
	Tags               json.RawMessage
	CurrentVersion     string
	ReportedVersion    string
	CatalogVersion     string
	CatalogSyncedAt    sql.NullTime
	CatalogSource      string
	EligibilityState   string
	InconsistencyFlags json.RawMessage
	LastSeenAt         sql.NullTime
	LastHeartbeat      time.Time
	RegisteredAt       time.Time
	SecretProvisioned  bool
}

const deviceRegistrySelect = `
SELECT device_id, device_group, product_model, hardware_version, product_code, tags,
       current_version, reported_version, catalog_version, catalog_synced_at, catalog_source,
       eligibility_state, inconsistency_flags, last_seen_at, registered_at, last_heartbeat,
       (device_secret <> '') AS secret_provisioned
FROM t_device
`

func scanDeviceRegistry(row scanner) (DeviceRegistry, error) {
	var d DeviceRegistry
	err := row.Scan(
		&d.DeviceID,
		&d.DeviceGroup,
		&d.ProductModel,
		&d.HardwareVersion,
		&d.ProductCode,
		&d.Tags,
		&d.CurrentVersion,
		&d.ReportedVersion,
		&d.CatalogVersion,
		&d.CatalogSyncedAt,
		&d.CatalogSource,
		&d.EligibilityState,
		&d.InconsistencyFlags,
		&d.LastSeenAt,
		&d.RegisteredAt,
		&d.LastHeartbeat,
		&d.SecretProvisioned,
	)
	return d, err
}

type scanner interface {
	Scan(dest ...any) error
}

func (q *Queries) GetDeviceRegistry(ctx context.Context, deviceID string) (DeviceRegistry, error) {
	row := q.db.QueryRowContext(ctx, deviceRegistrySelect+` WHERE device_id = $1`, deviceID)
	d, err := scanDeviceRegistry(row)
	if err != nil {
		return DeviceRegistry{}, err
	}
	return d, nil
}

type DeviceAuthCredential struct {
	DeviceID         string
	DeviceSecret     string
	EligibilityState string
}

func (q *Queries) GetDeviceAuthCredential(ctx context.Context, deviceID string) (DeviceAuthCredential, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT device_id, device_secret, eligibility_state
FROM t_device WHERE device_id = $1
`, deviceID)
	var cred DeviceAuthCredential
	err := row.Scan(&cred.DeviceID, &cred.DeviceSecret, &cred.EligibilityState)
	return cred, err
}

func (q *Queries) SetDeviceSecret(ctx context.Context, deviceID, secret string) error {
	res, err := q.db.ExecContext(ctx, `
UPDATE t_device SET device_secret = $2 WHERE device_id = $1
`, deviceID, secret)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

type InsertDeviceRegistryParams struct {
	DeviceID         string
	DeviceGroup      string
	ProductModel     string
	HardwareVersion  string
	ProductCode      string
	Tags             json.RawMessage
	CatalogVersion   string
	ReportedVersion  string
	CurrentVersion   string
	CatalogSource    string
	InconsistencyFlags json.RawMessage
}

func (q *Queries) InsertDeviceRegistry(ctx context.Context, arg InsertDeviceRegistryParams) (DeviceRegistry, error) {
	row := q.db.QueryRowContext(ctx, `
INSERT INTO t_device (
  device_id, device_group, product_model, hardware_version, product_code, tags,
  current_version, reported_version, catalog_version, catalog_synced_at, catalog_source,
  eligibility_state, inconsistency_flags, last_heartbeat
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,'active',$11,NOW()
)
RETURNING device_id, device_group, product_model, hardware_version, product_code, tags,
          current_version, reported_version, catalog_version, catalog_synced_at, catalog_source,
          eligibility_state, inconsistency_flags, last_seen_at, registered_at, last_heartbeat,
          (device_secret <> '') AS secret_provisioned
`, arg.DeviceID, arg.DeviceGroup, arg.ProductModel, arg.HardwareVersion, arg.ProductCode, arg.Tags,
		arg.CurrentVersion, arg.ReportedVersion, arg.CatalogVersion, arg.CatalogSource, arg.InconsistencyFlags)
	return scanDeviceRegistry(row)
}

type UpdateDeviceRegistryParams struct {
	DeviceID           string
	DeviceGroup        string
	ProductModel       string
	HardwareVersion    string
	ProductCode        string
	Tags               json.RawMessage
	CatalogVersion     string
	ReportedVersion    string
	CurrentVersion     string
	CatalogSource      string
	InconsistencyFlags json.RawMessage
}

func (q *Queries) UpdateDeviceRegistry(ctx context.Context, arg UpdateDeviceRegistryParams) (DeviceRegistry, error) {
	row := q.db.QueryRowContext(ctx, `
UPDATE t_device SET
  device_group = $2,
  product_model = $3,
  hardware_version = $4,
  product_code = $5,
  tags = $6,
  catalog_version = $7,
  reported_version = $8,
  current_version = $9,
  catalog_synced_at = NOW(),
  catalog_source = $10,
  inconsistency_flags = $11,
  last_heartbeat = NOW()
WHERE device_id = $1
RETURNING device_id, device_group, product_model, hardware_version, product_code, tags,
          current_version, reported_version, catalog_version, catalog_synced_at, catalog_source,
          eligibility_state, inconsistency_flags, last_seen_at, registered_at, last_heartbeat,
          (device_secret <> '') AS secret_provisioned
`, arg.DeviceID, arg.DeviceGroup, arg.ProductModel, arg.HardwareVersion, arg.ProductCode, arg.Tags,
		arg.CatalogVersion, arg.ReportedVersion, arg.CurrentVersion, arg.CatalogSource, arg.InconsistencyFlags)
	return scanDeviceRegistry(row)
}

func (q *Queries) TouchDeviceReportedVersion(ctx context.Context, deviceID, reportedVersion string) error {
	_, err := q.db.ExecContext(ctx, `
UPDATE t_device SET
  reported_version = $2,
  current_version = $2,
  last_seen_at = NOW(),
  last_heartbeat = NOW()
WHERE device_id = $1
`, deviceID, reportedVersion)
	return err
}

func (q *Queries) TouchDeviceLastSeen(ctx context.Context, deviceID, reportedFromRequest string) error {
	_, err := q.db.ExecContext(ctx, `
UPDATE t_device SET
  last_seen_at = NOW(),
  last_heartbeat = NOW(),
  reported_version = CASE WHEN $2 <> '' THEN $2 ELSE reported_version END,
  current_version = CASE WHEN $2 <> '' THEN $2 ELSE current_version END
WHERE device_id = $1
`, deviceID, reportedFromRequest)
	return err
}

func (q *Queries) ListDeviceIDsForTaskSnapshot(ctx context.Context, group, productModel, hardwareVersion string) ([]string, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT device_id FROM t_device
WHERE device_group = $1 AND product_model = $2 AND hardware_version = $3
  AND eligibility_state = 'active'
`, group, productModel, hardwareVersion)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0, 64)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// ListDeviceIDsForPinnedTaskSnapshot returns the single active device when task pins target_device_id.
func (q *Queries) ListDeviceIDsForPinnedTaskSnapshot(ctx context.Context, deviceID, group, productModel, hardwareVersion string) ([]string, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT device_id FROM t_device
WHERE device_id = $1
  AND device_group = $2 AND product_model = $3 AND hardware_version = $4
  AND eligibility_state = 'active'
`, deviceID, group, productModel, hardwareVersion)
	var id string
	if err := row.Scan(&id); err != nil {
		if err == sql.ErrNoRows {
			return []string{}, nil
		}
		return nil, err
	}
	return []string{id}, nil
}

func (q *Queries) ListDeviceCatalog(ctx context.Context, limit, offset int32) ([]DeviceRegistry, error) {
	return q.ListDeviceCatalogFiltered(ctx, ListDeviceCatalogFilter{Limit: limit, Offset: offset})
}

type ListDeviceCatalogFilter struct {
	Limit              int32
	Offset             int32
	Search             string
	DeviceGroup        string
	ProductModel       string
	Tag                string
	EligibilityState   string
	AbnormalOnly       bool
}

func (q *Queries) ListDeviceCatalogFiltered(ctx context.Context, arg ListDeviceCatalogFilter) ([]DeviceRegistry, error) {
	if arg.Limit <= 0 || arg.Limit > 200 {
		arg.Limit = 20
	}
	if arg.Offset < 0 {
		arg.Offset = 0
	}
	rows, err := q.db.QueryContext(ctx, deviceRegistrySelect+deviceCatalogWhereClause+`
 ORDER BY last_heartbeat DESC LIMIT $7 OFFSET $8`,
		arg.Search, arg.DeviceGroup, arg.ProductModel, arg.Tag, arg.EligibilityState, arg.AbnormalOnly,
		arg.Limit, arg.Offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]DeviceRegistry, 0, arg.Limit)
	for rows.Next() {
		item, err := scanDeviceRegistry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (q *Queries) CountDeviceCatalogFiltered(ctx context.Context, arg ListDeviceCatalogFilter) (int64, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT COUNT(*) FROM t_device
`+deviceCatalogWhereClause,
		arg.Search, arg.DeviceGroup, arg.ProductModel, arg.Tag, arg.EligibilityState, arg.AbnormalOnly,
	)
	var count int64
	err := row.Scan(&count)
	return count, err
}

const deviceCatalogWhereClause = `
WHERE ($1 = '' OR device_id ILIKE '%' || $1 || '%'
         OR product_code ILIKE '%' || $1 || '%'
         OR product_model ILIKE '%' || $1 || '%'
         OR hardware_version ILIKE '%' || $1 || '%')
  AND ($2 = '' OR device_group = $2)
  AND ($3 = '' OR product_model = $3)
  AND ($4 = '' OR tags::text ILIKE '%' || $4 || '%')
  AND ($5 = '' OR eligibility_state = $5)
  AND ($6 = false OR (
        eligibility_state <> 'active'
        OR COALESCE(jsonb_array_length(inconsistency_flags), 0) > 0
      ))
`

func (q *Queries) InsertTaskTarget(ctx context.Context, taskID, deviceID string) error {
	_, err := q.db.ExecContext(ctx, `
INSERT INTO t_task_target (task_id, device_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING
`, taskID, deviceID)
	return err
}

func (q *Queries) DeviceInTaskTarget(ctx context.Context, taskID, deviceID string) (bool, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT 1 FROM t_task_target WHERE task_id = $1 AND device_id = $2
`, taskID, deviceID)
	var one int
	err := row.Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

func (q *Queries) ListRunningTasksForDevice(ctx context.Context, deviceID string) ([]TReleaseTask, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT t.task_id, t.package_id, t.target_group, t.product_model, t.hardware_version,
       t.failure_threshold, t.state, t.created_at, t.canary_percent, t.schedule_time, t.force_upgrade,
       COALESCE(t.target_device_id, '')
FROM t_release_task t
JOIN t_task_target tt ON tt.task_id = t.task_id AND tt.device_id = $1
WHERE t.state = 'Running'
  AND (t.schedule_time IS NULL OR t.schedule_time <= NOW())
ORDER BY t.force_upgrade DESC, t.created_at DESC
`, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]TReleaseTask, 0, 4)
	for rows.Next() {
		var i TReleaseTask
		if err := rows.Scan(
			&i.TaskID, &i.PackageID, &i.TargetGroup, &i.ProductModel, &i.HardwareVersion,
			&i.FailureThreshold, &i.State, &i.CreatedAt, &i.CanaryPercent, &i.ScheduleTime, &i.ForceUpgrade,
			&i.TargetDeviceID,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, rows.Err()
}

type CatalogSyncBatch struct {
	BatchID        string
	Source         string
	Mode           string
	AcceptedCount  int32
	WarnedCount    int32
	RejectedCount  int32
	Response       json.RawMessage
	CreatedAt      time.Time
}

func (q *Queries) GetCatalogSyncBatch(ctx context.Context, batchID string) (CatalogSyncBatch, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT batch_id, source, mode, accepted_count, warned_count, rejected_count, response, created_at
FROM t_catalog_sync_batch WHERE batch_id = $1
`, batchID)
	var b CatalogSyncBatch
	err := row.Scan(&b.BatchID, &b.Source, &b.Mode, &b.AcceptedCount, &b.WarnedCount, &b.RejectedCount, &b.Response, &b.CreatedAt)
	return b, err
}

func (q *Queries) InsertCatalogSyncBatch(ctx context.Context, b CatalogSyncBatch) error {
	_, err := q.db.ExecContext(ctx, `
INSERT INTO t_catalog_sync_batch (
  batch_id, source, mode, accepted_count, warned_count, rejected_count, response
) VALUES ($1,$2,$3,$4,$5,$6,$7)
`, b.BatchID, b.Source, b.Mode, b.AcceptedCount, b.WarnedCount, b.RejectedCount, b.Response)
	return err
}

type PendingUpgradeRow struct {
	DeviceID       string
	TaskID         string
	TargetVersion  string
	PackageID      string
	CanaryPercent  int32
	MinUpgradable  string
}

func (q *Queries) ListPendingUpgrades(ctx context.Context, deviceGroup string, limit, offset int32) ([]PendingUpgradeRow, error) {
	base := `
SELECT d.device_id, t.task_id, p.version, p.package_id, t.canary_percent, p.min_upgradable_version
FROM t_task_target tt
JOIN t_release_task t ON t.task_id = tt.task_id AND t.state = 'Running'
JOIN t_device d ON d.device_id = tt.device_id
JOIN t_package p ON p.package_id = t.package_id
LEFT JOIN t_upgrade_record ur ON ur.device_id = d.device_id AND ur.task_id = t.task_id AND ur.status = 'Success'
WHERE ur.id IS NULL
  AND (t.schedule_time IS NULL OR t.schedule_time <= NOW())
  AND d.eligibility_state = 'active'
`
	var rows *sql.Rows
	var err error
	if deviceGroup != "" {
		rows, err = q.db.QueryContext(ctx, base+`
  AND d.device_group = $1
ORDER BY t.created_at DESC, d.device_id ASC
LIMIT $2 OFFSET $3
`, deviceGroup, limit, offset)
	} else {
		rows, err = q.db.QueryContext(ctx, base+`
ORDER BY t.created_at DESC, d.device_id ASC
LIMIT $1 OFFSET $2
`, limit, offset)
	}
	if err != nil {
		return nil, fmt.Errorf("list pending upgrades: %w", err)
	}
	defer rows.Close()
	out := make([]PendingUpgradeRow, 0, limit)
	for rows.Next() {
		var r PendingUpgradeRow
		if err := rows.Scan(&r.DeviceID, &r.TaskID, &r.TargetVersion, &r.PackageID, &r.CanaryPercent, &r.MinUpgradable); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
