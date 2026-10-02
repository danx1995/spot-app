package accounttransfer

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestTransferCodeIsOneTime(t *testing.T) {
	store := NewMemoryStore()
	ctx := context.Background()

	code, err := store.Issue(ctx, "user-1")
	if err != nil {
		t.Fatal(err)
	}
	if code.Code == "" || !strings.Contains(code.Code, "-") {
		t.Fatalf("unexpected display code: %q", code.Code)
	}

	userID, err := store.Redeem(ctx, code.Code)
	if err != nil {
		t.Fatal(err)
	}
	if userID != "user-1" {
		t.Fatalf("unexpected user id: %q", userID)
	}

	if _, err := store.Redeem(ctx, code.Code); !errors.Is(err, ErrInvalidCode) {
		t.Fatalf("expected second redeem to fail, got %v", err)
	}
}

func TestTransferCodeNormalization(t *testing.T) {
	store := NewMemoryStore()
	ctx := context.Background()

	code, err := store.Issue(ctx, "user-2")
	if err != nil {
		t.Fatal(err)
	}

	normalized := strings.ToLower(strings.ReplaceAll(code.Code, "-", " "))
	userID, err := store.Redeem(ctx, normalized)
	if err != nil {
		t.Fatal(err)
	}
	if userID != "user-2" {
		t.Fatalf("unexpected user id: %q", userID)
	}
}

func TestNewCodeInvalidatesPreviousUserCode(t *testing.T) {
	store := NewMemoryStore()
	ctx := context.Background()

	first, err := store.Issue(ctx, "user-3")
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.Issue(ctx, "user-3")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := store.Redeem(ctx, first.Code); !errors.Is(err, ErrInvalidCode) {
		t.Fatalf("old code should be invalidated, got %v", err)
	}
	if _, err := store.Redeem(ctx, second.Code); err != nil {
		t.Fatalf("new code should work: %v", err)
	}
}
