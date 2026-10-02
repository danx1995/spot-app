package catalog

import "testing"

func TestSearchPlaces(t *testing.T) {
	got := SearchPlaces("birch", "spb", "")
	if len(got) != 1 {
		t.Fatalf("expected 1 place, got %d", len(got))
	}
	if got[0].ID != "sp_birch_demo" {
		t.Fatalf("expected Birch demo place, got %s", got[0].ID)
	}
}

func TestSearchPlacesByCategory(t *testing.T) {
	got := SearchPlaces("", "spb", "hotel")
	if len(got) != 1 {
		t.Fatalf("expected 1 hotel, got %d", len(got))
	}
	if got[0].Category != "hotel" {
		t.Fatalf("expected hotel category, got %s", got[0].Category)
	}
}

func TestFindPlaceMissing(t *testing.T) {
	if _, ok := FindPlace("missing"); ok {
		t.Fatal("expected missing place to return false")
	}
}
