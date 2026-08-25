package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"ota-server/backend/internal/config"
	"ota-server/backend/internal/store"
)

type reportStatusRequest struct {
	DeviceID      string `json:"device_id"`
	TaskID        string `json:"task_id"`
	Status        string `json:"status"`
	SourceVersion string `json:"source_version"`
	TargetVersion string `json:"target_version"`
	ErrorCode     string `json:"error_code"`
	ErrorMessage  string `json:"error_message"`
}

func bindJSONBody(rawBody []byte, out any) error {
	if len(rawBody) == 0 {
		return fmt.Errorf("empty body")
	}
	return json.Unmarshal(rawBody, out)
}

func handleReportStatus(c *gin.Context, cfg *config.Config, q *store.Queries, rawBody []byte) {
	var req reportStatusRequest
	if err := bindJSONBody(rawBody, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
		return
	}
	handleReportStatusRequest(c, cfg, q, req)
}

func handleReportStatusRequest(c *gin.Context, cfg *config.Config, q *store.Queries, req reportStatusRequest) {
	req.DeviceID = strings.TrimSpace(req.DeviceID)
	req.TaskID = strings.TrimSpace(req.TaskID)
	req.Status = strings.TrimSpace(req.Status)

	if req.DeviceID == "" || req.TaskID == "" || req.Status == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device_id/task_id/status are required"})
		return
	}

	normalizedStatus, ok := normalizeUpgradeStatus(req.Status)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid status"})
		return
	}

	idemKey := c.GetHeader("X-Idempotency-Key")
	if idemKey == "" {
		idemKey = fmt.Sprintf("%s:%s:%s", req.DeviceID, req.TaskID, normalizedStatus)
	}

	if existing, err := q.GetIdempotency(c.Request.Context(), idemKey); err == nil {
		var out gin.H
		if json.Unmarshal(existing.Response, &out) == nil {
			if normalizedStatus == "Success" {
				ensureDeviceReportedVersion(c.Request.Context(), q, req.DeviceID, req.TargetVersion)
			}
			c.JSON(http.StatusOK, out)
			return
		}
	}

	mode := resolveReportStatusMode(c.Request.Context(), q, req.DeviceID)

	prevStatus, err := q.GetUpgradeRecordStatus(c.Request.Context(), req.DeviceID, req.TaskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query previous status failed"})
		return
	}
	prev := prevStatus.String

	action := decideUpgradeStatusAction(prev, normalizedStatus, mode)
	switch action {
	case upgradeStatusReject:
		c.JSON(http.StatusConflict, gin.H{
			"code":    2005,
			"message": "invalid status transition",
			"data": gin.H{
				"previous": prev,
				"current":  normalizedStatus,
				"mode":     mode,
			},
		})
		return
	case upgradeStatusIgnore:
		c.JSON(http.StatusOK, gin.H{
			"code":    0,
			"message": "Status ignored",
			"data": gin.H{
				"idempotency_key": idemKey,
				"status":          prev,
				"ignored":         true,
				"reported":        normalizedStatus,
				"mode":            mode,
				"reason":          "terminal_success",
			},
		})
		return
	}

	if normalizedStatus == "Success" {
		if err := validateSuccessReport(c.Request.Context(), q, req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": err.Error()})
			return
		}
	}

	if _, err := q.UpsertUpgradeRecord(c.Request.Context(), store.UpsertUpgradeRecordParams{
		DeviceID:      req.DeviceID,
		TaskID:        req.TaskID,
		Status:        normalizedStatus,
		SourceVersion: strings.TrimSpace(req.SourceVersion),
		TargetVersion: strings.TrimSpace(req.TargetVersion),
		ErrorCode:     strings.TrimSpace(req.ErrorCode),
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "upsert upgrade record failed"})
		return
	}

	if normalizedStatus == "Success" {
		ensureDeviceReportedVersion(c.Request.Context(), q, req.DeviceID, req.TargetVersion)
	}

	if normalizedStatus == "Success" || normalizedStatus == "Failed" {
		logAlertError(UpsertUpgradeStatusAlert(c.Request.Context(), q, req.DeviceID, req.TaskID, normalizedStatus, strings.TrimSpace(req.TargetVersion)))
		EmitUpgradeWebhookAsync(cfg, req.DeviceID, req.TaskID, normalizedStatus, strings.TrimSpace(req.SourceVersion), strings.TrimSpace(req.TargetVersion))
	}

	respData := gin.H{
		"idempotency_key": idemKey,
		"status":          normalizedStatus,
		"source_version":  strings.TrimSpace(req.SourceVersion),
		"target_version":  strings.TrimSpace(req.TargetVersion),
		"error_code":      strings.TrimSpace(req.ErrorCode),
		"mode":            mode,
	}
	if msg := strings.TrimSpace(req.ErrorMessage); msg != "" {
		respData["error_message"] = msg
	}

	respObj := gin.H{"code": 0, "message": "Status received", "data": respData}
	respBytes, _ := json.Marshal(respObj)
	idem, err := q.CreateIdempotency(c.Request.Context(), store.CreateIdempotencyParams{IdemKey: idemKey, Response: respBytes})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "save idempotency failed"})
		return
	}

	var out gin.H
	if err := json.Unmarshal(idem.Response, &out); err != nil {
		c.JSON(http.StatusOK, respObj)
		return
	}
	c.JSON(http.StatusOK, out)
}

func resolveReportStatusMode(ctx context.Context, q *store.Queries, deviceID string) string {
	mode, err := q.ResolveUpgradePolicyMode(ctx, deviceID)
	if err != nil {
		return store.ReportStatusModeRelaxed
	}
	return mode
}

func validateSuccessReport(ctx context.Context, q *store.Queries, req reportStatusRequest) error {
	target := strings.TrimSpace(req.TargetVersion)
	if target == "" {
		return fmt.Errorf("target_version is required for Success")
	}
	task, err := q.GetReleaseTaskExt(ctx, req.TaskID)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("task_id not found")
		}
		return fmt.Errorf("query task failed")
	}
	pkg, err := q.GetPackageDetail(ctx, task.PackageID)
	if err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("package for task not found")
		}
		return fmt.Errorf("query package failed")
	}
	if strings.TrimSpace(pkg.Version) == "" {
		return fmt.Errorf("package version empty")
	}
	if CompareVersion(target, pkg.Version) != 0 {
		return fmt.Errorf("target_version does not match task package version")
	}
	return nil
}
