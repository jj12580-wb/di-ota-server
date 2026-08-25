package server

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"ota-server/backend/internal/config"
	"ota-server/backend/internal/store"
)

func registerProductModelPolicyRoutes(api *gin.RouterGroup, cfg *config.Config, q *store.Queries) {
	api.GET("/product-model-policies", func(c *gin.Context) {
		if _, ok := authUserFromRequest(c, cfg, q); !ok {
			return
		}
		policies, err := q.ListProductModelPolicies(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query policies failed"})
			return
		}
		models, err := q.ListProductModelsForPolicyUI(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query product models failed"})
			return
		}
		byModel := make(map[string]store.ProductModelPolicy, len(policies))
		for _, p := range policies {
			byModel[p.ProductModel] = p
		}
		items := make([]gin.H, 0, len(models))
		for _, model := range models {
			if p, ok := byModel[model]; ok {
				items = append(items, mapProductModelPolicy(p))
				continue
			}
			items = append(items, gin.H{
				"product_model":      model,
				"report_status_mode": store.ReportStatusModeRelaxed,
				"updated_at":         nil,
				"updated_by":         "",
				"explicit":           false,
			})
		}
		c.JSON(http.StatusOK, gin.H{
			"code":    0,
			"message": "ok",
			"data": gin.H{
				"default_mode": store.ReportStatusModeRelaxed,
				"policies":     items,
			},
		})
	})

	api.PUT("/product-model-policies/:product_model", func(c *gin.Context) {
		user, ok := requireRoles(c, cfg, q) // admin only
		if !ok {
			return
		}
		productModel := strings.TrimSpace(c.Param("product_model"))
		if productModel == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "product_model is required"})
			return
		}
		var req struct {
			ReportStatusMode string `json:"report_status_mode"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
			return
		}
		mode := store.NormalizeReportStatusMode(req.ReportStatusMode)
		p, err := q.UpsertProductModelPolicy(c.Request.Context(), productModel, mode, user.Username)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "save policy failed"})
			return
		}
		item := mapProductModelPolicy(p)
		item["explicit"] = true
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": item})
	})

	registerUpgradePolicyRoutes(api, cfg, q)
}

func mapProductModelPolicy(p store.ProductModelPolicy) gin.H {
	var updatedAt any
	if !p.UpdatedAt.IsZero() {
		updatedAt = p.UpdatedAt.UTC().Format(time.RFC3339Nano)
	}
	return gin.H{
		"product_model":      p.ProductModel,
		"report_status_mode": p.ReportStatusMode,
		"updated_at":         updatedAt,
		"updated_by":         p.UpdatedBy,
		"explicit":           true,
	}
}

type upgradePolicyRequest struct {
	DeviceID         string `json:"device_id"`
	ProductCode      string `json:"product_code"`
	ProductModel     string `json:"product_model"`
	HardwareVersion  string `json:"hardware_version"`
	DeviceGroup      string `json:"device_group"`
	CurrentVersion   string `json:"current_version"`
	ReportStatusMode string `json:"report_status_mode"`
}

func registerUpgradePolicyRoutes(api *gin.RouterGroup, cfg *config.Config, q *store.Queries) {
	api.GET("/upgrade-policies", func(c *gin.Context) {
		if _, ok := authUserFromRequest(c, cfg, q); !ok {
			return
		}
		policies, err := q.ListUpgradePolicies(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query upgrade policies failed"})
			return
		}
		items := make([]gin.H, 0, len(policies))
		for _, p := range policies {
			items = append(items, mapUpgradePolicy(p))
		}
		c.JSON(http.StatusOK, gin.H{
			"code":    0,
			"message": "ok",
			"data": gin.H{
				"default_mode": store.ReportStatusModeRelaxed,
				"policies":     items,
			},
		})
	})

	api.POST("/upgrade-policies", func(c *gin.Context) {
		user, ok := requireRoles(c, cfg, q)
		if !ok {
			return
		}
		var req upgradePolicyRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
			return
		}
		p, err := buildUpgradePolicyFromRequest(c, q, req, "policy-"+uuid.NewString(), user.Username)
		if err != nil {
			status := http.StatusBadRequest
			msg := err.Error()
			if errors.Is(err, sql.ErrNoRows) {
				status = http.StatusNotFound
				msg = "device not found"
			}
			c.JSON(status, gin.H{"code": 1002, "message": msg})
			return
		}
		created, err := q.CreateUpgradePolicy(c.Request.Context(), p)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "create upgrade policy failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapUpgradePolicy(created)})
	})

	api.PUT("/upgrade-policies/:policy_id", func(c *gin.Context) {
		user, ok := requireRoles(c, cfg, q)
		if !ok {
			return
		}
		policyID := strings.TrimSpace(c.Param("policy_id"))
		if policyID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "policy_id is required"})
			return
		}
		var req upgradePolicyRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
			return
		}
		p, err := buildUpgradePolicyFromRequest(c, q, req, policyID, user.Username)
		if err != nil {
			status := http.StatusBadRequest
			msg := err.Error()
			if errors.Is(err, sql.ErrNoRows) {
				status = http.StatusNotFound
				msg = "device not found"
			}
			c.JSON(status, gin.H{"code": 1002, "message": msg})
			return
		}
		updated, err := q.UpdateUpgradePolicy(c.Request.Context(), p)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"code": 2004, "message": "policy not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "update upgrade policy failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapUpgradePolicy(updated)})
	})

	api.DELETE("/upgrade-policies/:policy_id", func(c *gin.Context) {
		if _, ok := requireRoles(c, cfg, q); !ok {
			return
		}
		policyID := strings.TrimSpace(c.Param("policy_id"))
		if policyID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "policy_id is required"})
			return
		}
		if err := q.DeleteUpgradePolicy(c.Request.Context(), policyID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(http.StatusNotFound, gin.H{"code": 2004, "message": "policy not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "delete upgrade policy failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok"})
	})
}

func buildUpgradePolicyFromRequest(c *gin.Context, q *store.Queries, req upgradePolicyRequest, policyID, updatedBy string) (store.UpgradePolicy, error) {
	p := store.UpgradePolicy{
		PolicyID:         policyID,
		DeviceID:         strings.TrimSpace(req.DeviceID),
		ProductCode:      strings.TrimSpace(req.ProductCode),
		ProductModel:     strings.TrimSpace(req.ProductModel),
		HardwareVersion:  strings.TrimSpace(req.HardwareVersion),
		DeviceGroup:      strings.TrimSpace(req.DeviceGroup),
		CurrentVersion:   strings.TrimSpace(req.CurrentVersion),
		ReportStatusMode: store.NormalizeReportStatusMode(req.ReportStatusMode),
		UpdatedBy:        updatedBy,
	}

	// device_id 填写时，从设备档案自动补齐其它匹配字段（请求里已有非空值则保留）
	if p.DeviceID != "" {
		dev, err := q.GetDeviceRegistry(c.Request.Context(), p.DeviceID)
		if err != nil {
			return store.UpgradePolicy{}, err
		}
		if p.ProductCode == "" {
			p.ProductCode = strings.TrimSpace(dev.ProductCode)
		}
		if p.ProductModel == "" {
			p.ProductModel = strings.TrimSpace(dev.ProductModel)
		}
		if p.HardwareVersion == "" {
			p.HardwareVersion = strings.TrimSpace(dev.HardwareVersion)
		}
		if p.DeviceGroup == "" {
			p.DeviceGroup = strings.TrimSpace(dev.DeviceGroup)
		}
		if p.CurrentVersion == "" {
			cur := strings.TrimSpace(dev.ReportedVersion)
			if cur == "" {
				cur = strings.TrimSpace(dev.CurrentVersion)
			}
			p.CurrentVersion = cur
		}
	}
	return p, nil
}

func mapUpgradePolicy(p store.UpgradePolicy) gin.H {
	var createdAt, updatedAt any
	if !p.CreatedAt.IsZero() {
		createdAt = p.CreatedAt.UTC().Format(time.RFC3339Nano)
	}
	if !p.UpdatedAt.IsZero() {
		updatedAt = p.UpdatedAt.UTC().Format(time.RFC3339Nano)
	}
	return gin.H{
		"policy_id":          p.PolicyID,
		"device_id":          p.DeviceID,
		"product_code":       p.ProductCode,
		"product_model":      p.ProductModel,
		"hardware_version":   p.HardwareVersion,
		"device_group":       p.DeviceGroup,
		"current_version":    p.CurrentVersion,
		"report_status_mode": p.ReportStatusMode,
		"created_at":         createdAt,
		"updated_at":         updatedAt,
		"updated_by":         p.UpdatedBy,
	}
}
