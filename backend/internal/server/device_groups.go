package server

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"ota-server/backend/internal/config"
	"ota-server/backend/internal/store"
)

func registerDeviceGroupRoutes(api *gin.RouterGroup, cfg *config.Config, q *store.Queries) {
	ams := newAMSClient(cfg)

	api.GET("/device-groups", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}

		limit := parsePositiveInt(c.Query("limit"), 20, 200)
		offset := parseNonNegativeInt(c.Query("offset"), 0, 1_000_000_000)
		keyword := strings.TrimSpace(c.Query("keyword"))

		platformID := parseOptionalInt32(c.Query("platform_id"))
		orgID := parseOptionalInt32(c.Query("org_id"))

		items, err := q.ListDeviceGroups(c.Request.Context(), keyword, platformID, orgID, int32(limit), int32(offset))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query device groups failed"})
			return
		}
		total, err := q.CountDeviceGroups(c.Request.Context(), keyword, platformID, orgID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "count device groups failed"})
			return
		}
		outItems := make([]deviceGroupListItemDTO, 0, len(items))
		for _, it := range items {
			outItems = append(outItems, deviceGroupListItemDTO{
				DeviceGroupDTO: toDeviceGroupDTO(it.DeviceGroup),
				DeviceCount:    it.DeviceCount,
			})
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"items": outItems, "total": total}})
	})

	api.POST("/device-groups", func(c *gin.Context) {
		operator, ok := operatorFromBearer(c.GetHeader("Authorization"), cfg)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}

		var req struct {
			GroupCode  string `json:"group_code"`
			GroupName  string `json:"group_name"`
			PlatformID *int32 `json:"platform_id"`
			OrgID      *int32 `json:"org_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
			return
		}
		code := strings.TrimSpace(req.GroupCode)
		name := strings.TrimSpace(req.GroupName)
		if code == "" || name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "group_code and group_name are required"})
			return
		}

		groupID := "grp-" + uuid.NewString()
		pf := nullInt32(req.PlatformID)
		og := nullInt32(req.OrgID)
		created, err := q.CreateDeviceGroup(c.Request.Context(), groupID, code, name, pf, og, operator)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "unique") {
				c.JSON(http.StatusConflict, gin.H{"code": 2011, "message": "group_code already exists"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "create device group failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": toDeviceGroupDTO(created)})
	})

	api.GET("/device-groups/:group_id", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}
		groupID := strings.TrimSpace(c.Param("group_id"))
		if groupID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "group_id is required"})
			return
		}
		g, err := q.GetDeviceGroup(c.Request.Context(), groupID)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"code": 2010, "message": "group not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query group failed"})
			return
		}
		count, _ := q.CountDeviceGroupMembers(c.Request.Context(), groupID)
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"group": toDeviceGroupDTO(g), "device_count": count}})
	})

	api.PATCH("/device-groups/:group_id", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}
		groupID := strings.TrimSpace(c.Param("group_id"))
		if groupID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "group_id is required"})
			return
		}

		var req struct {
			GroupCode  string `json:"group_code"`
			GroupName  string `json:"group_name"`
			PlatformID *int32 `json:"platform_id"`
			OrgID      *int32 `json:"org_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
			return
		}
		code := strings.TrimSpace(req.GroupCode)
		name := strings.TrimSpace(req.GroupName)
		if code == "" || name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "group_code and group_name are required"})
			return
		}

		updated, err := q.UpdateDeviceGroup(c.Request.Context(), groupID, code, name, nullInt32(req.PlatformID), nullInt32(req.OrgID))
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusNotFound, gin.H{"code": 2010, "message": "group not found"})
				return
			}
			if strings.Contains(strings.ToLower(err.Error()), "duplicate") || strings.Contains(strings.ToLower(err.Error()), "unique") {
				c.JSON(http.StatusConflict, gin.H{"code": 2011, "message": "group_code already exists"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "update group failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": toDeviceGroupDTO(updated)})
	})

	api.DELETE("/device-groups/:group_id", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}
		groupID := strings.TrimSpace(c.Param("group_id"))
		if groupID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "group_id is required"})
			return
		}
		if err := q.DeleteDeviceGroup(c.Request.Context(), groupID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "delete group failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"deleted": true}})
	})

	api.GET("/device-groups/:group_id/members", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}
		groupID := strings.TrimSpace(c.Param("group_id"))
		if groupID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "group_id is required"})
			return
		}
		limit := parsePositiveInt(c.Query("limit"), 50, 500)
		offset := parseNonNegativeInt(c.Query("offset"), 0, 1_000_000_000)
		sns, err := q.ListDeviceGroupMembers(c.Request.Context(), groupID, int32(limit), int32(offset))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query group members failed"})
			return
		}
		total, err := q.CountDeviceGroupMembers(c.Request.Context(), groupID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "count group members failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"sns": sns, "total": total}})
	})

	api.POST("/device-groups/:group_id/members", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}
		groupID := strings.TrimSpace(c.Param("group_id"))
		if groupID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "group_id is required"})
			return
		}
		var req struct {
			Sns []string `json:"sns"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
			return
		}
		added, err := q.AddDeviceGroupMembers(c.Request.Context(), groupID, req.Sns)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "add members failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"added": added}})
	})

	api.DELETE("/device-groups/:group_id/members", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}
		groupID := strings.TrimSpace(c.Param("group_id"))
		if groupID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "group_id is required"})
			return
		}
		var req struct {
			Sns []string `json:"sns"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
			return
		}
		removed, err := q.RemoveDeviceGroupMembers(c.Request.Context(), groupID, req.Sns)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "remove members failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"removed": removed}})
	})

	// Fetch device details for group members by calling external Python service: POST /api/devices/by-sns
	api.GET("/device-groups/:group_id/devices", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}
		groupID := strings.TrimSpace(c.Param("group_id"))
		if groupID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "group_id is required"})
			return
		}

		base := strings.TrimSuffix(strings.TrimSpace(cfg.AMS.BaseURL), "/")
		if base == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "AMS_BASE_URL is not configured"})
			return
		}

		limit := parsePositiveInt(c.Query("limit"), 50, 200)
		offset := parseNonNegativeInt(c.Query("offset"), 0, 1_000_000_000)
		sns, err := q.ListDeviceGroupMembers(c.Request.Context(), groupID, int32(limit), int32(offset))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query group members failed"})
			return
		}
		total, err := q.CountDeviceGroupMembers(c.Request.Context(), groupID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "count group members failed"})
			return
		}
		if len(sns) == 0 {
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"items": []interface{}{}, "not_found": []string{}, "total": total}})
			return
		}

		// call python service
		target := base + "/api/devices/by-sns"
		if _, err := url.Parse(target); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "invalid AMS_BASE_URL"})
			return
		}

		reqBody, _ := json.Marshal(gin.H{"sns": sns})
		req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, target, bytes.NewReader(reqBody))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "build device query request failed"})
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		// Use AMS token for calling by-sns endpoint (Python service validates AMS token)
		if err := ams.attachAuth(c.Request.Context(), req); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": err.Error()})
			return
		}

		timeout := time.Duration(cfg.AMS.TimeoutSec) * time.Second
		if timeout <= 0 {
			timeout = 8 * time.Second
		}
		client := &http.Client{Timeout: timeout}
		resp, err := client.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": "request device query service failed"})
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": fmt.Sprintf("device query service error: %s", resp.Status), "data": gin.H{"body": string(body)}})
			return
		}

		var payload map[string]interface{}
		if err := json.Unmarshal(body, &payload); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": "parse device query response failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"items": payload["items"], "not_found": payload["not_found"], "total": total}})
	})
}

func nullInt32(v *int32) sql.NullInt32 {
	if v == nil {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: *v, Valid: true}
}

func parseOptionalInt32(raw string) sql.NullInt32 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return sql.NullInt32{}
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: int32(n), Valid: true}
}

func parseNonNegativeInt(raw string, fallback, max int) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return fallback
	}
	if max > 0 && n > max {
		return max
	}
	return n
}

type deviceGroupDTO struct {
	GroupID    string `json:"group_id"`
	GroupCode  string `json:"group_code"`
	GroupName  string `json:"group_name"`
	PlatformID *int32 `json:"platform_id"`
	OrgID      *int32 `json:"org_id"`
	CreatedBy  string `json:"created_by"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

type deviceGroupListItemDTO struct {
	DeviceGroupDTO
	DeviceCount int64 `json:"device_count"`
}

type DeviceGroupDTO = deviceGroupDTO

func toDeviceGroupDTO(g store.DeviceGroup) DeviceGroupDTO {
	var platformID *int32
	if g.PlatformID.Valid {
		v := g.PlatformID.Int32
		platformID = &v
	}
	var orgID *int32
	if g.OrgID.Valid {
		v := g.OrgID.Int32
		orgID = &v
	}
	return DeviceGroupDTO{
		GroupID:    g.GroupID,
		GroupCode: g.GroupCode,
		GroupName: g.GroupName,
		PlatformID: platformID,
		OrgID:      orgID,
		CreatedBy:  g.CreatedBy,
		CreatedAt:  g.CreatedAt.Format(time.RFC3339),
		UpdatedAt:  g.UpdatedAt.Format(time.RFC3339),
	}
}

