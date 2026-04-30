package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"ota-server/backend/internal/config"
)

type amsDevicesResponse struct {
	Items    []map[string]interface{} `json:"items"`
	Page     int                      `json:"page"`
	PageSize int                      `json:"page_size"`
	Total    int                      `json:"total"`
}

func registerAMSDeviceRoutes(api *gin.RouterGroup, cfg *config.Config) {
	client := newAMSClient(cfg)
	api.GET("/platforms", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}

		base := strings.TrimSpace(cfg.AMS.BaseURL)
		if base == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "AMS_BASE_URL is not configured"})
			return
		}
		if strings.TrimSpace(cfg.AMS.Username) == "" || strings.TrimSpace(cfg.AMS.Password) == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "AMS_USERNAME/AMS_PASSWORD are not configured"})
			return
		}

		target, err := buildAMSListURL(base, "/api/platforms")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": err.Error()})
			return
		}

		req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, target, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "build ams request failed"})
			return
		}
		req.Header.Set("Accept", "application/json")
		if err := client.attachAuth(c.Request.Context(), req); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": err.Error()})
			return
		}

		resp, err := client.http.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": "request ams failed"})
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": fmt.Sprintf("ams response error: %s", resp.Status), "data": gin.H{"body": string(body)}})
			return
		}

		var payload []map[string]interface{}
		if err := json.Unmarshal(body, &payload); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": "parse ams response failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": payload})
	})

	api.GET("/organizations", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}

		base := strings.TrimSpace(cfg.AMS.BaseURL)
		if base == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "AMS_BASE_URL is not configured"})
			return
		}
		if strings.TrimSpace(cfg.AMS.Username) == "" || strings.TrimSpace(cfg.AMS.Password) == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "AMS_USERNAME/AMS_PASSWORD are not configured"})
			return
		}

		target, err := buildAMSListURL(base, "/api/organizations")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": err.Error()})
			return
		}

		req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, target, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "build ams request failed"})
			return
		}
		req.Header.Set("Accept", "application/json")
		if err := client.attachAuth(c.Request.Context(), req); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": err.Error()})
			return
		}

		resp, err := client.http.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": "request ams failed"})
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": fmt.Sprintf("ams response error: %s", resp.Status), "data": gin.H{"body": string(body)}})
			return
		}

		var payload []map[string]interface{}
		if err := json.Unmarshal(body, &payload); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": "parse ams response failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": payload})
	})

	api.GET("/devices", func(c *gin.Context) {
		if !hasBearer(c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
			return
		}

		base := strings.TrimSpace(cfg.AMS.BaseURL)
		if base == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "AMS_BASE_URL is not configured"})
			return
		}
		if strings.TrimSpace(cfg.AMS.Username) == "" || strings.TrimSpace(cfg.AMS.Password) == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "AMS_USERNAME/AMS_PASSWORD are not configured"})
			return
		}

		page := parsePositiveInt(c.Query("page"), 1, 1_000_000)
		pageSize := parsePositiveInt(c.Query("page_size"), 10, 1_000)
		keyword := strings.TrimSpace(c.Query("keyword"))
		if keyword == "" {
			keyword = strings.TrimSpace(c.Query("search"))
		}

		platformID := parsePositiveInt(c.Query("platform_id"), 0, 1_000_000_000)
		orgID := parsePositiveInt(c.Query("org_id"), 0, 1_000_000_000)

		target, err := buildAMSDevicesURL(base, page, pageSize, keyword, platformID, orgID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": err.Error()})
			return
		}

		req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, target, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "build ams request failed"})
			return
		}
		req.Header.Set("Accept", "application/json")
		if err := client.attachAuth(c.Request.Context(), req); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": err.Error()})
			return
		}

		resp, err := client.http.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": "request ams failed"})
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": fmt.Sprintf("ams response error: %s", resp.Status), "data": gin.H{"body": string(body)}})
			return
		}

		var payload amsDevicesResponse
		if err := json.Unmarshal(body, &payload); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"code": 5000, "message": "parse ams response failed"})
			return
		}

		normalizeAMSDeviceURLs(base, payload.Items)
		c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": payload})
	})
}

type amsClient struct {
	cfg  *config.Config
	http *http.Client

	mu        sync.Mutex
	token     string
	expiresAt time.Time
}

func newAMSClient(cfg *config.Config) *amsClient {
	timeout := time.Duration(cfg.AMS.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &amsClient{
		cfg:  cfg,
		http: &http.Client{Timeout: timeout},
	}
}

func (c *amsClient) attachAuth(ctx context.Context, req *http.Request) error {
	tok, err := c.getToken(ctx)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	return nil
}

func (c *amsClient) getToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// refresh a bit earlier to avoid edge expiration
	if strings.TrimSpace(c.token) != "" && time.Until(c.expiresAt) > 30*time.Second {
		return c.token, nil
	}

	token, exp, err := c.login(ctx)
	if err != nil {
		return "", err
	}
	c.token = token
	c.expiresAt = exp
	return token, nil
}

func (c *amsClient) login(ctx context.Context) (string, time.Time, error) {
	base := strings.TrimSuffix(strings.TrimSpace(c.cfg.AMS.BaseURL), "/")
	if base == "" {
		return "", time.Time{}, fmt.Errorf("AMS_BASE_URL is not configured")
	}
	loginURL := base + "/api/auth/login"

	username := strings.TrimSpace(c.cfg.AMS.Username)
	password := strings.TrimSpace(c.cfg.AMS.Password)
	if username == "" || password == "" {
		return "", time.Time{}, fmt.Errorf("AMS_USERNAME/AMS_PASSWORD are not configured")
	}

	payload, _ := json.Marshal(gin.H{"username": username, "password": password})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, loginURL, bytes.NewReader(payload))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("build ams login request failed")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("request ams login failed")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", time.Time{}, fmt.Errorf("ams login error: %s", resp.Status)
	}

	var out struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &out); err != nil || strings.TrimSpace(out.Token) == "" {
		return "", time.Time{}, fmt.Errorf("parse ams login response failed")
	}

	exp := parseJWTExp(out.Token)
	if exp.IsZero() {
		exp = time.Now().Add(30 * time.Minute)
	}
	return out.Token, exp, nil
}

func parseJWTExp(token string) time.Time {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return time.Time{}
	}
	raw, err := decodeJWTPart(parts[1])
	if err != nil {
		return time.Time{}
	}
	var claims map[string]interface{}
	if json.Unmarshal(raw, &claims) != nil {
		return time.Time{}
	}
	expVal, ok := claims["exp"]
	if !ok {
		return time.Time{}
	}
	switch v := expVal.(type) {
	case float64:
		if v <= 0 {
			return time.Time{}
		}
		return time.Unix(int64(v), 0)
	case int64:
		return time.Unix(v, 0)
	case json.Number:
		if n, err := v.Int64(); err == nil {
			return time.Unix(n, 0)
		}
	}
	return time.Time{}
}

func decodeJWTPart(part string) ([]byte, error) {
	if strings.TrimSpace(part) == "" {
		return nil, fmt.Errorf("empty jwt part")
	}
	if b, err := base64.RawURLEncoding.DecodeString(part); err == nil {
		return b, nil
	}
	// fallback for padded inputs
	if m := len(part) % 4; m != 0 {
		part += strings.Repeat("=", 4-m)
	}
	return base64.URLEncoding.DecodeString(part)
}

func buildAMSDevicesURL(base string, page, pageSize int, keyword string, platformID, orgID int) (string, error) {
	base = strings.TrimSuffix(strings.TrimSpace(base), "/")
	if base == "" {
		return "", fmt.Errorf("invalid AMS base url")
	}
	u, err := url.Parse(base + "/api/devices")
	if err != nil {
		return "", fmt.Errorf("invalid AMS base url")
	}
	q := u.Query()
	q.Set("page", strconv.Itoa(page))
	q.Set("page_size", strconv.Itoa(pageSize))
	if strings.TrimSpace(keyword) != "" {
		q.Set("keyword", strings.TrimSpace(keyword))
	}
	if platformID > 0 {
		q.Set("platform_id", strconv.Itoa(platformID))
	}
	if orgID > 0 {
		q.Set("org_id", strconv.Itoa(orgID))
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func buildAMSListURL(base, path string) (string, error) {
	base = strings.TrimSuffix(strings.TrimSpace(base), "/")
	if base == "" {
		return "", fmt.Errorf("invalid AMS base url")
	}
	p := strings.TrimSpace(path)
	if p == "" || !strings.HasPrefix(p, "/") {
		return "", fmt.Errorf("invalid AMS path")
	}
	u, err := url.Parse(base + p)
	if err != nil {
		return "", fmt.Errorf("invalid AMS base url")
	}
	return u.String(), nil
}

func normalizeAMSDeviceURLs(base string, items []map[string]interface{}) {
	if len(items) == 0 {
		return
	}
	base = strings.TrimSuffix(strings.TrimSpace(base), "/")
	if base == "" {
		return
	}
	for _, item := range items {
		raw, ok := item["background_image_url"]
		if !ok {
			continue
		}
		s, ok := raw.(string)
		if !ok {
			continue
		}
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if strings.HasPrefix(s, "/") {
			item["background_image_url"] = base + s
		}
	}
}

func parsePositiveInt(raw string, fallback, max int) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	if max > 0 && n > max {
		return max
	}
	return n
}

