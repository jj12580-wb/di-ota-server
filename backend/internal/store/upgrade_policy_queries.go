package store

import (
	"context"
	"database/sql"
	"strings"
	"time"
)

type UpgradePolicy struct {
	PolicyID         string
	DeviceID         string
	ProductCode      string
	ProductModel     string
	HardwareVersion  string
	DeviceGroup      string
	CurrentVersion   string
	ReportStatusMode string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	UpdatedBy        string
}

func (q *Queries) ListUpgradePolicies(ctx context.Context) ([]UpgradePolicy, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT policy_id, device_id, product_code, product_model, hardware_version,
       device_group, current_version, report_status_mode, created_at, updated_at, updated_by
FROM t_upgrade_policy
ORDER BY updated_at DESC, policy_id ASC
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]UpgradePolicy, 0, 32)
	for rows.Next() {
		var p UpgradePolicy
		if err := rows.Scan(
			&p.PolicyID, &p.DeviceID, &p.ProductCode, &p.ProductModel, &p.HardwareVersion,
			&p.DeviceGroup, &p.CurrentVersion, &p.ReportStatusMode, &p.CreatedAt, &p.UpdatedAt, &p.UpdatedBy,
		); err != nil {
			return nil, err
		}
		p.ReportStatusMode = NormalizeReportStatusMode(p.ReportStatusMode)
		out = append(out, p)
	}
	return out, rows.Err()
}

func (q *Queries) GetUpgradePolicy(ctx context.Context, policyID string) (UpgradePolicy, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT policy_id, device_id, product_code, product_model, hardware_version,
       device_group, current_version, report_status_mode, created_at, updated_at, updated_by
FROM t_upgrade_policy WHERE policy_id = $1
`, strings.TrimSpace(policyID))
	var p UpgradePolicy
	err := row.Scan(
		&p.PolicyID, &p.DeviceID, &p.ProductCode, &p.ProductModel, &p.HardwareVersion,
		&p.DeviceGroup, &p.CurrentVersion, &p.ReportStatusMode, &p.CreatedAt, &p.UpdatedAt, &p.UpdatedBy,
	)
	if err != nil {
		return UpgradePolicy{}, err
	}
	p.ReportStatusMode = NormalizeReportStatusMode(p.ReportStatusMode)
	return p, nil
}

func (q *Queries) CreateUpgradePolicy(ctx context.Context, p UpgradePolicy) (UpgradePolicy, error) {
	p = normalizeUpgradePolicy(p)
	row := q.db.QueryRowContext(ctx, `
INSERT INTO t_upgrade_policy (
  policy_id, device_id, product_code, product_model, hardware_version,
  device_group, current_version, report_status_mode, created_at, updated_at, updated_by
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),$9)
RETURNING policy_id, device_id, product_code, product_model, hardware_version,
          device_group, current_version, report_status_mode, created_at, updated_at, updated_by
`, p.PolicyID, p.DeviceID, p.ProductCode, p.ProductModel, p.HardwareVersion,
		p.DeviceGroup, p.CurrentVersion, p.ReportStatusMode, p.UpdatedBy)
	return scanUpgradePolicy(row)
}

func (q *Queries) UpdateUpgradePolicy(ctx context.Context, p UpgradePolicy) (UpgradePolicy, error) {
	p = normalizeUpgradePolicy(p)
	row := q.db.QueryRowContext(ctx, `
UPDATE t_upgrade_policy SET
  device_id = $2,
  product_code = $3,
  product_model = $4,
  hardware_version = $5,
  device_group = $6,
  current_version = $7,
  report_status_mode = $8,
  updated_at = NOW(),
  updated_by = $9
WHERE policy_id = $1
RETURNING policy_id, device_id, product_code, product_model, hardware_version,
          device_group, current_version, report_status_mode, created_at, updated_at, updated_by
`, p.PolicyID, p.DeviceID, p.ProductCode, p.ProductModel, p.HardwareVersion,
		p.DeviceGroup, p.CurrentVersion, p.ReportStatusMode, p.UpdatedBy)
	return scanUpgradePolicy(row)
}

func (q *Queries) DeleteUpgradePolicy(ctx context.Context, policyID string) error {
	res, err := q.db.ExecContext(ctx, `DELETE FROM t_upgrade_policy WHERE policy_id = $1`, strings.TrimSpace(policyID))
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func normalizeUpgradePolicy(p UpgradePolicy) UpgradePolicy {
	p.PolicyID = strings.TrimSpace(p.PolicyID)
	p.DeviceID = strings.TrimSpace(p.DeviceID)
	p.ProductCode = strings.TrimSpace(p.ProductCode)
	p.ProductModel = strings.TrimSpace(p.ProductModel)
	p.HardwareVersion = strings.TrimSpace(p.HardwareVersion)
	p.DeviceGroup = strings.TrimSpace(p.DeviceGroup)
	p.CurrentVersion = strings.TrimSpace(p.CurrentVersion)
	p.ReportStatusMode = NormalizeReportStatusMode(p.ReportStatusMode)
	p.UpdatedBy = strings.TrimSpace(p.UpdatedBy)
	return p
}

func scanUpgradePolicy(row *sql.Row) (UpgradePolicy, error) {
	var p UpgradePolicy
	err := row.Scan(
		&p.PolicyID, &p.DeviceID, &p.ProductCode, &p.ProductModel, &p.HardwareVersion,
		&p.DeviceGroup, &p.CurrentVersion, &p.ReportStatusMode, &p.CreatedAt, &p.UpdatedAt, &p.UpdatedBy,
	)
	if err != nil {
		return UpgradePolicy{}, err
	}
	p.ReportStatusMode = NormalizeReportStatusMode(p.ReportStatusMode)
	return p, nil
}

// ResolveUpgradePolicyMode picks the most specific matching policy for a device.
// Empty policy fields are wildcards. Falls back to legacy product_model policy, then relaxed.
func (q *Queries) ResolveUpgradePolicyMode(ctx context.Context, deviceID string) (string, error) {
	dev, err := q.GetDeviceRegistry(ctx, deviceID)
	if err != nil {
		if err == sql.ErrNoRows {
			return ReportStatusModeRelaxed, nil
		}
		return "", err
	}

	policies, err := q.ListUpgradePolicies(ctx)
	if err != nil {
		return "", err
	}

	currentVersion := strings.TrimSpace(dev.ReportedVersion)
	if currentVersion == "" {
		currentVersion = strings.TrimSpace(dev.CurrentVersion)
	}

	bestScore := -1
	bestMode := ""
	for _, p := range policies {
		score, ok := scoreUpgradePolicyMatch(p, dev, currentVersion)
		if !ok {
			continue
		}
		if score > bestScore {
			bestScore = score
			bestMode = p.ReportStatusMode
		}
	}
	if bestScore >= 0 {
		return NormalizeReportStatusMode(bestMode), nil
	}

	// Legacy fallback: t_product_model_policy by model only.
	return q.GetReportStatusMode(ctx, dev.ProductModel)
}

func scoreUpgradePolicyMatch(p UpgradePolicy, dev DeviceRegistry, currentVersion string) (int, bool) {
	score := 0
	match := func(policyVal, deviceVal string, weight int) bool {
		policyVal = strings.TrimSpace(policyVal)
		if policyVal == "" {
			return true
		}
		if policyVal == strings.TrimSpace(deviceVal) {
			score += weight
			return true
		}
		return false
	}

	if !match(p.DeviceID, dev.DeviceID, 100) {
		return 0, false
	}
	if !match(p.ProductCode, dev.ProductCode, 20) {
		return 0, false
	}
	if !match(p.ProductModel, dev.ProductModel, 20) {
		return 0, false
	}
	if !match(p.HardwareVersion, dev.HardwareVersion, 10) {
		return 0, false
	}
	if !match(p.DeviceGroup, dev.DeviceGroup, 10) {
		return 0, false
	}
	if !match(p.CurrentVersion, currentVersion, 10) {
		return 0, false
	}
	return score, true
}
