package server

import (
	"crypto/rand"
	"encoding/base32"
	"fmt"
	"strings"
	"sync/atomic"
)

var taskSeq uint32

// newShortID6 generates a 6-char uppercase id, suitable for human-friendly identifiers.
func newShortID6() (string, error) {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	enc := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
	enc = strings.ToUpper(enc)
	// base32 expands; take first 6 chars
	if len(enc) < 6 {
		return "", fmt.Errorf("short id generation failed")
	}
	return enc[:6], nil
}

// newTaskID generates 6-char string + 2-digit rolling sequence.
// Example: ABC12304
func newTaskID() (string, error) {
	prefix, err := newShortID6()
	if err != nil {
		return "", err
	}
	seq := atomic.AddUint32(&taskSeq, 1) % 100
	return fmt.Sprintf("%s%02d", prefix, seq), nil
}

