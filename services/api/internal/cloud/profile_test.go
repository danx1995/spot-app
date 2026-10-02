package cloud

import (
	"context"
	"errors"
	"testing"
)

func TestGuestProfileLifecycle(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	userID, err := store.CreateGuest(ctx)
	if err != nil {
		t.Fatal(err)
	}

	profile, err := store.GetUserProfile(ctx, userID)
	if err != nil {
		t.Fatal(err)
	}
	if !profile.IsGuest {
		t.Fatal("new profile should be guest")
	}
	if profile.Theme != "system" {
		t.Fatalf("unexpected default theme: %q", profile.Theme)
	}

	name := " Даниил "
	city := "spb"
	theme := "dark"
	updated, err := store.PatchUserProfile(ctx, userID, UserProfilePatch{
		DisplayName: &name,
		HomeCity:    &city,
		Theme:       &theme,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.DisplayName != "Даниил" {
		t.Fatalf("expected trimmed name, got %q", updated.DisplayName)
	}
	if updated.HomeCity != "spb" || updated.Theme != "dark" {
		t.Fatalf("unexpected updated profile: %#v", updated)
	}
}

func TestProfileRejectsInvalidFields(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	userID, err := store.CreateGuest(ctx)
	if err != nil {
		t.Fatal(err)
	}

	badCity := "paris"
	if _, err := store.PatchUserProfile(ctx, userID, UserProfilePatch{
		HomeCity: &badCity,
	}); !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("expected invalid profile error, got %v", err)
	}

	badTheme := "neon"
	if _, err := store.PatchUserProfile(ctx, userID, UserProfilePatch{
		Theme: &badTheme,
	}); !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("expected invalid theme error, got %v", err)
	}

	badAvatar := "javascript:alert(1)"
	if _, err := store.PatchUserProfile(ctx, userID, UserProfilePatch{
		AvatarURL: &badAvatar,
	}); !errors.Is(err, ErrInvalidProfile) {
		t.Fatalf("expected invalid avatar error, got %v", err)
	}
}

func TestProfileMissingUser(t *testing.T) {
	store := NewMemoryStore()
	if _, err := store.GetUserProfile(context.Background(), "missing"); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("expected user not found, got %v", err)
	}
}
