package accounttransfer

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"errors"
	"strings"
	"time"
)

var ErrInvalidCode = errors.New("invalid or expired transfer code")

type TransferCode struct {
	Code      string    `json:"code"`
	ExpiresAt time.Time `json:"expires_at"`
}

type Store interface {
	Issue(ctx context.Context, userID string) (TransferCode, error)
	Redeem(ctx context.Context, code string) (string, error)
	Mode() string
	Close()
}

func generateCode() (string, []byte, error) {
	raw := make([]byte, 12)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}

	encoded := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(raw)
	parts := make([]string, 0, 5)
	for len(encoded) > 4 {
		parts = append(parts, encoded[:4])
		encoded = encoded[4:]
	}
	if encoded != "" {
		parts = append(parts, encoded)
	}
	display := strings.Join(parts, "-")
	sum := sha256.Sum256([]byte(normalizeCode(display)))
	return display, sum[:], nil
}

func codeHash(code string) []byte {
	sum := sha256.Sum256([]byte(normalizeCode(code)))
	return sum[:]
}

func normalizeCode(code string) string {
	code = strings.ToUpper(strings.TrimSpace(code))
	code = strings.NewReplacer("-", "", " ", "", "\n", "", "\t", "").Replace(code)
	return code
}
