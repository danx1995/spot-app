package library

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestSharedCollectionRequiresSharedVisibility(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	_, err := store.UpsertPlace(ctx, "u1", SavePlaceInput{
		Place: Place{
			ID:            "sp_1",
			Name:          "Birch",
			Category:      "restaurant",
			CategoryLabel: "Ресторан",
			City:          "spb",
			CityLabel:     "Санкт-Петербург",
			Address:       "Кирочная, 3",
			Latitude:      59.9449,
			Longitude:     30.3596,
		},
		Status: "want",
		Note:   "private note",
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = store.CreateCollection(ctx, "u1", CreateCollectionInput{
		ID:          "col_share",
		Title:       "Выходные",
		Description: "Мои места",
		City:        "spb",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.SetCollectionPlace(ctx, "u1", "col_share", "sp_1", true); err != nil {
		t.Fatal(err)
	}

	if _, err := store.GetSharedCollection(ctx, "col_share"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("private collection should not be public, got %v", err)
	}

	visibility := "shared"
	if _, err := store.PatchCollection(ctx, "u1", "col_share", CollectionPatch{
		Visibility: &visibility,
	}); err != nil {
		t.Fatal(err)
	}

	shared, err := store.GetSharedCollection(ctx, "col_share")
	if err != nil {
		t.Fatal(err)
	}
	if shared.Collection.Title != "Выходные" || len(shared.Places) != 1 {
		t.Fatalf("unexpected shared payload: %#v", shared)
	}
	if shared.Places[0].Name != "Birch" {
		t.Fatalf("unexpected public place: %#v", shared.Places[0])
	}
}

func TestCloudProjectionPreservesSharedVisibility(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	first := json.RawMessage(`{
		"saved_spots":[],
		"collections":[
			{
				"id":"col_share",
				"title":"Выходные",
				"subtitle":"Первая версия",
				"city":"spb",
				"placeIds":[]
			}
		]
	}`)

	if err := ApplyCloudDelta(ctx, store, "u1", nil, first); err != nil {
		t.Fatal(err)
	}

	visibility := "shared"
	if _, err := store.PatchCollection(ctx, "u1", "col_share", CollectionPatch{
		Visibility: &visibility,
	}); err != nil {
		t.Fatal(err)
	}

	second := json.RawMessage(`{
		"saved_spots":[],
		"collections":[
			{
				"id":"col_share",
				"title":"Выходные 2.0",
				"subtitle":"Обновлено",
				"city":"spb",
				"placeIds":[]
			}
		]
	}`)

	if err := ApplyCloudDelta(ctx, store, "u1", first, second); err != nil {
		t.Fatal(err)
	}

	collection, err := store.GetCollection(ctx, "u1", "col_share")
	if err != nil {
		t.Fatal(err)
	}
	if collection.Visibility != "shared" {
		t.Fatalf("expected shared visibility to survive projection, got %q", collection.Visibility)
	}
	if collection.Title != "Выходные 2.0" {
		t.Fatalf("expected metadata update, got %#v", collection)
	}
}
