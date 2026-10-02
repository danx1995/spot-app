package library

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestRouteCollectionMetadataRoundTrip(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	plan := &RoutePlan{
		Kind:        "route",
		Transport:   "walking",
		StartPreset: "evening",
		StopMinutes: 45,
		StartMode:   "current_location",
	}
	created, err := store.CreateCollection(ctx, "u1", CreateCollectionInput{
		ID:          "col_route_meta",
		Title:       "Маршрут по Петербургу",
		Description: "Вечерний маршрут",
		City:        "spb",
		RoutePlan:   plan,
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.RoutePlan == nil || created.RoutePlan.Transport != "walking" {
		t.Fatalf("route plan was not stored: %#v", created)
	}

	// Returned values must be cloned so a caller cannot mutate store state.
	created.RoutePlan.Transport = "driving"
	loaded, err := store.GetCollection(ctx, "u1", "col_route_meta")
	if err != nil {
		t.Fatal(err)
	}
	if loaded.RoutePlan == nil || loaded.RoutePlan.Transport != "walking" {
		t.Fatalf("route plan should be cloned: %#v", loaded.RoutePlan)
	}

	visibility := "shared"
	if _, err := store.PatchCollection(ctx, "u1", "col_route_meta", CollectionPatch{
		Visibility: &visibility,
	}); err != nil {
		t.Fatal(err)
	}
	shared, err := store.GetSharedCollection(ctx, "col_route_meta")
	if err != nil {
		t.Fatal(err)
	}
	if shared.Collection.RoutePlan == nil ||
		shared.Collection.RoutePlan.StartMode != "current_location" ||
		shared.Collection.RoutePlan.StopMinutes != 45 {
		t.Fatalf("shared route metadata lost: %#v", shared.Collection.RoutePlan)
	}
}

func TestRouteCollectionRejectsInvalidMetadata(t *testing.T) {
	store := NewMemoryStore()
	_, err := store.CreateCollection(context.Background(), "u1", CreateCollectionInput{
		Title: "Broken route",
		RoutePlan: &RoutePlan{
			Kind:        "route",
			Transport:   "helicopter",
			StartPreset: "now",
			StopMinutes: 45,
			StartMode:   "first_stop",
		},
	})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected invalid route plan, got %v", err)
	}
}

func TestCloudProjectionProjectsRoutePlan(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	state := json.RawMessage(`{
		"saved_spots":[],
		"collections":[
			{
				"id":"col_route",
				"title":"Маршрут",
				"subtitle":"Сохранённый маршрут",
				"city":"spb",
				"cityLabel":"Санкт-Петербург",
				"placeIds":[],
				"routePlan":{
					"kind":"route",
					"transport":"driving",
					"startPreset":"tomorrow",
					"stopMinutes":60,
					"startMode":"first_stop"
				}
			}
		]
	}`)

	if err := ApplyCloudDelta(ctx, store, "u1", nil, state); err != nil {
		t.Fatal(err)
	}

	collection, err := store.GetCollection(ctx, "u1", "col_route")
	if err != nil {
		t.Fatal(err)
	}
	if collection.RoutePlan == nil {
		t.Fatal("expected projected route plan")
	}
	if collection.RoutePlan.Transport != "driving" ||
		collection.RoutePlan.StartPreset != "tomorrow" ||
		collection.RoutePlan.StopMinutes != 60 ||
		collection.RoutePlan.StartMode != "first_stop" {
		t.Fatalf("unexpected route plan: %#v", collection.RoutePlan)
	}
}
