package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/sqlc-dev/pqtype"
	"ota-server/backend/internal/store"
)

func nullTimeJSON(v sql.NullTime) interface{} {
	if !v.Valid {
		return nil
	}
	return v.Time
}

func rawJSONFromNullRaw(v pqtype.NullRawMessage) interface{} {
	if !v.Valid || len(v.RawMessage) == 0 {
		return nil
	}
	var out interface{}
	if json.Unmarshal(v.RawMessage, &out) == nil {
		return out
	}
	return json.RawMessage(v.RawMessage)
}

func mapTReleaseTask(task store.TReleaseTask) gin.H {
	out := gin.H{
		"task_id":           task.TaskID,
		"package_id":        task.PackageID,
		"target_group":      task.TargetGroup,
		"product_model":     task.ProductModel,
		"hardware_version":  task.HardwareVersion,
		"failure_threshold": task.FailureThreshold,
		"state":             task.State,
		"created_at":        task.CreatedAt,
		"canary_percent":    task.CanaryPercent,
		"schedule_time":     nullTimeJSON(task.ScheduleTime),
		"force_upgrade":     task.ForceUpgrade,
	}
	if strings.TrimSpace(task.TargetDeviceID) != "" {
		out["device_id"] = task.TargetDeviceID
	}
	return out
}

func mapReleaseTaskListRows(rows []store.ListReleaseTasksRow) []gin.H {
	out := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		item := gin.H{
			"task_id":           row.TaskID,
			"package_id":        row.PackageID,
			"target_group":      row.TargetGroup,
			"product_model":     row.ProductModel,
			"hardware_version":  row.HardwareVersion,
			"failure_threshold": row.FailureThreshold,
			"state":             row.State,
			"created_at":        row.CreatedAt,
		}
		if row.ProductCode.Valid {
			item["product_code"] = row.ProductCode.String
		}
		if row.Version.Valid {
			item["version"] = row.Version.String
		}
		if row.PackageAlias != "" {
			item["package_alias"] = row.PackageAlias
		}
		out = append(out, item)
	}
	return out
}


func mapPackageFields(packageID, productCode, version, fileHash, signature, status string, createdAt interface{}, alias string) gin.H {
	return gin.H{
		"package_id":   packageID,
		"product_code": productCode,
		"version":      version,
		"file_hash":    fileHash,
		"signature":    signature,
		"status":       status,
		"created_at":   createdAt,
		"alias":        alias,
		"name":         alias,
	}
}

func mapCreatePackageRow(row store.CreatePackageRow) gin.H {
	return mapPackageFields(row.PackageID, row.ProductCode, row.Version, row.FileHash, row.Signature, row.Status, row.CreatedAt, row.Name)
}

func mapGetPackageByIDRow(row store.GetPackageByIDRow) gin.H {
	return mapPackageFields(row.PackageID, row.ProductCode, row.Version, row.FileHash, row.Signature, row.Status, row.CreatedAt, row.Name)
}

func mapListPackagesRows(rows []store.ListPackagesRow) []gin.H {
	out := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapPackageFields(row.PackageID, row.ProductCode, row.Version, row.FileHash, row.Signature, row.Status, row.CreatedAt, row.Name))
	}
	return out
}

func mapUpdatePackageStatusRow(row store.UpdatePackageStatusRow) gin.H {
	return mapPackageFields(row.PackageID, row.ProductCode, row.Version, row.FileHash, row.Signature, row.Status, row.CreatedAt, row.Name)
}

func mapUpdatePackageAliasRow(row store.UpdatePackageAliasRow) gin.H {
	return mapPackageFields(row.PackageID, row.ProductCode, row.Version, row.FileHash, row.Signature, row.Status, row.CreatedAt, row.Name)
}

func mapUserRecord(user store.UserRecord) gin.H {
	return gin.H{
		"user_id":           user.UserID,
		"username":          user.Username,
		"display_name":      user.DisplayName,
		"status":            user.Status,
		"auth_source":       user.AuthSource,
		"last_login_at":     nullTimeJSON(user.LastLoginAt),
		"last_operation_at": user.LastOperationAt,
		"created_at":        user.CreatedAt,
		"updated_at":        user.UpdatedAt,
		"roles":             user.Roles,
	}
}

func mapUserRecords(users []store.UserRecord) []gin.H {
	out := make([]gin.H, 0, len(users))
	for _, user := range users {
		out = append(out, mapUserRecord(user))
	}
	return out
}

func mapAuditLog(log store.TAuditLog) gin.H {
	return gin.H{
		"id":             log.ID,
		"trace_id":       log.TraceID,
		"operator":       log.Operator,
		"operation_type": log.OperationType,
		"resource_id":    log.ResourceID,
		"before_state":   rawJSONFromNullRaw(log.BeforeState),
		"after_state":    rawJSONFromNullRaw(log.AfterState),
		"created_at":     log.CreatedAt,
	}
}

func mapAuditLogs(logs []store.TAuditLog) []gin.H {
	out := make([]gin.H, 0, len(logs))
	for _, log := range logs {
		out = append(out, mapAuditLog(log))
	}
	return out
}

func mapDeviceRegistry(d store.DeviceRegistry) gin.H {
	displayVersion := d.ReportedVersion
	if displayVersion == "" {
		displayVersion = d.CatalogVersion
	}
	if displayVersion == "" {
		displayVersion = d.CurrentVersion
	}
	var tags interface{}
	if len(d.Tags) > 0 {
		_ = json.Unmarshal(d.Tags, &tags)
	}
	var flags interface{}
	if len(d.InconsistencyFlags) > 0 {
		_ = json.Unmarshal(d.InconsistencyFlags, &flags)
	}
	item := gin.H{
		"device_id":           d.DeviceID,
		"device_group":        d.DeviceGroup,
		"product_model":       d.ProductModel,
		"hardware_version":    d.HardwareVersion,
		"product_code":        d.ProductCode,
		"current_version":     displayVersion,
		"reported_version":    d.ReportedVersion,
		"catalog_version":     d.CatalogVersion,
		"eligibility_state":   d.EligibilityState,
		"catalog_source":      d.CatalogSource,
		"tags":                tags,
		"inconsistency_flags": flags,
		"registered_at":       d.RegisteredAt,
		"catalog_synced_at":   nullTimeJSON(d.CatalogSyncedAt),
		"last_seen_at":          nullTimeJSON(d.LastSeenAt),
		"secret_provisioned":  d.SecretProvisioned,
	}
	if !d.LastHeartbeat.IsZero() {
		item["last_heartbeat"] = d.LastHeartbeat
	}
	return item
}

func mapDeviceRegistryList(items []store.DeviceRegistry) []gin.H {
	out := make([]gin.H, 0, len(items))
	for _, item := range items {
		out = append(out, mapDeviceRegistry(item))
	}
	return out
}

func mapUpgradeRecord(record store.UpgradeRecord) gin.H {
	item := gin.H{
		"id":             record.ID,
		"device_id":      record.DeviceID,
		"task_id":        record.TaskID,
		"status":         record.Status,
		"created_at":     record.CreatedAt,
		"source_version": record.SourceVersion,
		"target_version": record.TargetVersion,
	}
	if record.ErrorCode != "" {
		item["error_code"] = record.ErrorCode
	}
	return item
}

func mapUpgradeRecords(records []store.UpgradeRecord) []gin.H {
	out := make([]gin.H, 0, len(records))
	for _, record := range records {
		out = append(out, mapUpgradeRecord(record))
	}
	return out
}

func ensureDeviceReportedVersion(ctx context.Context, q *store.Queries, deviceID, targetVersion string) {
	targetVersion = strings.TrimSpace(targetVersion)
	if targetVersion == "" {
		return
	}
	dev, err := q.GetDeviceRegistry(ctx, deviceID)
	if err != nil {
		return
	}
	current := effectiveReportedVersion(dev.ReportedVersion, dev.CatalogVersion)
	if current != "" && CompareVersion(targetVersion, current) <= 0 {
		return
	}
	_ = q.TouchDeviceReportedVersion(ctx, deviceID, targetVersion)
}
