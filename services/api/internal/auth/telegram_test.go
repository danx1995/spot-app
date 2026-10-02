package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"strconv"
	"testing"
	"time"
)

func signedTelegramInitData(
	token string,
	userJSON string,
	authDate int64,
	includeSignature bool,
) string {
	values := url.Values{}
	values.Set("auth_date", strconv.FormatInt(authDate, 10))
	values.Set("query_id", "AAHdF6IQAAAAAN0XohDhrOrc")
	values.Set("user", userJSON)
	if includeSignature {
		values.Set("signature", "telegram-third-party-signature")
	}

	secretMAC := hmac.New(sha256.New, []byte("WebAppData"))
	_, _ = secretMAC.Write([]byte(token))
	secret := secretMAC.Sum(nil)

	dataCheck := telegramDataCheckString(values, includeSignature)
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(dataCheck))
	values.Set("hash", hex.EncodeToString(mac.Sum(nil)))

	return values.Encode()
}

func TestTelegramVerifierValidatesFreshInitData(t *testing.T) {
	now := time.Date(2026, 10, 2, 18, 30, 0, 0, time.UTC)
	verifier := NewTelegramVerifier("123456:ABC-test-token", 24*time.Hour)
	verifier.now = func() time.Time { return now }

	initData := signedTelegramInitData(
		"123456:ABC-test-token",
		`{"id":987654321,"first_name":"Daniil","last_name":"Godiev","username":"danx","photo_url":"https://t.me/i/userpic/320/avatar.jpg"}`,
		now.Add(-5*time.Minute).Unix(),
		true,
	)

	user, err := verifier.Verify(initData)
	if err != nil {
		t.Fatal(err)
	}
	if user.ID != 987654321 {
		t.Fatalf("unexpected user id %d", user.ID)
	}
	if user.FirstName != "Daniil" || user.LastName != "Godiev" {
		t.Fatalf("unexpected user %#v", user)
	}

	identity := TelegramIdentity(user)
	if identity.Provider != "telegram" || identity.Subject != "987654321" {
		t.Fatalf("unexpected identity %#v", identity)
	}
	if identity.DisplayName != "Daniil Godiev" {
		t.Fatalf("unexpected display name %q", identity.DisplayName)
	}
}

func TestTelegramVerifierRejectsWrongHash(t *testing.T) {
	now := time.Now().UTC()
	verifier := NewTelegramVerifier("123456:ABC-test-token", 24*time.Hour)
	verifier.now = func() time.Time { return now }

	initData := signedTelegramInitData(
		"wrong-token",
		`{"id":42,"first_name":"Test"}`,
		now.Unix(),
		false,
	)

	if _, err := verifier.Verify(initData); err != ErrInvalidTelegramInitData {
		t.Fatalf("expected invalid init data, got %v", err)
	}
}

func TestTelegramVerifierRejectsStaleInitData(t *testing.T) {
	now := time.Date(2026, 10, 2, 18, 30, 0, 0, time.UTC)
	verifier := NewTelegramVerifier("123456:ABC-test-token", time.Hour)
	verifier.now = func() time.Time { return now }

	initData := signedTelegramInitData(
		"123456:ABC-test-token",
		`{"id":42,"first_name":"Test"}`,
		now.Add(-2*time.Hour).Unix(),
		false,
	)

	if _, err := verifier.Verify(initData); err != ErrInvalidTelegramInitData {
		t.Fatalf("expected stale init data rejection, got %v", err)
	}
}

func TestTelegramVerifierDisabledWithoutBotToken(t *testing.T) {
	verifier := NewTelegramVerifier("", 24*time.Hour)
	if verifier.Enabled() {
		t.Fatal("verifier should be disabled without bot token")
	}
	if _, err := verifier.Verify("hash=x"); err != ErrProviderNotConfigured {
		t.Fatalf("expected provider not configured, got %v", err)
	}
}
