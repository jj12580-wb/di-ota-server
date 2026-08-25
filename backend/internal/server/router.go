package server

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	minioCreds "github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/sqlc-dev/pqtype"
	"golang.org/x/crypto/bcrypt"
	"ota-server/backend/internal/config"
	"ota-server/backend/internal/store"
)

var allowedUserRoles = map[string]struct{}{
	"admin":        {},
	"secret_admin": {},
	"release":      {},
	"readonly":     {},
	"audit":        {},
}

var taskStateTransition = map[string]map[string]string{
	"start": {
		"Draft": "Running",
	},
	"pause": {
		"Running": "Paused",
	},
	"resume": {
		"Paused": "Running",
	},
	"terminate": {
		"Running": "Failed",
		"Paused":  "Failed",
	},
	"rollback": {
		"Running": "RolledBack",
		"Paused":  "RolledBack",
		"Failed":  "RolledBack",
	},
}

func NewRouter(cfg *config.Config, q *store.Queries) *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "ota-api"})
	})

	api := r.Group("/api/v1")
	{
		api.GET("/ping", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"env": cfg.API.Port}})
		})

		auth := api.Group("/auth")
		{
			auth.POST("/login", func(c *gin.Context) {
				if !cfg.Auth.LocalAuthEnabled {
					c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "local auth is disabled"})
					return
				}

				var req struct {
					Username string `json:"username"`
					Password string `json:"password"`
				}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
					return
				}
				username := strings.TrimSpace(req.Username)
				if username == "" {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
					return
				}

				user, err := q.GetUserByUsername(c.Request.Context(), username)
				if err != nil {
					if err == sql.ErrNoRows {
						c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "invalid username or password"})
						return
					}
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query user failed"})
					return
				}
				if user.AuthSource != "local" {
					c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "invalid username or password"})
					return
				}
				if user.Status != "enabled" {
					c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "invalid username or password"})
					return
				}
				if strings.TrimSpace(user.PasswordHash) == "" {
					c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "invalid username or password"})
					return
				}
				if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
					c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "invalid username or password"})
					return
				}

				token, err := issueJWT(cfg, user.Username)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "issue token failed"})
					return
				}
				if err := q.TouchUserLastLogin(c.Request.Context(), user.UserID); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "update login time failed"})
					return
				}
				c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"access_token": token, "token_type": "Bearer"}})
			})

			auth.GET("/sso/login", func(c *gin.Context) {
				if !cfg.OIDC.Enabled {
					c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "OIDC is disabled"})
					return
				}

				state, err := generateOIDCState(cfg)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "generate state failed"})
					return
				}
				if isOIDCConfigured(cfg) {
					redirect, err := buildOIDCAuthorizeURL(cfg, state)
					if err != nil {
						c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": err.Error()})
						return
					}
					c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"redirect_url": redirect, "mode": "oidc"}})
					return
				}

				if cfg.OIDC.MockEnabled {
					mockRedirect := fmt.Sprintf("%s?code=mock-code&state=%s", cfg.OIDC.RedirectURL, url.QueryEscape(state))
					c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"redirect_url": mockRedirect, "mode": "mock"}})
					return
				}

				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "OIDC config missing and mock mode is disabled"})
			})

			auth.GET("/sso/callback", func(c *gin.Context) {
				if !cfg.OIDC.Enabled {
					c.JSON(http.StatusServiceUnavailable, gin.H{"code": 1002, "message": "OIDC is disabled"})
					return
				}
				state := c.Query("state")
				if strings.TrimSpace(state) == "" {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "missing state"})
					return
				}
				if err := validateOIDCState(cfg, state); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid state"})
					return
				}
				code := c.Query("code")
				if code == "" {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "missing code"})
					return
				}

				username, providerMode, err := resolveOIDCUser(c.Request.Context(), cfg, code)
				if err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": err.Error()})
					return
				}

				token, err := issueJWT(cfg, username)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "issue token failed"})
					return
				}
				c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"access_token": token, "token_type": "Bearer", "mode": providerMode}})
			})
		}

		api.GET("/users", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}

			limit := 20
			offset := 0
			if l := c.Query("limit"); l != "" {
				if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
					limit = n
				}
			}
			if o := c.Query("offset"); o != "" {
				if n, err := strconv.Atoi(o); err == nil && n >= 0 {
					offset = n
				}
			}

			search := strings.TrimSpace(c.Query("search"))
			status := normalizeUserStatus(c.Query("status"))
			role := strings.ToLower(strings.TrimSpace(c.Query("role")))
			if role != "" {
				if _, ok := allowedUserRoles[role]; !ok {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid role"})
					return
				}
			}

			users, err := q.ListUsers(c.Request.Context(), store.ListUsersParams{
				Limit:  int32(limit),
				Offset: int32(offset),
				Search: search,
				Status: status,
				Role:   role,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query users failed"})
				return
			}
			count, err := q.CountUsers(c.Request.Context(), search, status, role)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "count users failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"users": mapUserRecords(users), "total": count}})
		})

		api.GET("/users/:user_id", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			userID := strings.TrimSpace(c.Param("user_id"))
			if userID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "user_id is required"})
				return
			}

			user, err := q.GetUserByID(c.Request.Context(), userID)
			if err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2010, "message": "user not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query user failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapUserRecord(user)})
		})

		api.POST("/users", func(c *gin.Context) {
			operator, ok := operatorFromBearer(c.GetHeader("Authorization"), cfg)
			if !ok {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}

			var req struct {
				Username    string   `json:"username"`
				DisplayName string   `json:"display_name"`
				Password    string   `json:"password"`
				Status      string   `json:"status"`
				AuthSource  string   `json:"auth_source"`
				Roles       []string `json:"roles"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}

			username := strings.TrimSpace(req.Username)
			if username == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "username is required"})
				return
			}
			displayName := strings.TrimSpace(req.DisplayName)
			if displayName == "" {
				displayName = username
			}
			status := normalizeUserStatus(req.Status)
			if status == "" {
				status = "enabled"
			}
			authSource := normalizeAuthSource(req.AuthSource)
			if authSource == "" {
				authSource = "local"
			}
			roles, err := sanitizeUserRoles(req.Roles)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": err.Error()})
				return
			}
			passwordHash := ""
			if authSource == "local" {
				password := strings.TrimSpace(req.Password)
				if password == "" {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "password is required for local users"})
					return
				}
				hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "hash password failed"})
					return
				}
				passwordHash = string(hash)
			}

			user, err := q.CreateUser(c.Request.Context(), store.CreateUserParams{
				UserID:       "user-" + uuid.NewString(),
				Username:     username,
				DisplayName:  displayName,
				PasswordHash: passwordHash,
				Status:       status,
				AuthSource:   authSource,
			})
			if err != nil {
				if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
					c.JSON(http.StatusConflict, gin.H{"code": 2011, "message": "username already exists"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "create user failed"})
				return
			}
			if err := q.ReplaceUserRoles(c.Request.Context(), user.UserID, roles); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "assign user roles failed"})
				return
			}
			user, err = q.GetUserByID(c.Request.Context(), user.UserID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "reload user failed"})
				return
			}
			writeUserAudit(c.Request.Context(), q, operator, "USER_CREATE", user.UserID, nil, user)
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapUserRecord(user)})
		})

		api.PATCH("/users/:user_id/status", func(c *gin.Context) {
			operator, ok := operatorFromBearer(c.GetHeader("Authorization"), cfg)
			if !ok {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			userID := strings.TrimSpace(c.Param("user_id"))
			if userID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "user_id is required"})
				return
			}
			var req struct {
				Status string `json:"status"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}
			status := normalizeUserStatus(req.Status)
			if status == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "status must be enabled or disabled"})
				return
			}
			beforeUser, err := q.GetUserByID(c.Request.Context(), userID)
			if err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2010, "message": "user not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query user failed"})
				return
			}
			user, err := q.UpdateUserStatus(c.Request.Context(), userID, status)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "update user status failed"})
				return
			}
			writeUserAudit(c.Request.Context(), q, operator, "USER_STATUS_UPDATE", userID, beforeUser, user)
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapUserRecord(user)})
		})

		api.PATCH("/users/:user_id/roles", func(c *gin.Context) {
			operator, ok := operatorFromBearer(c.GetHeader("Authorization"), cfg)
			if !ok {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			userID := strings.TrimSpace(c.Param("user_id"))
			if userID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "user_id is required"})
				return
			}
			var req struct {
				Roles []string `json:"roles"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}
			roles, err := sanitizeUserRoles(req.Roles)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": err.Error()})
				return
			}
			beforeUser, err := q.GetUserByID(c.Request.Context(), userID)
			if err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2010, "message": "user not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query user failed"})
				return
			}
			if err := q.ReplaceUserRoles(c.Request.Context(), userID, roles); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "update user roles failed"})
				return
			}
			user, err := q.GetUserByID(c.Request.Context(), userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "reload user failed"})
				return
			}
			writeUserAudit(c.Request.Context(), q, operator, "USER_ROLE_UPDATE", userID, beforeUser, user)
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapUserRecord(user)})
		})

		api.POST("/users/:user_id/reset-password", func(c *gin.Context) {
			operator, ok := operatorFromBearer(c.GetHeader("Authorization"), cfg)
			if !ok {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			userID := strings.TrimSpace(c.Param("user_id"))
			if userID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "user_id is required"})
				return
			}
			var req struct {
				Password string `json:"password"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}
			password := strings.TrimSpace(req.Password)
			if password == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "password is required"})
				return
			}
			beforeUser, err := q.GetUserByID(c.Request.Context(), userID)
			if err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2010, "message": "user not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query user failed"})
				return
			}
			if beforeUser.AuthSource != "local" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "only local users can reset password"})
				return
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "hash password failed"})
				return
			}
			user, err := q.ResetUserPassword(c.Request.Context(), userID, string(hash))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "reset password failed"})
				return
			}
			writeUserAudit(c.Request.Context(), q, operator, "USER_PASSWORD_RESET", userID, beforeUser, gin.H{"user_id": userID, "password_reset": true})
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapUserRecord(user)})
		})

		api.GET("/packages", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			limit := 20
			offset := 0
			if l := c.Query("limit"); l != "" {
				if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
					limit = n
				}
			}
			if o := c.Query("offset"); o != "" {
				if n, err := strconv.Atoi(o); err == nil && n >= 0 {
					offset = n
				}
			}
			packages, err := q.ListPackages(c.Request.Context(), store.ListPackagesParams{Limit: int32(limit), Offset: int32(offset)})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query packages failed"})
				return
			}
			count, _ := q.CountPackages(c.Request.Context())
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"packages": mapListPackagesRows(packages), "total": count}})
		})

		api.GET("/packages/:package_id", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			packageID := strings.TrimSpace(c.Param("package_id"))
			if packageID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "package_id is required"})
				return
			}
			pkg, err := q.GetPackageByID(c.Request.Context(), packageID)
			if err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2002, "message": "package not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query package failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapGetPackageByIDRow(pkg)})
		})

		api.GET("/devices", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}

			limit := 20
			offset := 0
			if l := c.Query("limit"); l != "" {
				if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 200 {
					limit = n
				}
			}
			if o := c.Query("offset"); o != "" {
				if n, err := strconv.Atoi(o); err == nil && n >= 0 {
					offset = n
				}
			}

			filter := parseDeviceCatalogFilter(c, limit, offset)
			devices, err := q.ListDeviceCatalogFiltered(c.Request.Context(), filter)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query devices failed"})
				return
			}
			count, err := q.CountDeviceCatalogFiltered(c.Request.Context(), filter)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "count devices failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"devices": mapDeviceRegistryList(devices), "total": count}})
		})

		api.POST("/devices", func(c *gin.Context) {
			createDeviceManual(c, q)
		})

		api.GET("/devices/csv-template", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			c.Header("Content-Type", "text/csv; charset=utf-8")
			c.Header("Content-Disposition", `attachment; filename="ota-device-template.csv"`)
			c.String(http.StatusOK, deviceCSVTemplate)
		})

		api.POST("/devices/import-csv", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}

			fileHeader, err := c.FormFile("file")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "csv file is required"})
				return
			}
			if fileHeader.Size > 5*1024*1024 {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "csv file is too large"})
				return
			}

			file, err := fileHeader.Open()
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "open csv file failed"})
				return
			}
			defer file.Close()

			rows, rowErrors, err := parseDeviceCSV(file)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": err.Error()})
				return
			}
			if len(rowErrors) > 0 {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "csv validation failed", "data": gin.H{"total_rows": len(rows) + len(rowErrors), "imported_count": 0, "failed_count": len(rowErrors), "errors": rowErrors}})
				return
			}

			for _, row := range rows {
				in := CatalogDeviceInput{
					DeviceID:        row.DeviceID,
					ProductCode:     row.ProductCode,
					ProductModel:    row.ProductModel,
					HardwareVersion: row.HardwareVersion,
					CurrentVersion:  row.CurrentVersion,
					DeviceGroup:     row.DeviceGroup,
					Tags:            row.Tags,
				}
				if _, reject, err := applyCatalogDevice(c.Request.Context(), q, "csv", CatalogSyncOptions{}, in); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "upsert device failed", "data": gin.H{"device_id": row.DeviceID}})
					return
				} else if reject != nil {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": reject.Message, "data": gin.H{"device_id": row.DeviceID}})
					return
				}
			}

			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"total_rows": len(rows), "imported_count": len(rows), "failed_count": 0, "errors": []deviceCSVRowError{}}})
		})

		api.GET("/device-secrets/csv-template", func(c *gin.Context) {
			if _, ok := requireSecretAdmin(c, cfg, q); !ok {
				return
			}
			c.Header("Content-Type", "text/csv; charset=utf-8")
			c.Header("Content-Disposition", `attachment; filename="ota-device-secret-template.csv"`)
			c.String(http.StatusOK, deviceSecretCSVTemplate)
		})

		api.POST("/device-secrets/import-csv", func(c *gin.Context) {
			if _, ok := requireSecretAdmin(c, cfg, q); !ok {
				return
			}

			fileHeader, err := c.FormFile("file")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "csv file is required"})
				return
			}
			if fileHeader.Size > 2*1024*1024 {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "csv file is too large"})
				return
			}

			file, err := fileHeader.Open()
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "open csv file failed"})
				return
			}
			defer file.Close()

			rows, rowErrors, err := parseDeviceSecretCSV(file)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": err.Error()})
				return
			}
			if len(rowErrors) > 0 {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "csv validation failed", "data": gin.H{
					"total_rows": len(rows) + len(rowErrors), "imported_count": 0, "failed_count": len(rowErrors), "errors": rowErrors,
				}})
				return
			}

			for _, row := range rows {
				if err := q.SetDeviceSecret(c.Request.Context(), row.DeviceID, row.DeviceSecret); err != nil {
					if err == sql.ErrNoRows {
						c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device not found", "data": gin.H{"device_id": row.DeviceID}})
						return
					}
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "set device secret failed", "data": gin.H{"device_id": row.DeviceID}})
					return
				}
			}

			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{
				"total_rows": len(rows), "imported_count": len(rows), "failed_count": 0, "errors": []deviceCSVRowError{},
			}})
		})

		api.GET("/devices/:device_id/upgrade-records", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			deviceID := strings.TrimSpace(c.Param("device_id"))
			if deviceID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device_id is required"})
				return
			}
			if _, err := q.GetDeviceRegistry(c.Request.Context(), deviceID); err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2004, "message": "device not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query device failed"})
				return
			}
			records, err := q.ListUpgradeRecordsByDevice(c.Request.Context(), deviceID, parseUpgradeRecordLimit(c))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query upgrade records failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"records": mapUpgradeRecords(records)}})
		})

		api.GET("/devices/:device_id", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			deviceID := strings.TrimSpace(c.Param("device_id"))
			if deviceID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device_id is required"})
				return
			}
			device, err := q.GetDeviceRegistry(c.Request.Context(), deviceID)
			if err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2004, "message": "device not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query device failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapDeviceRegistry(device)})
		})

		api.PUT("/devices/:device_id", func(c *gin.Context) {
			updateDeviceManual(c, q)
		})

		api.PUT("/devices/:device_id/device-secret", func(c *gin.Context) {
			if _, ok := requireSecretAdmin(c, cfg, q); !ok {
				return
			}
			deviceID := strings.TrimSpace(c.Param("device_id"))
			if deviceID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device_id is required"})
				return
			}
			var req struct {
				DeviceSecret string `json:"device_secret"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}
			secret := strings.TrimSpace(req.DeviceSecret)
			if secret == "" || len(secret) > 128 {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device_secret is required and must be <= 128 chars"})
				return
			}
			if err := q.SetDeviceSecret(c.Request.Context(), deviceID, secret); err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2004, "message": "device not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "set device secret failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"device_id": deviceID, "provisioned": true}})
		})

		api.PATCH("/packages/:package_id/status", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			packageID := strings.TrimSpace(c.Param("package_id"))
			if packageID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "package_id is required"})
				return
			}
			var req struct {
				Status string `json:"status"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}
			if req.Status != "Draft" && req.Status != "Published" && req.Status != "Deprecated" && req.Status != "Disabled" && req.Status != "Archived" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "status must be Draft/Published/Deprecated/Disabled/Archived"})
				return
			}
			pkg, err := q.UpdatePackageStatus(c.Request.Context(), store.UpdatePackageStatusParams{PackageID: packageID, Status: req.Status})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "update package status failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapUpdatePackageStatusRow(pkg)})
		})

		
		api.PATCH("/packages/:package_id/alias", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			packageID := strings.TrimSpace(c.Param("package_id"))
			if packageID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "package_id is required"})
				return
			}
			var req struct {
				Alias string `json:"alias"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}
			alias := strings.TrimSpace(req.Alias)
			if alias == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "alias is required"})
				return
			}
			pkg, err := q.UpdatePackageAlias(c.Request.Context(), store.UpdatePackageAliasParams{PackageID: packageID, Name: alias})
			if err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2002, "message": "package not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "update package alias failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapUpdatePackageAliasRow(pkg)})
		})

		api.POST("/packages", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}

			var req struct {
				ProductCode string `json:"product_code"`
				Version     string `json:"version"`
				FileHash    string `json:"file_hash"`
				Signature   string `json:"signature"`
				Alias       string `json:"alias"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}
			if req.ProductCode == "" || req.Version == "" || req.FileHash == "" || req.Signature == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "product_code/version/file_hash/signature are required"})
				return
			}

			id := "pkg-" + uuid.NewString()
			record, err := q.CreatePackage(c.Request.Context(), store.CreatePackageParams{
				PackageID:   id,
				ProductCode: req.ProductCode,
				Version:     req.Version,
				FileHash:    req.FileHash,
				Signature:   req.Signature,
				Status:      "Published",
				Name:        strings.TrimSpace(req.Alias),
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "create package failed"})
				return
			}

			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapCreatePackageRow(record)})
		})

		api.POST("/packages/upload-url", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}

			var req struct {
				PackageID   string `json:"package_id"`
				FileName    string `json:"file_name"`
				ContentType string `json:"content_type"`
				FileHash    string `json:"file_hash"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}

			packageID := strings.TrimSpace(req.PackageID)
			if packageID == "" {
				packageID = "pkg-" + uuid.NewString()
			}

			uploadURL, objectKey, expiresAt, err := buildS3PresignedUploadURL(cfg, packageID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "generate upload url failed"})
				return
			}

			headers := gin.H{}
			if strings.TrimSpace(req.FileHash) != "" {
				headers["x-amz-meta-file-hash"] = strings.TrimSpace(req.FileHash)
			}
			if strings.TrimSpace(req.FileName) != "" {
				headers["x-amz-meta-file-name"] = strings.TrimSpace(req.FileName)
			}
			if strings.TrimSpace(req.ContentType) != "" {
				headers["content-type"] = strings.TrimSpace(req.ContentType)
			}

			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{
				"package_id":       packageID,
				"object_key":       objectKey,
				"upload_url":       uploadURL,
				"expires_at":       expiresAt.Unix(),
				"required_headers": headers,
			}})
		})

		api.POST("/packages/complete", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}

			var req struct {
				PackageID   string `json:"package_id"`
				ProductCode string `json:"product_code"`
				Version     string `json:"version"`
				FileHash    string `json:"file_hash"`
				Signature   string `json:"signature"`
				FileSize    int64  `json:"file_size"`
				Alias       string `json:"alias"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}
			if req.PackageID == "" || req.ProductCode == "" || req.Version == "" || req.FileHash == "" || req.Signature == "" || req.FileSize <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "package_id/product_code/version/file_hash/signature/file_size are required"})
				return
			}

			if err := validateUploadedObject(cfg, req.PackageID, req.FileHash, req.FileSize); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 2003, "message": err.Error()})
				return
			}

			record, err := q.CreatePackage(c.Request.Context(), store.CreatePackageParams{
				PackageID:   req.PackageID,
				ProductCode: req.ProductCode,
				Version:     req.Version,
				FileHash:    req.FileHash,
				Signature:   req.Signature,
				Status:      "Published",
				Name:        strings.TrimSpace(req.Alias),
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "create package failed"})
				return
			}

			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapCreatePackageRow(record)})
		})

		api.GET("/release-tasks", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			limit := 20
			offset := 0
			if l := c.Query("limit"); l != "" {
				if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
					limit = n
				}
			}
			if o := c.Query("offset"); o != "" {
				if n, err := strconv.Atoi(o); err == nil && n >= 0 {
					offset = n
				}
			}
			tasks, err := q.ListReleaseTasks(c.Request.Context(), store.ListReleaseTasksParams{Limit: int32(limit), Offset: int32(offset)})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query tasks failed"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapReleaseTaskListRows(tasks)})
		})

		api.GET("/release-tasks/:task_id", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}
			taskID := strings.TrimSpace(c.Param("task_id"))
			if taskID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "task_id is required"})
				return
			}
			task, err := q.GetReleaseTaskExt(c.Request.Context(), taskID)
			if err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2004, "message": "task not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query task failed"})
				return
			}
			stats, statsErr := q.GetTaskStats(c.Request.Context(), taskID)
			var statsData interface{} = nil
			if statsErr == nil {
				statsData = stats
			}
			taskData := mapTReleaseTask(task)
			if pkgRow, pkgErr := q.GetPackageByID(c.Request.Context(), task.PackageID); pkgErr == nil {
				taskData["package_alias"] = pkgRow.Name
				taskData["product_code"] = pkgRow.ProductCode
				taskData["version"] = pkgRow.Version
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"task": taskData, "stats": statsData}})
		})

		api.POST("/release-tasks", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}

			var req struct {
				PackageID        string  `json:"package_id"`
				DeviceID         string  `json:"device_id"`
				Group            string  `json:"group"`
				ProductModel     string  `json:"product_model"`
				HardwareVersion  string  `json:"hardware_version"`
				FailureThreshold float64 `json:"failure_threshold"`
				CanaryPercent    int32   `json:"canary_percent"`
				ScheduleTime     string  `json:"schedule_time"`
				ForceUpgrade     bool    `json:"force_upgrade"`
				StartNow         *bool   `json:"start_now"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}

			targetDeviceID := strings.TrimSpace(req.DeviceID)
			group := strings.TrimSpace(req.Group)
			productModel := strings.TrimSpace(req.ProductModel)
			hardwareVersion := strings.TrimSpace(req.HardwareVersion)

			if targetDeviceID != "" {
				dev, err := q.GetDeviceRegistry(c.Request.Context(), targetDeviceID)
				if err != nil {
					if err == sql.ErrNoRows {
						c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device not found"})
						return
					}
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query device failed"})
					return
				}
				if strings.TrimSpace(dev.EligibilityState) != "" && !strings.EqualFold(dev.EligibilityState, "active") {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device is not active"})
					return
				}
				group = strings.TrimSpace(dev.DeviceGroup)
				productModel = strings.TrimSpace(dev.ProductModel)
				hardwareVersion = strings.TrimSpace(dev.HardwareVersion)
				if group == "" || productModel == "" || hardwareVersion == "" {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "device missing group/product_model/hardware_version"})
					return
				}
			}

			if req.PackageID == "" || group == "" || productModel == "" || hardwareVersion == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "package_id/group/product_model/hardware_version are required (or provide device_id)"})
				return
			}

			if _, err := q.GetPackageByID(c.Request.Context(), req.PackageID); err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusBadRequest, gin.H{"code": 2002, "message": "package not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query package failed"})
				return
			}

			if req.FailureThreshold <= 0 || req.FailureThreshold > 1 {
				req.FailureThreshold = 0.05
			}
			if req.CanaryPercent <= 0 || req.CanaryPercent > 100 {
				req.CanaryPercent = 100
			}

			startNow := true
			if req.StartNow != nil {
				startNow = *req.StartNow
			}
			initialState := "Draft"
			if startNow {
				initialState = "Running"
			}

			schedule := sql.NullTime{}
			if strings.TrimSpace(req.ScheduleTime) != "" {
				t, parseErr := time.Parse(time.RFC3339, strings.TrimSpace(req.ScheduleTime))
				if parseErr != nil {
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "schedule_time must be RFC3339"})
					return
				}
				schedule = sql.NullTime{Time: t, Valid: true}
			}

			id := "task-" + uuid.NewString()
			task, err := q.CreateReleaseTaskExt(c.Request.Context(), store.CreateReleaseTaskExtParams{
				TaskID:           id,
				PackageID:        req.PackageID,
				TargetGroup:      group,
				ProductModel:     productModel,
				HardwareVersion:  hardwareVersion,
				FailureThreshold: fmt.Sprintf("%.4f", req.FailureThreshold),
				State:            initialState,
				CanaryPercent:    req.CanaryPercent,
				ScheduleTime:     schedule,
				ForceUpgrade:     req.ForceUpgrade,
				TargetDeviceID:   targetDeviceID,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "create task failed"})
				return
			}
			if task.State == "Running" {
				matched, err := buildTaskSnapshot(c.Request.Context(), q, task)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "build task snapshot failed"})
					return
				}
				if matched == 0 {
					if _, revertErr := q.UpdateReleaseTaskState(c.Request.Context(), store.UpdateReleaseTaskStateParams{
						TaskID: task.TaskID,
						State:  "Draft",
					}); revertErr != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "revert task state failed"})
						return
					}
					c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "no devices matched task scope"})
					return
				}
			}

			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapTReleaseTask(task)})
		})

		api.POST("/release-tasks/:task_id/actions", func(c *gin.Context) {
			operator, ok := operatorFromBearer(c.GetHeader("Authorization"), cfg)
			if !ok {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}

			taskID := strings.TrimSpace(c.Param("task_id"))
			if taskID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "task_id is required"})
				return
			}

			var req struct {
				Action string `json:"action"`
				Reason string `json:"reason"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}

			action := strings.ToLower(strings.TrimSpace(req.Action))
			if _, exists := taskStateTransition[action]; !exists {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "action must be one of start/pause/resume/terminate/rollback"})
				return
			}

			beforeTask, err := q.GetReleaseTaskByID(c.Request.Context(), taskID)
			if err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2004, "message": "task not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query task failed"})
				return
			}

			nextState, canTransit := taskStateTransition[action][beforeTask.State]
			if !canTransit {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": fmt.Sprintf("cannot %s task in state %s", action, beforeTask.State)})
				return
			}

			afterTask, err := q.UpdateReleaseTaskState(c.Request.Context(), store.UpdateReleaseTaskStateParams{
				TaskID: taskID,
				State:  nextState,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "update task state failed"})
				return
			}
			if afterTask.State == "Running" {
				fullForSnapshot, snapErr := q.GetReleaseTaskExt(c.Request.Context(), taskID)
				if snapErr != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query task failed"})
					return
				}
				if _, err := buildTaskSnapshot(c.Request.Context(), q, fullForSnapshot); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "build task snapshot failed"})
					return
				}
			}

			traceID := strings.TrimSpace(c.GetHeader("X-Trace-ID"))
			if traceID == "" {
				traceID = "trace-" + uuid.NewString()
			}

			beforeStateBytes, _ := json.Marshal(gin.H{"task": beforeTask, "reason": req.Reason})
			afterStateBytes, _ := json.Marshal(gin.H{"task": afterTask, "reason": req.Reason})

			audit, err := q.CreateAuditLog(c.Request.Context(), store.CreateAuditLogParams{
				TraceID:       traceID,
				Operator:      operator,
				OperationType: strings.ToUpper(action),
				ResourceID:    taskID,
				BeforeState:   newNullRawMessage(beforeStateBytes),
				AfterState:    newNullRawMessage(afterStateBytes),
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "write audit log failed"})
				return
			}

			fullTask, err := q.GetReleaseTaskExt(c.Request.Context(), taskID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query task failed"})
				return
			}

			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"task": mapTReleaseTask(fullTask), "audit_log": mapAuditLog(audit)}})
		})

		api.GET("/release-tasks/:task_id/audits", func(c *gin.Context) {
			if !hasBearer(c.GetHeader("Authorization")) {
				c.JSON(http.StatusUnauthorized, gin.H{"code": 1001, "message": "unauthorized"})
				return
			}

			taskID := strings.TrimSpace(c.Param("task_id"))
			if taskID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "task_id is required"})
				return
			}

			logs, err := q.ListAuditLogsByResource(c.Request.Context(), taskID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query audit logs failed"})
				return
			}

			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": mapAuditLogs(logs)})
		})

		registerAlertRoutes(api, q)
		registerProductModelPolicyRoutes(api, cfg, q)
		registerIntegrationRoutes(api, cfg, q)
	}

	device := r.Group("/device/v1")
	{
		device.GET("/packages/:package_id/download", func(c *gin.Context) {
			packageID := strings.TrimSpace(c.Param("package_id"))
			if packageID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "package_id is required"})
				return
			}

			if _, err := q.GetPackageByID(c.Request.Context(), packageID); err != nil {
				if err == sql.ErrNoRows {
					c.JSON(http.StatusNotFound, gin.H{"code": 2002, "message": "package not found"})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"code": 5000, "message": "query package failed"})
				return
			}

			if cfg.Auth.DeviceDownloadHMACEnabled {
				if err := verifyPackageDownloadSignature(cfg, packageID, c.Query("expires"), c.Query("signature")); err != nil {
					c.JSON(http.StatusForbidden, gin.H{"code": 1003, "message": err.Error()})
					return
				}
			}

			c.Redirect(http.StatusFound, buildSignedDownloadURL(cfg, packageID))
		})

		device.POST("/check-update", func(c *gin.Context) {
			rawBody, err := readRequestBody(c)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}
			if !requireDeviceAuth(c, cfg, q, rawBody) {
				return
			}
			handleCheckUpdate(c, cfg, q, rawBody)
		})

		device.POST("/report-status", func(c *gin.Context) {
			rawBody, err := readRequestBody(c)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"code": 1002, "message": "invalid request"})
				return
			}
			if !requireDeviceAuth(c, cfg, q, rawBody) {
				return
			}
			handleReportStatus(c, cfg, q, rawBody)
		})
	}

	return r
}

func hasBearer(header string) bool {
	if header == "" {
		return false
	}
	parts := strings.SplitN(header, " ", 2)
	return len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") && strings.TrimSpace(parts[1]) != ""
}

func operatorFromBearer(header string, cfg *config.Config) (string, bool) {
	if !hasBearer(header) {
		return "", false
	}

	parts := strings.SplitN(header, " ", 2)
	tok := strings.TrimSpace(parts[1])
	parsed, err := jwt.Parse(tok, func(token *jwt.Token) (interface{}, error) {
		if token.Method == nil || token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, errors.New("invalid signing method")
		}
		return []byte(cfg.Auth.JWTSecret), nil
	})
	if err != nil || !parsed.Valid {
		return "", false
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return "", false
	}

	sub, _ := claims["sub"].(string)
	if strings.TrimSpace(sub) == "" {
		log.Printf("warn: jwt sub claim missing or invalid")
		return "unknown", true
	}
	return sub, true
}

func normalizeUserStatus(value string) string {
	status := strings.ToLower(strings.TrimSpace(value))
	if status == "enabled" || status == "disabled" {
		return status
	}
	return ""
}

func normalizeAuthSource(value string) string {
	authSource := strings.ToLower(strings.TrimSpace(value))
	if authSource == "local" || authSource == "sso" {
		return authSource
	}
	return ""
}

func sanitizeUserRoles(roles []string) ([]string, error) {
	if len(roles) == 0 {
		return []string{"readonly"}, nil
	}
	unique := make(map[string]struct{}, len(roles))
	out := make([]string, 0, len(roles))
	for _, role := range roles {
		normalized := strings.ToLower(strings.TrimSpace(role))
		if normalized == "" {
			continue
		}
		if _, ok := allowedUserRoles[normalized]; !ok {
			return nil, fmt.Errorf("invalid role: %s", normalized)
		}
		if _, seen := unique[normalized]; seen {
			continue
		}
		unique[normalized] = struct{}{}
		out = append(out, normalized)
	}
	if len(out) == 0 {
		return []string{"readonly"}, nil
	}
	return out, nil
}

func writeUserAudit(ctx context.Context, q *store.Queries, operator, operationType, resourceID string, beforeState, afterState interface{}) {
	traceID := "trace-" + uuid.NewString()
	var beforeBytes []byte
	var afterBytes []byte
	if beforeState != nil {
		beforeBytes, _ = json.Marshal(beforeState)
	}
	if afterState != nil {
		afterBytes, _ = json.Marshal(afterState)
	}
	_, _ = q.CreateAuditLog(ctx, store.CreateAuditLogParams{
		TraceID:       traceID,
		Operator:      operator,
		OperationType: operationType,
		ResourceID:    resourceID,
		BeforeState:   newNullRawMessage(beforeBytes),
		AfterState:    newNullRawMessage(afterBytes),
	})
}

func isOIDCConfigured(cfg *config.Config) bool {
	return strings.TrimSpace(cfg.OIDC.ClientID) != "" &&
		(strings.TrimSpace(cfg.OIDC.AuthorizeURL) != "" || strings.TrimSpace(cfg.OIDC.IssuerURL) != "")
}

func buildOIDCAuthorizeURL(cfg *config.Config, state string) (string, error) {
	base := strings.TrimSpace(cfg.OIDC.AuthorizeURL)
	if base == "" {
		issuer := strings.TrimSuffix(strings.TrimSpace(cfg.OIDC.IssuerURL), "/")
		if issuer == "" {
			return "", fmt.Errorf("missing OIDC authorize endpoint")
		}
		base = issuer + "/protocol/openid-connect/auth"
	}

	u, err := url.Parse(base)
	if err != nil {
		return "", fmt.Errorf("invalid OIDC authorize endpoint")
	}

	q := u.Query()
	q.Set("client_id", cfg.OIDC.ClientID)
	q.Set("response_type", "code")
	q.Set("scope", cfg.OIDC.Scopes)
	q.Set("redirect_uri", cfg.OIDC.RedirectURL)
	q.Set("state", state)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

type oidcStatePayload struct {
	Nonce string `json:"n"`
	Exp   int64  `json:"e"`
}

func generateOIDCState(cfg *config.Config) (string, error) {
	key := oidcStateSigningKey(cfg)
	if key == "" {
		return "", fmt.Errorf("missing state signing key")
	}

	ttl := time.Duration(cfg.OIDC.StateTTLSec) * time.Second
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}

	payload := oidcStatePayload{
		Nonce: uuid.NewString(),
		Exp:   time.Now().Add(ttl).Unix(),
	}

	rawPayload, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	sig := signOIDCState(rawPayload, key)
	state := base64.RawURLEncoding.EncodeToString(rawPayload) + "." + base64.RawURLEncoding.EncodeToString(sig)
	return state, nil
}

func validateOIDCState(cfg *config.Config, state string) error {
	key := oidcStateSigningKey(cfg)
	if key == "" {
		return fmt.Errorf("missing state signing key")
	}

	parts := strings.Split(state, ".")
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return fmt.Errorf("invalid state format")
	}

	rawPayload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return fmt.Errorf("decode state payload failed")
	}
	rawSig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return fmt.Errorf("decode state signature failed")
	}

	expected := signOIDCState(rawPayload, key)
	if !hmac.Equal(rawSig, expected) {
		return fmt.Errorf("state signature mismatch")
	}

	var payload oidcStatePayload
	if err := json.Unmarshal(rawPayload, &payload); err != nil {
		return fmt.Errorf("parse state payload failed")
	}
	if strings.TrimSpace(payload.Nonce) == "" {
		return fmt.Errorf("state nonce is empty")
	}
	if payload.Exp <= time.Now().Unix() {
		return fmt.Errorf("state expired")
	}

	return nil
}

func oidcStateSigningKey(cfg *config.Config) string {
	if strings.TrimSpace(cfg.OIDC.StateSigningKey) != "" {
		return strings.TrimSpace(cfg.OIDC.StateSigningKey)
	}
	return strings.TrimSpace(cfg.Auth.JWTSecret)
}

func signOIDCState(payload []byte, key string) []byte {
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write(payload)
	return mac.Sum(nil)
}

func buildSignedDownloadURL(cfg *config.Config, packageID string) string {
	if u, err := buildS3PresignedDownloadURL(cfg, packageID); err == nil && strings.TrimSpace(u) != "" {
		return u
	}

	base := strings.TrimSpace(cfg.S3.PublicBaseURL)
	if base == "" {
		base = strings.TrimSuffix(strings.TrimSpace(cfg.S3.Endpoint), "/") + "/" + strings.Trim(cfg.S3.Bucket, "/")
	}

	expiresAt := time.Now().Add(time.Duration(cfg.S3.SignedURLTTLSec) * time.Second).Unix()
	resource := strings.TrimSuffix(base, "/") + "/ota/" + url.PathEscape(packageID)
	payload := fmt.Sprintf("%s:%d", packageID, expiresAt)

	mac := hmac.New(sha256.New, []byte(cfg.S3.SecretAccessKey))
	_, _ = mac.Write([]byte(payload))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return fmt.Sprintf("%s?expires=%d&signature=%s", resource, expiresAt, sig)
}

func resolveOIDCUser(ctx context.Context, cfg *config.Config, code string) (string, string, error) {
	if code == "mock-code" {
		if cfg.OIDC.MockEnabled {
			return defaultOIDCMockUser(cfg), "mock", nil
		}
		return "", "", fmt.Errorf("mock code is disabled")
	}

	if isOIDCConfigured(cfg) {
		username, err := exchangeOIDCCode(ctx, cfg, code)
		if err != nil {
			return "", "", err
		}
		return username, "oidc", nil
	}

	if cfg.OIDC.MockEnabled {
		return defaultOIDCMockUser(cfg), "mock", nil
	}

	return "", "", fmt.Errorf("OIDC config missing and mock mode is disabled")
}

func defaultOIDCMockUser(cfg *config.Config) string {
	username := strings.TrimSpace(cfg.OIDC.MockUser)
	if username == "" {
		return "oidc-user"
	}
	return username
}

func exchangeOIDCCode(ctx context.Context, cfg *config.Config, code string) (string, error) {
	discovery, err := discoverOIDCEndpoints(ctx, cfg)
	if err != nil {
		return "", err
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("client_id", cfg.OIDC.ClientID)
	form.Set("client_secret", cfg.OIDC.ClientSecret)
	form.Set("redirect_uri", cfg.OIDC.RedirectURL)

	tokenReq, err := http.NewRequestWithContext(ctx, http.MethodPost, discovery.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("build token request failed")
	}
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	tokenResp, err := client.Do(tokenReq)
	if err != nil {
		return "", fmt.Errorf("request token endpoint failed")
	}
	defer tokenResp.Body.Close()

	body, _ := io.ReadAll(tokenResp.Body)
	if tokenResp.StatusCode < 200 || tokenResp.StatusCode >= 300 {
		return "", fmt.Errorf("token exchange failed: %s", tokenResp.Status)
	}

	var tokenPayload struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &tokenPayload); err != nil {
		return "", fmt.Errorf("parse token response failed")
	}
	if strings.TrimSpace(tokenPayload.AccessToken) == "" {
		return "", fmt.Errorf("token response missing access_token")
	}

	userReq, err := http.NewRequestWithContext(ctx, http.MethodGet, discovery.UserInfoEndpoint, nil)
	if err != nil {
		return "", fmt.Errorf("build userinfo request failed")
	}
	userReq.Header.Set("Authorization", "Bearer "+tokenPayload.AccessToken)

	userResp, err := client.Do(userReq)
	if err != nil {
		return "", fmt.Errorf("request userinfo endpoint failed")
	}
	defer userResp.Body.Close()

	userBody, _ := io.ReadAll(userResp.Body)
	if userResp.StatusCode < 200 || userResp.StatusCode >= 300 {
		return "", fmt.Errorf("userinfo failed: %s", userResp.Status)
	}

	var userInfo map[string]interface{}
	if err := json.Unmarshal(userBody, &userInfo); err != nil {
		return "", fmt.Errorf("parse userinfo response failed")
	}

	for _, key := range []string{"preferred_username", "email", "sub"} {
		if v, ok := userInfo[key].(string); ok && strings.TrimSpace(v) != "" {
			return v, nil
		}
	}

	return "", fmt.Errorf("userinfo response missing preferred_username/email/sub")
}

type oidcEndpoints struct {
	TokenEndpoint    string `json:"token_endpoint"`
	UserInfoEndpoint string `json:"userinfo_endpoint"`
}

func discoverOIDCEndpoints(ctx context.Context, cfg *config.Config) (*oidcEndpoints, error) {
	if strings.TrimSpace(cfg.OIDC.TokenURL) != "" && strings.TrimSpace(cfg.OIDC.UserInfoURL) != "" {
		return &oidcEndpoints{TokenEndpoint: cfg.OIDC.TokenURL, UserInfoEndpoint: cfg.OIDC.UserInfoURL}, nil
	}

	issuer := strings.TrimSuffix(strings.TrimSpace(cfg.OIDC.IssuerURL), "/")
	if issuer == "" {
		return nil, fmt.Errorf("missing OIDC issuer URL")
	}

	wellKnown := issuer + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, wellKnown, nil)
	if err != nil {
		return nil, fmt.Errorf("build discovery request failed")
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request OIDC discovery failed")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("OIDC discovery failed: %s", resp.Status)
	}

	var d oidcEndpoints
	if err := json.Unmarshal(body, &d); err != nil {
		return nil, fmt.Errorf("parse OIDC discovery response failed")
	}

	if strings.TrimSpace(d.TokenEndpoint) == "" {
		d.TokenEndpoint = strings.TrimSpace(cfg.OIDC.TokenURL)
	}
	if strings.TrimSpace(d.UserInfoEndpoint) == "" {
		d.UserInfoEndpoint = strings.TrimSpace(cfg.OIDC.UserInfoURL)
	}

	if strings.TrimSpace(d.TokenEndpoint) == "" || strings.TrimSpace(d.UserInfoEndpoint) == "" {
		return nil, fmt.Errorf("OIDC discovery missing token/userinfo endpoint")
	}

	return &d, nil
}

func buildS3PresignedDownloadURL(cfg *config.Config, packageID string) (string, error) {
	client, err := buildMinIOPresignClient(cfg)
	if err != nil {
		return "", err
	}

	ttl := time.Duration(cfg.S3.SignedURLTTLSec) * time.Second
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}

	result, err := client.PresignedGetObject(context.Background(), strings.TrimSpace(cfg.S3.Bucket), "ota/"+packageID, ttl, nil)
	if err != nil {
		return "", err
	}

	return result.String(), nil
}

func buildS3PresignedUploadURL(cfg *config.Config, packageID string) (string, string, time.Time, error) {
	client, err := buildMinIOPresignClient(cfg)
	if err != nil {
		return "", "", time.Time{}, err
	}

	ttl := time.Duration(cfg.S3.SignedURLTTLSec) * time.Second
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}

	objectKey := "ota/" + packageID
	u, err := client.PresignedPutObject(context.Background(), strings.TrimSpace(cfg.S3.Bucket), objectKey, ttl)
	if err != nil {
		return "", "", time.Time{}, err
	}

	return u.String(), objectKey, time.Now().Add(ttl), nil
}

func buildMinIOClient(cfg *config.Config) (*minio.Client, error) {
	if strings.TrimSpace(cfg.S3.Endpoint) == "" || strings.TrimSpace(cfg.S3.Bucket) == "" {
		return nil, fmt.Errorf("missing S3 endpoint or bucket")
	}

	u, err := url.Parse(strings.TrimSpace(cfg.S3.Endpoint))
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(u.Host) == "" {
		return nil, fmt.Errorf("invalid S3 endpoint")
	}

	client, err := minio.New(u.Host, &minio.Options{
		Creds:  minioCreds.NewStaticV4(cfg.S3.AccessKeyID, cfg.S3.SecretAccessKey, ""),
		Secure: strings.EqualFold(u.Scheme, "https"),
		Region: strings.TrimSpace(cfg.S3.Region),
	})
	if err != nil {
		return nil, err
	}

	return client, nil
}

func buildMinIOPresignClient(cfg *config.Config) (*minio.Client, error) {
	host, secure, err := s3PresignEndpoint(cfg)
	if err != nil {
		return nil, err
	}

	client, err := minio.New(host, &minio.Options{
		Creds:  minioCreds.NewStaticV4(cfg.S3.AccessKeyID, cfg.S3.SecretAccessKey, ""),
		Secure: secure,
		Region: strings.TrimSpace(cfg.S3.Region),
	})
	if err != nil {
		return nil, err
	}

	return client, nil
}

func s3PresignEndpoint(cfg *config.Config) (host string, secure bool, err error) {
	if base := strings.TrimSpace(cfg.S3.PublicBaseURL); base != "" {
		u, parseErr := url.Parse(base)
		if parseErr != nil || strings.TrimSpace(u.Host) == "" {
			return "", false, fmt.Errorf("invalid S3 public base URL")
		}
		return u.Host, strings.EqualFold(u.Scheme, "https"), nil
	}

	u, parseErr := url.Parse(strings.TrimSpace(cfg.S3.Endpoint))
	if parseErr != nil {
		return "", false, parseErr
	}
	if strings.TrimSpace(u.Host) == "" {
		return "", false, fmt.Errorf("invalid S3 endpoint")
	}
	return u.Host, strings.EqualFold(u.Scheme, "https"), nil
}

func validateUploadedObject(cfg *config.Config, packageID, expectedHash string, expectedSize int64) error {
	client, err := buildMinIOClient(cfg)
	if err != nil {
		return err
	}

	obj, err := client.StatObject(context.Background(), strings.TrimSpace(cfg.S3.Bucket), "ota/"+strings.TrimSpace(packageID), minio.StatObjectOptions{})
	if err != nil {
		return fmt.Errorf("uploaded object not found")
	}

	if expectedSize > 0 && obj.Size != expectedSize {
		return fmt.Errorf("uploaded object size mismatch: expected %d got %d", expectedSize, obj.Size)
	}

	metaHash := pickMetaValue(obj.UserMetadata, "file-hash", "file_hash", "x-amz-meta-file-hash")
	if strings.TrimSpace(metaHash) != "" && !strings.EqualFold(strings.TrimSpace(metaHash), strings.TrimSpace(expectedHash)) {
		return fmt.Errorf("uploaded object hash metadata mismatch")
	}

	return nil
}

func pickMetaValue(meta map[string]string, keys ...string) string {
	if len(meta) == 0 {
		return ""
	}
	for mk, mv := range meta {
		for _, key := range keys {
			if strings.EqualFold(mk, key) {
				return mv
			}
		}
	}
	return ""
}

func newNullRawMessage(b []byte) pqtype.NullRawMessage {
	if len(b) == 0 {
		return pqtype.NullRawMessage{}
	}
	return pqtype.NullRawMessage{RawMessage: b, Valid: true}
}

func normalizeUpgradeStatus(raw string) (string, bool) {
	v := strings.ToLower(strings.TrimSpace(raw))
	m := map[string]string{
		"pending":          "Pending",
		"downloading":      "Downloading",
		"downloaded":       "Downloaded",
		"download_success": "Downloaded",
		"verifying":        "Verifying",
		"upgrading":        "Upgrading",
		"success":          "Success",
		"upgrade_success":  "Success",
		"failed":           "Failed",
		"upgrade_failed":   "Failed",
		"error":            "Failed",
		"rollbacking":      "Rollbacking",
		"rolling_back":     "Rollbacking",
		"rolledback":       "RolledBack",
		"rollback_success": "RolledBack",
		"rollbackfailed":   "RollbackFailed",
		"rollback_failed":  "RollbackFailed",
	}
	n, ok := m[v]
	return n, ok
}

func inCanaryRange(deviceID, taskID string, canaryPercent int32) bool {
	if canaryPercent <= 0 {
		return false
	}
	if canaryPercent >= 100 {
		return true
	}
	sum := sha256.Sum256([]byte(taskID + ":" + deviceID))
	bucket := int(sum[0]) % 100
	return bucket < int(canaryPercent)
}

func issueJWT(cfg *config.Config, username string) (string, error) {
	claims := jwt.MapClaims{
		"sub": username,
		"exp": time.Now().Add(8 * time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.Auth.JWTSecret))
}
