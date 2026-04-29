package server

import (
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"ota-server/backend/internal/config"
)

func TestGenerateAndValidateOIDCState(t *testing.T) {
	cfg := &config.Config{
		Auth: config.AuthConfig{JWTSecret: "jwt-secret-fallback"},
		OIDC: config.OIDCConfig{StateSigningKey: "state-signing-key", StateTTLSec: 60},
	}

	state, err := generateOIDCState(cfg)
	if err != nil {
		t.Fatalf("generateOIDCState() error = %v", err)
	}

	if err := validateOIDCState(cfg, state); err != nil {
		t.Fatalf("validateOIDCState() error = %v", err)
	}
}

func TestValidateOIDCState_Expired(t *testing.T) {
	cfg := &config.Config{
		Auth: config.AuthConfig{JWTSecret: "jwt-secret-fallback"},
		OIDC: config.OIDCConfig{StateSigningKey: "state-signing-key", StateTTLSec: 60},
	}

	payload := oidcStatePayload{
		Nonce: "nonce-1",
		Exp:   time.Now().Add(-1 * time.Minute).Unix(),
	}
	rawPayload, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	sig := signOIDCState(rawPayload, oidcStateSigningKey(cfg))
	state := base64.RawURLEncoding.EncodeToString(rawPayload) + "." + base64.RawURLEncoding.EncodeToString(sig)

	if err := validateOIDCState(cfg, state); err == nil {
		t.Fatalf("validateOIDCState() expected error for expired state")
	}
}
