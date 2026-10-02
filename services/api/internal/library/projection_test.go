package library

import (
	"context"
	"encoding/json"
	"testing"
)

func TestApplyCloudDeltaProjectsPlacesAndCollections(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	first := json.RawMessage(`{
		"selected_city":"spb",
		"saved_spots":[
			{
				"id":"sp_1",
				"name":"Birch",
				"category":"restaurant",
				"categoryLabel":"Ресторан",
				"city":"spb",
				"cityLabel":"Санкт-Петербург",
				"address":"Кирочная, 3",
				"latitude":59.9449,
				"longitude":30.3596,
				"rating":4.8,
				"reviewCount":128,
				"openingHours":{
					"is24x7":false,
					"days":{"mon":[{"from":"09:00","to":"23:00"}]}
				},
				"description":"Авторский ресторан",
				"status":"want",
				"favorite":true,
				"note":"ужин"
			}
		],
		"collections":[
			{
				"id":"col_weekend",
				"title":"Выходные",
				"subtitle":"Куда сходить",
				"city":"spb",
				"cityLabel":"Санкт-Петербург",
				"placeIds":["sp_1"]
			}
		]
	}`)

	if err := ApplyCloudDelta(ctx, store, "u1", nil, first); err != nil {
		t.Fatal(err)
	}

	places, err := store.ListPlaces(ctx, "u1", PlaceFilters{})
	if err != nil {
		t.Fatal(err)
	}
	if len(places) != 1 || places[0].ID != "sp_1" || !places[0].IsFavorite {
		t.Fatalf("unexpected places: %#v", places)
	}
	if places[0].ReviewCount != 128 || places[0].OpeningHours == nil {
		t.Fatalf("expected enriched metadata to be projected: %#v", places[0])
	}
	if got := places[0].OpeningHours.Days["mon"]; len(got) != 1 || got[0].From != "09:00" || got[0].To != "23:00" {
		t.Fatalf("unexpected projected hours: %#v", got)
	}
	if places[0].Description != "Авторский ресторан" {
		t.Fatalf("unexpected projected description: %q", places[0].Description)
	}

	collection, err := store.GetCollection(ctx, "u1", "col_weekend")
	if err != nil {
		t.Fatal(err)
	}
	if len(collection.PlaceIDs) != 1 || collection.PlaceIDs[0] != "sp_1" {
		t.Fatalf("unexpected collection: %#v", collection)
	}

	second := json.RawMessage(`{
		"selected_city":"spb",
		"saved_spots":[
			{
				"id":"sp_1",
				"name":"Birch",
				"category":"restaurant",
				"categoryLabel":"Ресторан",
				"city":"spb",
				"cityLabel":"Санкт-Петербург",
				"address":"Кирочная, 3",
				"latitude":59.9449,
				"longitude":30.3596,
				"rating":4.8,
				"status":"visited",
				"favorite":false,
				"note":"был"
			},
			{
				"id":"sp_2",
				"name":"Coffee",
				"category":"coffee",
				"categoryLabel":"Кофейня",
				"city":"spb",
				"cityLabel":"Санкт-Петербург",
				"address":"Невский",
				"latitude":59.9343,
				"longitude":30.3351,
				"rating":4.7,
				"status":"want"
			}
		],
		"collections":[
			{
				"id":"col_weekend",
				"title":"Выходные 2.0",
				"subtitle":"Обновлено",
				"city":"spb",
				"cityLabel":"Санкт-Петербург",
				"placeIds":["sp_2"]
			}
		]
	}`)

	if err := ApplyCloudDelta(ctx, store, "u1", first, second); err != nil {
		t.Fatal(err)
	}

	places, err = store.ListPlaces(ctx, "u1", PlaceFilters{})
	if err != nil {
		t.Fatal(err)
	}
	if len(places) != 2 {
		t.Fatalf("expected 2 places, got %#v", places)
	}

	collection, err = store.GetCollection(ctx, "u1", "col_weekend")
	if err != nil {
		t.Fatal(err)
	}
	if collection.Title != "Выходные 2.0" || len(collection.PlaceIDs) != 1 || collection.PlaceIDs[0] != "sp_2" {
		t.Fatalf("unexpected updated collection: %#v", collection)
	}
}

func TestApplyCloudDeltaDeletesRemovedRecords(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	before := json.RawMessage(`{
		"saved_spots":[
			{
				"id":"sp_1",
				"name":"Demo",
				"category":"restaurant",
				"categoryLabel":"Ресторан",
				"city":"spb",
				"cityLabel":"Санкт-Петербург",
				"address":"Test",
				"latitude":59.94,
				"longitude":30.31,
				"rating":4.8,
				"status":"want"
			}
		],
		"collections":[
			{
				"id":"col_1",
				"title":"Demo",
				"subtitle":"Demo",
				"city":"both",
				"placeIds":["sp_1"]
			}
		]
	}`)

	after := json.RawMessage(`{
		"saved_spots":[],
		"collections":[]
	}`)

	if err := ApplyCloudDelta(ctx, store, "u1", nil, before); err != nil {
		t.Fatal(err)
	}
	if err := ApplyCloudDelta(ctx, store, "u1", before, after); err != nil {
		t.Fatal(err)
	}

	places, _ := store.ListPlaces(ctx, "u1", PlaceFilters{})
	collections, _ := store.ListCollections(ctx, "u1")
	if len(places) != 0 || len(collections) != 0 {
		t.Fatalf("expected empty library, places=%#v collections=%#v", places, collections)
	}
}
