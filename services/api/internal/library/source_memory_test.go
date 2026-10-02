package library

import (
	"context"
	"strings"
	"testing"
)

func TestMemoryStorePersistsSourceMemory(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	saved, err := store.UpsertPlace(ctx, "u1", SavePlaceInput{
		Place: Place{
			ID:            "sp_source_memory",
			Name:          "Birch",
			Category:      "restaurant",
			CategoryLabel: "Ресторан",
			City:          "spb",
			CityLabel:     "Санкт-Петербург",
			Address:       "Кирочная, 3",
			Latitude:      59.9449,
			Longitude:     30.3596,
		},
		Status:        "want",
		SourceType:    "instagram",
		SourceURL:     "https://instagram.com/reel/demo",
		SourceTitle:   "Birch on Instagram",
		SourceExcerpt: "Тартар, интерьер и десерт.",
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.SourceTitle != "Birch on Instagram" || saved.SourceExcerpt == "" {
		t.Fatalf("source memory was not saved: %#v", saved)
	}

	title := "Обновлённый заголовок"
	excerpt := "Новый публичный контекст"
	patched, err := store.PatchPlace(ctx, "u1", saved.ID, PlacePatch{
		SourceTitle:   &title,
		SourceExcerpt: &excerpt,
	})
	if err != nil {
		t.Fatal(err)
	}
	if patched.SourceTitle != title || patched.SourceExcerpt != excerpt {
		t.Fatalf("source memory was not patched: %#v", patched)
	}
}

func TestSourceMemoryLengthIsBounded(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	_, err := store.UpsertPlace(ctx, "u1", SavePlaceInput{
		Place: Place{
			ID:            "sp_source_too_long",
			Name:          "Demo",
			Category:      "other",
			CategoryLabel: "Место",
			City:          "moscow",
			CityLabel:     "Москва",
			Latitude:      55.75,
			Longitude:     37.61,
		},
		Status:        "want",
		SourceExcerpt: strings.Repeat("я", 1001),
	})
	if err != ErrInvalidInput {
		t.Fatalf("expected ErrInvalidInput for oversized source excerpt, got %v", err)
	}
}
