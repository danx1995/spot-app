package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

func signTelegramInitData(botToken string, values url.Values) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		if key == "hash" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)

	lines := make([]string, 0, len(keys))
	for _, key := range keys {
		lines = append(lines, key+"="+values.Get(key))
	}
	dataCheckString := strings.Join(lines, "\n")

	secretMAC := hmac.New(sha256.New, []byte("WebAppData"))
	_, _ = secretMAC.Write([]byte(botToken))
	secretKey := secretMAC.Sum(nil)

	hashMAC := hmac.New(sha256.New, secretKey)
	_, _ = hashMAC.Write([]byte(dataCheckString))
	values.Set("hash", hex.EncodeToString(hashMAC.Sum(nil)))
	return values.Encode()
}

func TestTelegramVerifierAcceptsValidInitData(t *testing.T) {
	const token = "123456:TEST_BOT_TOKEN"
	now := time.Date(2026, 10, 2, 20, 0, 0, 0, time.UTC)

	values := url.Values{}
	values.Set("auth_date", strconv.FormatInt(now.Unix(), 10))
	values.Set("query_id", "AAH-example")
	values.Set("user", `{"id":99887766,"first_name":"Daniil","last_name":"Godiev","username":"danx1995","photo_url":"https://example.com/avatar.jpg"}`)

	verifier := NewTelegramVerifier(token)
	verifier.now = func() time.Time { return now }

	identity, err := verifier.Verify(signTelegramInitData(token, values))
	if err != nil {
		t.Fatal(err)
	}
	if identity.Provider != "telegram" {
		t.Fatalf("expected telegram provider, got %q", identity.Provider)
	}
	if identity.Subject != "99887766" {
		t.Fatalf("unexpected subject %q", identity.Subject)
	}
	if identity.DisplayName != "Daniil Godiev" {
		t.Fatalf("unexpected display name %q", identity.DisplayName)
	}
	if identity.AvatarURL != "https://example.com/avatar.jpg" {
		t.Fatalf("unexpected avatar %q", identity.AvatarURL)
	}
}

func TestTelegramVerifierRejectsTamperedData(t *testing.T) {
	const token = "123456:TEST_BOT_TOKEN"
	now := time.Date(2026, 10, 2, 20, 0, 0, 0, time.UTC)

	values := url.Values{}
	values.Set("auth_date", strconv.FormatInt(now.Unix(), 10))
	values.Set("user", `{"id":1,"first_name":"Daniil"}`)

	raw := signTelegramInitData(token, values)
	raw = strings.Replace(raw, "Daniil", "Hacker", 1)

	verifier := NewTelegramVerifier(token)
	verifier.now = func() time.Time { return now }

	if _, err := verifier.Verify(raw); err != ErrTelegramInvalid {
		t.Fatalf("expected invalid telegram data, got %v", err)
	}
}

func TestTelegramVerifierRejectsExpiredData(t *testing.T) {
	const token = "123456:TEST_BOT_TOKEN"
	now := time.Date(2026, 10, 2, 20, 0, 0, 0, time.UTC)

	values := url.Values{}
	values.Set("auth_date", strconv.FormatInt(now.Add(-25*time.Hour).Unix(), 10))
	values.Set("user", `{"id":1,"first_name":"Daniil"}`)

	verifier := NewTelegramVerifier(token)
	verifier.now = func() time.Time { return now }

	if _, err := verifier.Verify(signTelegramInitData(token, values)); err != ErrTelegramExpired {
		t.Fatalf("expected expired telegram data, got %v", err)
	}
}
