package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"ota-server/backend/internal/store"
)

type CatalogSyncOptions struct {
	VersionPolicy      string
	OnIdentityChange   string
	StaleBatchBefore   *time.Time
}

type CatalogDeviceInput struct {
	DeviceID            string
	ProductCode         string
	ProductModel        string
	HardwareVersion     string
	CurrentVersion      string
	DeviceGroup         string
	Tags                json.RawMessage
	UpdatedAt           *time.Time
	ForceIdentityUpdate bool
	ForceCatalogVersion bool
}

type CatalogSyncWarning struct {
	DeviceID         string `json:"device_id"`
	Code             string `json:"code"`
	Message          string `json:"message"`
	CatalogVersion   string `json:"catalog_version,omitempty"`
	ReportedVersion  string `json:"reported_version,omitempty"`
}

type CatalogSyncReject struct {
	Index    int    `json:"index"`
	DeviceID string `json:"device_id,omitempty"`
	Code     string `json:"code"`
	Message  string `json:"message"`
}

type CatalogSyncResult struct {
	Accepted     int                  `json:"accepted"`
	Warned       int                  `json:"warned"`
	Rejected     int                  `json:"rejected"`
	WarningRows  []CatalogSyncWarning `json:"warning_rows"`
	RejectedRows []CatalogSyncReject  `json:"rejected_rows"`
}

func defaultCatalogSyncOptions(opts CatalogSyncOptions) CatalogSyncOptions {
	if strings.TrimSpace(opts.VersionPolicy) == "" {
		opts.VersionPolicy = "preserve_device_reported"
	}
	if strings.TrimSpace(opts.OnIdentityChange) == "" {
		opts.OnIdentityChange = "require_force_flag"
	}
	return opts
}

func applyCatalogDevice(ctx context.Context, q *store.Queries, source string, opts CatalogSyncOptions, in CatalogDeviceInput) (CatalogSyncWarning, *CatalogSyncReject, error) {
	opts = defaultCatalogSyncOptions(opts)
	catalogVer := strings.TrimSpace(in.CurrentVersion)

	existing, err := q.GetDeviceRegistry(ctx, in.DeviceID)
	if err == sql.ErrNoRows {
		display := catalogVer
		row, err := q.InsertDeviceRegistry(ctx, store.InsertDeviceRegistryParams{
			DeviceID:           in.DeviceID,
			DeviceGroup:        in.DeviceGroup,
			ProductModel:       in.ProductModel,
			HardwareVersion:    in.HardwareVersion,
			ProductCode:        in.ProductCode,
			Tags:               in.Tags,
			CatalogVersion:     catalogVer,
			ReportedVersion:    "",
			CurrentVersion:     display,
			CatalogSource:      source,
			InconsistencyFlags: json.RawMessage(`[]`),
		})
		if err != nil {
			return CatalogSyncWarning{}, &CatalogSyncReject{DeviceID: in.DeviceID, Code: "invalid_field", Message: err.Error()}, err
		}
		_ = row
		return CatalogSyncWarning{}, nil, nil
	}
	if err != nil {
		return CatalogSyncWarning{}, nil, err
	}

	if existing.EligibilityState == "blocked" {
		return CatalogSyncWarning{}, &CatalogSyncReject{
			DeviceID: in.DeviceID,
			Code:     "device_blocked",
			Message:  "device is blocked",
		}, nil
	}

	if in.UpdatedAt != nil && existing.CatalogSyncedAt.Valid && in.UpdatedAt.Before(existing.CatalogSyncedAt.Time) {
		return CatalogSyncWarning{
			DeviceID: in.DeviceID,
			Code:     "stale_device_record",
			Message:  "row updated_at is older than catalog_synced_at",
		}, nil, nil
	}

	if opts.OnIdentityChange == "require_force_flag" {
		if existing.ProductModel != in.ProductModel || existing.HardwareVersion != in.HardwareVersion {
			if !in.ForceIdentityUpdate {
				return CatalogSyncWarning{}, &CatalogSyncReject{
					DeviceID: in.DeviceID,
					Code:     "identity_change_rejected",
					Message:  "product_model/hardware_version changed; set force_identity_update=true",
				}, nil
			}
		}
	}

	reported := strings.TrimSpace(existing.ReportedVersion)
	newReported := reported
	flags := parseFlags(existing.InconsistencyFlags)
	var warn CatalogSyncWarning

	switch {
	case catalogVer == "":
		// keep catalog as-is
	case opts.VersionPolicy == "trust_catalog" && in.ForceCatalogVersion:
		newReported = catalogVer
		flags = removeFlag(flags, "version_rollback_ignored")
		flags = removeFlag(flags, "version_ahead_of_device")
	case CompareVersion(catalogVer, reported) < 0 && reported != "":
		flags = addFlag(flags, "version_rollback_ignored")
		warn = CatalogSyncWarning{
			DeviceID:        in.DeviceID,
			Code:            "version_rollback_ignored",
			Message:         "catalog lower than reported; reported preserved",
			CatalogVersion:  catalogVer,
			ReportedVersion: reported,
		}
	case CompareVersion(catalogVer, reported) > 0 && reported != "":
		flags = addFlag(flags, "version_ahead_of_device")
		warn = CatalogSyncWarning{
			DeviceID:        in.DeviceID,
			Code:            "version_ahead_of_device",
			Message:         "catalog ahead of reported; waiting for device confirmation",
			CatalogVersion:  catalogVer,
			ReportedVersion: reported,
		}
	}

	if existing.DeviceGroup != in.DeviceGroup {
		flags = addFlag(flags, "identity_changed")
		if warn.Code == "" {
			warn = CatalogSyncWarning{DeviceID: in.DeviceID, Code: "identity_changed", Message: "device_group changed"}
		}
	}
	if in.ForceIdentityUpdate && (existing.ProductModel != in.ProductModel || existing.HardwareVersion != in.HardwareVersion) {
		flags = addFlag(flags, "identity_change_applied")
	}

	displayVersion := newReported
	if displayVersion == "" {
		displayVersion = catalogVer
	}

	flagsJSON, _ := json.Marshal(flags)
	_, err = q.UpdateDeviceRegistry(ctx, store.UpdateDeviceRegistryParams{
		DeviceID:           in.DeviceID,
		DeviceGroup:        in.DeviceGroup,
		ProductModel:       in.ProductModel,
		HardwareVersion:    in.HardwareVersion,
		ProductCode:        in.ProductCode,
		Tags:               in.Tags,
		CatalogVersion:     catalogVer,
		ReportedVersion:    newReported,
		CurrentVersion:     displayVersion,
		CatalogSource:      source,
		InconsistencyFlags: flagsJSON,
	})
	if err != nil {
		return CatalogSyncWarning{}, nil, err
	}
	return warn, nil, nil
}

func parseFlags(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var flags []string
	_ = json.Unmarshal(raw, &flags)
	return flags
}

func addFlag(flags []string, code string) []string {
	for _, f := range flags {
		if f == code {
			return flags
		}
	}
	return append(flags, code)
}

func removeFlag(flags []string, code string) []string {
	out := make([]string, 0, len(flags))
	for _, f := range flags {
		if f != code {
			out = append(out, f)
		}
	}
	return out
}

func buildTaskSnapshot(ctx context.Context, q *store.Queries, task store.TReleaseTask) (int, error) {
	var (
		ids []string
		err error
	)
	if strings.TrimSpace(task.TargetDeviceID) != "" {
		ids, err = q.ListDeviceIDsForPinnedTaskSnapshot(
			ctx,
			strings.TrimSpace(task.TargetDeviceID),
			task.TargetGroup,
			task.ProductModel,
			task.HardwareVersion,
		)
	} else {
		ids, err = q.ListDeviceIDsForTaskSnapshot(ctx, task.TargetGroup, task.ProductModel, task.HardwareVersion)
	}
	if err != nil {
		return 0, err
	}
	for _, id := range ids {
		if err := q.InsertTaskTarget(ctx, task.TaskID, id); err != nil {
			return 0, err
		}
	}
	return len(ids), nil
}
