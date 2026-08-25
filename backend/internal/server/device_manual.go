package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"ota-server/backend/internal/store"
)

type deviceManualRequest struct {
	DeviceID        string          `json:"device_id"`
	ProductCode     string          `json:"product_code"`
	ProductModel    string          `json:"product_model"`
	HardwareVersion string          `json:"hardware_version"`
	CurrentVersion  string          `json:"current_version"`
	DeviceGroup     string          `json:"device_group"`
	Tags            json.RawMessage `json:"tags"`
}

func normalizeDeviceTags(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "" || strings.TrimSpace(string(raw)) == "null" {
		return json.RawMessage(`{}`), nil
	}
	var v interface{}
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, err
	}
	out, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func parseDeviceManualRequest(c *gin.Context, requireDeviceID bool) (deviceManualRequest, bool) {
	var req deviceManualRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request body"})
		return req, false
	}
	req.DeviceID = strings.TrimSpace(req.DeviceID)
	req.ProductCode = strings.TrimSpace(req.ProductCode)
	req.ProductModel = strings.TrimSpace(req.ProductModel)
	req.HardwareVersion = strings.TrimSpace(req.HardwareVersion)
	req.CurrentVersion = strings.TrimSpace(req.CurrentVersion)
	req.DeviceGroup = strings.TrimSpace(req.DeviceGroup)

	if requireDeviceID && req.DeviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device_id is required"})
		return req, false
	}
	if req.ProductModel == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "product_model is required"})
		return req, false
	}
	if req.HardwareVersion == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "hardware_version is required"})
		return req, false
	}

	tags, err := normalizeDeviceTags(req.Tags)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "tags must be valid JSON"})
		return req, false
	}
	req.Tags = tags
	return req, true
}

func createDeviceManual(c *gin.Context, q *store.Queries) {
	if !hasBearer(c.GetHeader("Authorization")) {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
		return
	}
	req, ok := parseDeviceManualRequest(c, true)
	if !ok {
		return
	}

	if _, err := q.GetDeviceRegistry(c.Request.Context(), req.DeviceID); err == nil {
		c.JSON(http.StatusConflict, gin.H{"code": 2005, "message": "device already exists"})
		return
	} else if err != sql.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query device failed"})
		return
	}

	_, reject, err := applyCatalogDevice(c.Request.Context(), q, "manual", CatalogSyncOptions{}, CatalogDeviceInput{
		DeviceID:        req.DeviceID,
		ProductCode:     req.ProductCode,
		ProductModel:    req.ProductModel,
		HardwareVersion: req.HardwareVersion,
		CurrentVersion:  req.CurrentVersion,
		DeviceGroup:     req.DeviceGroup,
		Tags:            req.Tags,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "create device failed"})
		return
	}
	if reject != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": reject.Message})
		return
	}

	device, err := q.GetDeviceRegistry(c.Request.Context(), req.DeviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "load device failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapDeviceRegistry(device)})
}

func updateDeviceManual(c *gin.Context, q *store.Queries) {
	if !hasBearer(c.GetHeader("Authorization")) {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
		return
	}
	deviceID := strings.TrimSpace(c.Param("device_id"))
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device_id is required"})
		return
	}

	req, ok := parseDeviceManualRequest(c, false)
	if !ok {
		return
	}
	req.DeviceID = deviceID

	if _, err := q.GetDeviceRegistry(c.Request.Context(), deviceID); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"code": 2004, "message": "device not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query device failed"})
		return
	}

	_, reject, err := applyCatalogDevice(
		c.Request.Context(),
		q,
		"manual",
		CatalogSyncOptions{VersionPolicy: "trust_catalog"},
		CatalogDeviceInput{
			DeviceID:            req.DeviceID,
			ProductCode:         req.ProductCode,
			ProductModel:        req.ProductModel,
			HardwareVersion:     req.HardwareVersion,
			CurrentVersion:      req.CurrentVersion,
			DeviceGroup:         req.DeviceGroup,
			Tags:                req.Tags,
			ForceIdentityUpdate: true,
			ForceCatalogVersion: true,
		},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "update device failed"})
		return
	}
	if reject != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": reject.Message})
		return
	}

	device, err := q.GetDeviceRegistry(c.Request.Context(), deviceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "load device failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapDeviceRegistry(device)})
}
