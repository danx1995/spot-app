package catalogstore

import (
	"context"
	"testing"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

func TestMemoryStoreUpsertSearchAndFind(t *testing.T) {
	store := NewMemoryStore()
	ctx := context.Background()

	places := []catalog.Place{
		{
			ID:            "sp_one",
			Name:          "Alpha Coffee",
			Category:      "coffee",
			CategoryLabel: "Кофейня",
			City:          "spb",
			CityLabel:     "Санкт-Петербург",
			Address:       "Невский проспект, 1",
			Latitude:      59.93,
			Longitude:     30.31,
			Rating:        4.8,
			ReviewCount:   120,
		},
		{
			ID:            "sp_two",
			Name:          "Beta Bar",
			Category:      "bar",
			CategoryLabel: "Бар",
			City:          "spb",
			CityLabel:     "Санкт-Петербург",
			Address:       "Литейный проспект, 2",
			Latitude:      59.94,
			Longitude:     30.35,
			Rating:        4.7,
			ReviewCount:   90,
		},
	}

	if err := store.Upsert(ctx, places); err != nil {
		t.Fatal(err)
	}

	got, err := store.Search(ctx, "coffee", "spb", "coffee", 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ID != "sp_one" {
		t.Fatalf("unexpected search result: %#v", got)
	}

	found, ok, err := store.Find(ctx, "sp_two")
	if err != nil {
		t.Fatal(err)
	}
	if !ok || found.Name != "Beta Bar" {
		t.Fatalf("unexpected find result: ok=%v place=%#v", ok, found)
	}
}

func TestMemoryStorePaginatesByRating(t *testing.T) {
	store := NewMemoryStore()
	ctx := context.Background()

	if err := store.Upsert(ctx, []catalog.Place{
		{ID: "a", Name: "A", City: "moscow", Category: "restaurant", Rating: 4.1},
		{ID: "b", Name: "B", City: "moscow", Category: "restaurant", Rating: 4.9},
		{ID: "c", Name: "C", City: "moscow", Category: "restaurant", Rating: 4.5},
	}); err != nil {
		t.Fatal(err)
	}

	page1, err := store.Search(ctx, "", "moscow", "restaurant", 1, 2)
	if err != nil {
		t.Fatal(err)
	}
	page2, err := store.Search(ctx, "", "moscow", "restaurant", 2, 2)
	if err != nil {
		t.Fatal(err)
	}

	if len(page1) != 2 || page1[0].ID != "b" || page1[1].ID != "c" {
		t.Fatalf("unexpected page1: %#v", page1)
	}
	if len(page2) != 1 || page2[0].ID != "a" {
		t.Fatalf("unexpected page2: %#v", page2)
	}
}

func TestMemoryStoreSearchAtRanksNearest(t *testing.T) {
	store := NewMemoryStore()
	ctx := context.Background()

	if err := store.Upsert(ctx, []catalog.Place{
		{ID: "near", Name: "Near", City: "spb", Category: "coffee", Latitude: 59.9387, Longitude: 30.3142},
		{ID: "far", Name: "Far", City: "spb", Category: "coffee", Latitude: 59.99, Longitude: 30.40},
	}); err != nil {
		t.Fatal(err)
	}

	got, err := store.SearchAt(ctx, "", "spb", "coffee", 59.9386, 30.3141, 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].ID != "near" || got[0].DistanceMeters <= 0 {
		t.Fatalf("unexpected proximity search result: %#v", got)
	}
	if got[1].DistanceMeters <= got[0].DistanceMeters {
		t.Fatalf("distance order is not ascending: %#v", got)
	}
}
