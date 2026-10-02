package cloud

import (
	"context"
	"errors"
	"testing"
)

func TestLinkIdentityUpgradesGuestProfile(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	userID, err := store.CreateGuest(ctx)
	if err != nil {
		t.Fatal(err)
	}

	profile, err := store.LinkIdentity(ctx, userID, VerifiedIdentity{
		Provider:      "google",
		Subject:       "subject-1",
		Email:         "user@example.com",
		EmailVerified: true,
		DisplayName:   "Demo User",
		AvatarURL:     "https://example.com/avatar.jpg",
	})
	if err != nil {
		t.Fatal(err)
	}
	if profile.IsGuest {
		t.Fatal("linked identity should upgrade guest profile")
	}
	if profile.Email != "user@example.com" || profile.DisplayName != "Demo User" {
		t.Fatalf("unexpected upgraded profile: %#v", profile)
	}

	found, err := store.FindUserByIdentity(ctx, "google", "subject-1")
	if err != nil {
		t.Fatal(err)
	}
	if found.ID != userID {
		t.Fatalf("expected user %q, got %q", userID, found.ID)
	}
}

func TestIdentityCannotMoveBetweenUsers(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	first, _ := store.CreateGuest(ctx)
	second, _ := store.CreateGuest(ctx)

	identity := VerifiedIdentity{
		Provider: "apple",
		Subject:  "apple-subject",
	}
	if _, err := store.LinkIdentity(ctx, first, identity); err != nil {
		t.Fatal(err)
	}
	if _, err := store.LinkIdentity(ctx, second, identity); !errors.Is(err, ErrIdentityInUse) {
		t.Fatalf("expected identity conflict, got %v", err)
	}
}

func TestOneIdentityPerProviderPerUser(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	userID, _ := store.CreateGuest(ctx)

	if _, err := store.LinkIdentity(ctx, userID, VerifiedIdentity{
		Provider: "google",
		Subject:  "subject-1",
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := store.LinkIdentity(ctx, userID, VerifiedIdentity{
		Provider: "google",
		Subject:  "subject-2",
	}); !errors.Is(err, ErrIdentityInUse) {
		t.Fatalf("expected provider conflict, got %v", err)
	}
}
