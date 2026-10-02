package importer

import (
	"context"
	"testing"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

type fakeTwoGIS struct {
	enabled bool
	id      string
}

func (f *fakeTwoGIS) Enabled() bool { return f.enabled }

func (f *fakeTwoGIS) LookupByID(_ context.Context, providerID, city string) (catalog.Place, error) {
	f.id = providerID
	return catalog.Place{
		ID:            "sp_demo",
		Name:          "Demo",
		City:          city,
		CityLabel:     "Санкт-Петербург",
		Category:      "restaurant",
		CategoryLabel: "Ресторан",
		Latitude:      59.9,
		Longitude:     30.3,
	}, nil
}

type fakeSearcher struct {
	query string
	city  string
}

func (f *fakeSearcher) Search(_ context.Context, query, city, _ string) ([]catalog.Place, error) {
	f.query = query
	f.city = city
	return []catalog.Place{
		{
			ID:            "sp_birch",
			Name:          "Birch",
			City:          city,
			CityLabel:     "Санкт-Петербург",
			Category:      "restaurant",
			CategoryLabel: "Ресторан",
			Latitude:      59.9449,
			Longitude:     30.3596,
		},
	}, nil
}

func TestResolveDirectTwoGISFirm(t *testing.T) {
	provider := &fakeTwoGIS{enabled: true}
	resolver := New(provider, nil)

	result, err := resolver.Resolve(
		context.Background(),
		"https://2gis.ru/spb/firm/70000001012345678",
		"spb",
		"",
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "resolved" || result.Place == nil {
		t.Fatalf("expected resolved place, got %#v", result)
	}
	if provider.id != "70000001012345678" {
		t.Fatalf("unexpected provider id: %s", provider.id)
	}
}

func TestInstagramHintSuggestsCandidates(t *testing.T) {
	searcher := &fakeSearcher{}
	resolver := New(nil, searcher)

	result, err := resolver.Resolve(
		context.Background(),
		"https://www.instagram.com/reel/abc123/",
		"spb",
		"Birch https://www.instagram.com/reel/abc123/",
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "needs_context" {
		t.Fatalf("expected needs_context, got %s", result.Status)
	}
	if result.Platform != "instagram" {
		t.Fatalf("expected instagram, got %s", result.Platform)
	}
	if result.SuggestedQuery != "Birch" {
		t.Fatalf("unexpected suggested query: %q", result.SuggestedQuery)
	}
	if searcher.query != "Birch" || searcher.city != "spb" {
		t.Fatalf("unexpected search: query=%q city=%q", searcher.query, searcher.city)
	}
	if len(result.Candidates) != 1 || result.Candidates[0].Name != "Birch" {
		t.Fatalf("unexpected candidates: %#v", result.Candidates)
	}
}

func TestYandexOrgSlugBecomesSuggestion(t *testing.T) {
	searcher := &fakeSearcher{}
	resolver := New(nil, searcher)

	result, err := resolver.Resolve(
		context.Background(),
		"https://yandex.ru/maps/org/birch_restaurant/123456789/",
		"spb",
		"",
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.SuggestedQuery != "birch restaurant" {
		t.Fatalf("unexpected query: %q", result.SuggestedQuery)
	}
	if len(result.Candidates) != 1 {
		t.Fatalf("expected candidates, got %#v", result.Candidates)
	}
}

func TestInstagramNeedsContextWithoutHint(t *testing.T) {
	resolver := New(nil, nil)

	result, err := resolver.Resolve(
		context.Background(),
		"https://www.instagram.com/reel/abc123/",
		"spb",
		"",
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "needs_context" {
		t.Fatalf("expected needs_context, got %s", result.Status)
	}
	if result.Platform != "instagram" {
		t.Fatalf("expected instagram, got %s", result.Platform)
	}
	if len(result.Candidates) != 0 {
		t.Fatalf("expected no candidates, got %#v", result.Candidates)
	}
}

func TestRejectJavascriptScheme(t *testing.T) {
	resolver := New(nil, nil)
	if _, err := resolver.Resolve(context.Background(), "javascript:alert(1)", "spb", ""); err == nil {
		t.Fatal("expected unsupported scheme error")
	}
}
