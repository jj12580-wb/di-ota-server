package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	API      APIConfig
	Worker   WorkerConfig
	Postgres PostgresConfig
	Redis    RedisConfig
	RabbitMQ RabbitMQConfig
	S3       S3Config
	Auth     AuthConfig
	OIDC     OIDCConfig
}

type APIConfig struct {
	Port               string
	AutoMigrateOnStart bool
}

type WorkerConfig struct {
	TaskStatsRetentionHours int64
}

type PostgresConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
}

type RedisConfig struct {
	Addr     string
	Password string
}

type RabbitMQConfig struct {
	URL string
}

type S3Config struct {
	Endpoint        string
	Region          string
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
	PublicBaseURL   string
	SignedURLTTLSec int64
}

type AuthConfig struct {
	JWTSecret           string
	DeviceSigningSecret string
	LocalAuthEnabled    bool
	LocalAdminUsername  string
	LocalAdminPassHash  string
}

type OIDCConfig struct {
	Enabled         bool
	IssuerURL       string
	AuthorizeURL    string
	TokenURL        string
	UserInfoURL     string
	ClientID        string
	ClientSecret    string
	RedirectURL     string
	Scopes          string
	StateSigningKey string
	StateTTLSec     int64
	MockEnabled     bool
	MockUser        string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		API: APIConfig{
			Port:               getEnv("API_PORT", "8080"),
			AutoMigrateOnStart: getEnv("API_AUTO_MIGRATE_ON_START", "false") == "true",
		},
		Worker: WorkerConfig{
			TaskStatsRetentionHours: getEnvInt64("WORKER_TASK_STATS_RETENTION_HOURS", 168),
		},
		Postgres: PostgresConfig{
			Host:     getEnv("POSTGRES_HOST", "postgres"),
			Port:     getEnv("POSTGRES_PORT", "5432"),
			User:     getEnv("POSTGRES_USER", "ota"),
			Password: getEnv("POSTGRES_PASSWORD", "ota"),
			DBName:   getEnv("POSTGRES_DB", "ota"),
		},
		Redis: RedisConfig{
			Addr:     getEnv("REDIS_ADDR", "redis:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
		},
		RabbitMQ: RabbitMQConfig{URL: getEnv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")},
		S3: S3Config{
			Endpoint:        getEnv("S3_ENDPOINT", "http://minio:9000"),
			Region:          getEnv("S3_REGION", "us-east-1"),
			Bucket:          getEnv("S3_BUCKET", "ota-packages"),
			AccessKeyID:     getEnv("S3_ACCESS_KEY_ID", "change-me"),
			SecretAccessKey: getEnv("S3_SECRET_ACCESS_KEY", "change-me"),
			PublicBaseURL:   getEnv("S3_PUBLIC_BASE_URL", ""),
			SignedURLTTLSec: getEnvInt64("S3_SIGNED_URL_TTL_SEC", 600),
		},
		Auth: AuthConfig{
			JWTSecret:           getEnv("JWT_SECRET", "change-me-jwt-secret"),
			DeviceSigningSecret: getEnv("DEVICE_SIGNING_SECRET", "change-me-device-secret"),
			LocalAuthEnabled:    getEnv("LOCAL_AUTH_ENABLED", "false") == "true",
			LocalAdminUsername:  getEnv("LOCAL_ADMIN_USERNAME", "admin"),
			LocalAdminPassHash:  getEnv("LOCAL_ADMIN_PASSWORD_HASH", ""),
		},
		OIDC: OIDCConfig{
			Enabled:         getEnv("OIDC_ENABLED", "false") == "true",
			IssuerURL:       getEnv("OIDC_ISSUER_URL", ""),
			AuthorizeURL:    getEnv("OIDC_AUTHORIZE_URL", ""),
			TokenURL:        getEnv("OIDC_TOKEN_URL", ""),
			UserInfoURL:     getEnv("OIDC_USERINFO_URL", ""),
			ClientID:        getEnv("OIDC_CLIENT_ID", ""),
			ClientSecret:    getEnv("OIDC_CLIENT_SECRET", ""),
			RedirectURL:     getEnv("OIDC_REDIRECT_URL", "http://localhost:8080/api/v1/auth/sso/callback"),
			Scopes:          getEnv("OIDC_SCOPES", "openid profile email"),
			StateSigningKey: getEnv("OIDC_STATE_SIGNING_KEY", ""),
			StateTTLSec:     getEnvInt64("OIDC_STATE_TTL_SEC", 300),
			MockEnabled:     getEnv("OIDC_MOCK_ENABLED", "true") == "true",
			MockUser:        getEnv("OIDC_MOCK_USER", "oidc-user"),
		},
	}

	if cfg.API.Port == "" {
		return nil, fmt.Errorf("API_PORT is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt64(key string, fallback int64) int64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}

func (p PostgresConfig) DSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", p.User, p.Password, p.Host, p.Port, p.DBName)
}
