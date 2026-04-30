package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"ota-server/backend/internal/config"
	"ota-server/backend/internal/store"
)

func registerUpgradeRecordRoutes(api *gin.RouterGroup, cfg *config.Config, q *store.Queries) {
	ams := newAMSClient(cfg)

	api.GET("/upgrade-records", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}

		limit := parsePositiveInt(c.Query("limit"), 20, 200)
		offset := parseNonNegativeInt(c.Query("offset"), 0, 1_000_000_000)

		taskID := strings.TrimSpace(c.Query("task_id"))
		deviceID := strings.TrimSpace(c.Query("device_id"))
		groupCode := strings.TrimSpace(c.Query("group"))
		packageID := strings.TrimSpace(c.Query("package_id"))
		version := strings.TrimSpace(c.Query("version"))
		status := strings.TrimSpace(c.Query("status"))
		deviceName := strings.TrimSpace(c.Query("device_name"))

		var candidateDeviceIDs []string
		if deviceName != "" {
			ids, err := amsSearchDeviceIDsByKeyword(c.Request.Context(), cfg, ams, deviceName)
			if err != nil {
				c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": err.Error()})
				return
			}
			// if search keyword returns empty, we can short-circuit
			if len(ids) == 0 {
				c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"items": []interface{}{}, "total": 0}})
				return
			}
			candidateDeviceIDs = ids
		}

		params := store.ListUpgradeRecordsParams{
			Limit:     int32(limit),
			Offset:    int32(offset),
			TaskID:    taskID,
			DeviceID:  deviceID,
			GroupCode: groupCode,
			PackageID: packageID,
			Version:   version,
			Status:    status,
			DeviceIDs: candidateDeviceIDs,
		}

		items, err := q.ListUpgradeRecords(c.Request.Context(), params)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query upgrade records failed"})
			return
		}
		total, err := q.CountUpgradeRecords(c.Request.Context(), params)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "count upgrade records failed"})
			return
		}

		// enrich device name by querying by sns (page only)
		deviceNameMap := map[string]string{}
		if len(items) > 0 {
			sns := make([]string, 0, len(items))
			seen := map[string]struct{}{}
			for _, it := range items {
				sn := strings.TrimSpace(it.DeviceID)
				if sn == "" {
					continue
				}
				if _, ok := seen[sn]; ok {
					continue
				}
				seen[sn] = struct{}{}
				sns = append(sns, sn)
			}
			if len(sns) > 0 {
				deviceNameMap = amsGetDeviceNamesBySNS(c.Request.Context(), cfg, ams, sns)
			}
		}

		out := make([]gin.H, 0, len(items))
		for _, it := range items {
			out = append(out, gin.H{
				"id":             it.ID,
				"device_name":    deviceNameMap[it.DeviceID],
				"device_id":      it.DeviceID,
				"task_id":        it.TaskID,
				"package_id":     it.PackageID,
				"product_code":   it.ProductCode,
				"version":        it.Version,
				"upgrade_time":   it.CreatedAt.Format("2006-01-02 15:04:05"),
				"status":         it.Status,
				"source_version": it.SourceVersion,
				"target_version": it.TargetVersion,
				"error_code":     it.ErrorCode,
				"group":          it.TargetGroup,
				"group_name":     it.GroupName,
			})
		}

		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"items": out, "total": total}})
	})
}

func amsSearchDeviceIDsByKeyword(ctx context.Context, cfg *config.Config, ams *amsClient, keyword string) ([]string, error) {
	base := strings.TrimSuffix(strings.TrimSpace(cfg.AMS.BaseURL), "/")
	if base == "" {
		return nil, fmt.Errorf("AMS_BASE_URL is not configured")
	}
	// try to search by keyword in AMS device list
	u, err := url.Parse(base + "/api/devices")
	if err != nil {
		return nil, fmt.Errorf("invalid AMS_BASE_URL")
	}
	q := u.Query()
	q.Set("page", "1")
	q.Set("page_size", "200")
	q.Set("keyword", strings.TrimSpace(keyword))
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("build ams request failed")
	}
	req.Header.Set("Accept", "application/json")
	if err := ams.attachAuth(ctx, req); err != nil {
		return nil, fmt.Errorf("ams auth failed")
	}
	resp, err := ams.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request ams failed")
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("ams response error: %s", resp.Status)
	}
	var payload struct {
		Items []struct {
			SN string `json:"sn"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("parse ams response failed")
	}
	out := make([]string, 0, len(payload.Items))
	for _, it := range payload.Items {
		if strings.TrimSpace(it.SN) != "" {
			out = append(out, strings.TrimSpace(it.SN))
		}
	}
	return out, nil
}

func amsGetDeviceNamesBySNS(ctx context.Context, cfg *config.Config, ams *amsClient, sns []string) map[string]string {
	out := map[string]string{}
	base := strings.TrimSuffix(strings.TrimSpace(cfg.AMS.BaseURL), "/")
	if base == "" || len(sns) == 0 {
		return out
	}
	target := base + "/api/devices/by-sns"
	reqBody, _ := json.Marshal(gin.H{"sns": sns})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(reqBody))
	if err != nil {
		return out
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if err := ams.attachAuth(ctx, req); err != nil {
		return out
	}
	resp, err := ams.http.Do(req)
	if err != nil {
		return out
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return out
	}
	var payload struct {
		Items []map[string]interface{} `json:"items"`
	}
	if json.Unmarshal(body, &payload) != nil {
		return out
	}
	for _, it := range payload.Items {
		sn, _ := it["sn"].(string)
		name, _ := it["name"].(string)
		sn = strings.TrimSpace(sn)
		name = strings.TrimSpace(name)
		if sn != "" && name != "" {
			out[sn] = name
		}
	}
	return out
}

