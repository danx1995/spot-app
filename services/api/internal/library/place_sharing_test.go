package library

import (
	"context"
	"errors"
	"testing"
)

func TestPlaceShareRequiresSavedOwnershipAndHidesPrivateFields(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	saved, err := store.UpsertPlace(ctx, "user-1", SavePlaceInput{
		Place: Place{
			ID:            "dg_7000000001",
			Name:          "Demo Cafe",
			Category:      "coffee",
			CategoryLabel: "Кофейня",
			City:          "spb",
			CityLabel:     "Санкт-Петербург",
			Address:       "Невский проспект, 1",
			Latitude:      59.93,
			Longitude:     30.32,
			Rating:        4.8,
		},
		Status:     "want",
		Note:       "личная заметка",
		SourceType: "instagram",
		SourceURL:  "https://instagram.com/example",
		IsFavorite: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	shared, err := store.PublishPlace(ctx, "user-1", saved.ID)
	if err != nil {
		t.Fatal(err)
	}
	if shared.ShareID == "" {
		t.Fatal("expected opaque share id")
	}

	public, err := store.GetSharedPlace(ctx, shared.ShareID)
	if err != nil {
		t.Fatal(err)
	}
	if public.Place.ID != saved.ID || public.Place.Name != saved.Name {
		t.Fatalf("unexpected public place: %#v", public)
	}

	if _, err := store.PublishPlace(ctx, "user-2", saved.ID); !errors.Is(err, ErrPlaceNotSaved) {
		t.Fatalf("expected ownership check, got %v", err)
	}
}

func TestPlaceShareIsStableForSameUserAndPlace(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	_, err := store.UpsertPlace(ctx, "user-1", SavePlaceInput{
		Place: Place{
			ID:            "dg_7000000002",
			Name:          "Demo Hotel",
			Category:      "hotel",
			CategoryLabel: "Отель",
			City:          "moscow",
			CityLabel:     "Москва",
			Address:       "Тверская, 1",
			Latitude:      55.75,
			Longitude:     37.61,
		},
		Status: "want",
	})
	if err != nil {
		t.Fatal(err)
	}

	first, err := store.PublishPlace(ctx, "user-1", "dg_7000000002")
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.PublishPlace(ctx, "user-1", "dg_7000000002")
	if err != nil {
		t.Fatal(err)
	}
	if first.ShareID != second.ShareID {
		t.Fatalf("expected stable share link, got %q and %q", first.ShareID, second.ShareID)
	}
}
