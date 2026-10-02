package library

import (
	"context"
	"errors"
	"testing"
)

func demoInput(id string, lat, lng float64) SavePlaceInput {
	return SavePlaceInput{
		Place: Place{
			ID:            id,
			Name:          "Demo",
			Category:      "restaurant",
			CategoryLabel: "Ресторан",
			City:          "spb",
			CityLabel:     "Санкт-Петербург",
			Address:       "Test",
			Latitude:      lat,
			Longitude:     lng,
			Rating:        4.8,
		},
		Status: "want",
	}
}

func TestMemoryStorePlaceLifecycle(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	saved, err := store.UpsertPlace(ctx, "u1", demoInput("sp_1", 59.94, 30.31))
	if err != nil {
		t.Fatal(err)
	}
	if saved.Status != "want" {
		t.Fatalf("expected want, got %s", saved.Status)
	}

	note := "Хочу сюда вечером"
	status := "visited"
	updated, err := store.PatchPlace(ctx, "u1", "sp_1", PlacePatch{Note: &note, Status: &status})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Note != note || updated.VisitedAt == nil {
		t.Fatalf("unexpected updated place: %#v", updated)
	}

	if err := store.DeletePlace(ctx, "u1", "sp_1"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.PatchPlace(ctx, "u1", "sp_1", PlacePatch{}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestMemoryStoreNearbyOrdersByDistance(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	_, _ = store.UpsertPlace(ctx, "u1", demoInput("near", 59.9387, 30.3142))
	_, _ = store.UpsertPlace(ctx, "u1", demoInput("far", 59.95, 30.33))

	got, err := store.NearbyPlaces(ctx, "u1", NearbyQuery{
		Latitude: 59.9386, Longitude: 30.3141, RadiusM: 5000, Limit: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].ID != "near" {
		t.Fatalf("expected nearest first, got %#v", got)
	}
}

func TestMemoryStoreCollectionRequiresSavedPlace(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	collection, err := store.CreateCollection(ctx, "u1", CreateCollectionInput{Title: "Свидания"})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := store.SetCollectionPlace(ctx, "u1", collection.ID, "missing", true); !errors.Is(err, ErrPlaceNotSaved) {
		t.Fatalf("expected place not saved, got %v", err)
	}

	_, _ = store.UpsertPlace(ctx, "u1", demoInput("sp_1", 59.94, 30.31))
	collection, err = store.SetCollectionPlace(ctx, "u1", collection.ID, "sp_1", true)
	if err != nil {
		t.Fatal(err)
	}
	if len(collection.PlaceIDs) != 1 || collection.PlaceIDs[0] != "sp_1" {
		t.Fatalf("unexpected collection: %#v", collection)
	}
}
