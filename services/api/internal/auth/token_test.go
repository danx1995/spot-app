package auth

import (
	"errors"
	"testing"
	"time"
)

func TestTokenRoundTrip(t *testing.T) {
	service := NewTokenService("0123456789abcdef0123456789abcdef", time.Hour)

	token, err := service.Issue("user-123")
	if err != nil {
		t.Fatal(err)
	}

	claims, err := service.Parse(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != "user-123" {
		t.Fatalf("expected user-123, got %s", claims.UserID)
	}
}

func TestRejectTamperedToken(t *testing.T) {
	service := NewTokenService("0123456789abcdef0123456789abcdef", time.Hour)

	token, err := service.Issue("user-123")
	if err != nil {
		t.Fatal(err)
	}

	_, err = service.Parse(token + "x")
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expected invalid token, got %v", err)
	}
}
