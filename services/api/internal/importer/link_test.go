package importer

import (
	"context"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

type fakeTwoGIS struct {
	enabled bool
	id      string
	city    string
}

func (f *fakeTwoGIS) Enabled() bool { return f.enabled }

func (f *fakeTwoGIS) LookupByID(_ context.Context, providerID, city string) (catalog.Place, error) {
	f.id = providerID
	f.city = city
	label := "Санкт-Петербург"
	if city == "moscow" {
		label = "Москва"
	}
	return catalog.Place{
		ID:            "sp_demo",
		Name:          "Demo",
		City:          city,
		CityLabel:     label,
		Category:      "restaurant",
		CategoryLabel: "Ресторан",
		Latitude:      59.9,
		Longitude:     30.3,
	}, nil
}

type searchCall struct {
	query string
	city  string
}

type fakeMetadataFetcher struct {
	metadata PageMetadata
	err      error
	calls    int
}

func (f *fakeMetadataFetcher) Fetch(_ context.Context, _ *url.URL, _ string) (PageMetadata, error) {
	f.calls++
	return f.metadata, f.err
}

type fakeSearcher struct {
	mu      sync.Mutex
	calls   []searchCall
	byCity  map[string][]catalog.Place
}

func (f *fakeSearcher) Search(_ context.Context, query, city, _ string) ([]catalog.Place, error) {
	f.mu.Lock()
	f.calls = append(f.calls, searchCall{query: query, city: city})
	f.mu.Unlock()

	if f.byCity != nil {
		return append([]catalog.Place(nil), f.byCity[city]...), nil
	}

	label := "Санкт-Петербург"
	if city == "moscow" {
		label = "Москва"
	}
	return []catalog.Place{
		{
			ID:            "sp_birch_" + city,
			Name:          "Birch",
			City:          city,
			CityLabel:     label,
			Category:      "restaurant",
			CategoryLabel: "Ресторан",
			Latitude:      59.9449,
			Longitude:     30.3596,
		},
	}, nil
}

func (f *fakeSearcher) hasCall(query, city string) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, call := range f.calls {
		if call.query == query && call.city == city {
			return true
		}
	}
	return false
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
	if provider.city != "spb" {
		t.Fatalf("unexpected lookup city: %s", provider.city)
	}
}

func TestTwoGISLinkOverridesSelectedCity(t *testing.T) {
	provider := &fakeTwoGIS{enabled: true}
	resolver := New(provider, nil)

	result, err := resolver.Resolve(
		context.Background(),
		"https://2gis.ru/moscow/firm/70000001012345678",
		"spb",
		"",
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.Place == nil || result.Place.City != "moscow" {
		t.Fatalf("expected Moscow place, got %#v", result.Place)
	}
	if result.SuggestedCity != "moscow" {
		t.Fatalf("expected Moscow city suggestion, got %q", result.SuggestedCity)
	}
}

func TestInstagramHintSearchesBothCities(t *testing.T) {
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
	if !searcher.hasCall("Birch", "spb") || !searcher.hasCall("Birch", "moscow") {
		t.Fatalf("expected both city searches, calls=%#v", searcher.calls)
	}
	if len(result.Candidates) == 0 {
		t.Fatal("expected candidates")
	}
}

func TestExplicitMoscowHintPrioritizesMoscow(t *testing.T) {
	searcher := &fakeSearcher{
		byCity: map[string][]catalog.Place{
			"spb": {
				{
					ID: "sp_other",
					Name: "Birch Cafe",
					City: "spb",
					CityLabel: "Санкт-Петербург",
					Category: "restaurant",
					CategoryLabel: "Ресторан",
				},
			},
			"moscow": {
				{
					ID: "sp_target",
					Name: "Birch",
					City: "moscow",
					CityLabel: "Москва",
					Category: "restaurant",
					CategoryLabel: "Ресторан",
				},
			},
		},
	}
	resolver := New(nil, searcher)

	result, err := resolver.Resolve(
		context.Background(),
		"https://www.instagram.com/reel/abc123/",
		"spb",
		"Birch Москва",
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Candidates) == 0 || result.Candidates[0].City != "moscow" {
		t.Fatalf("expected Moscow first, got %#v", result.Candidates)
	}
	if result.SuggestedCity != "moscow" {
		t.Fatalf("expected suggested city Moscow, got %q", result.SuggestedCity)
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
	if len(result.Candidates) == 0 {
		t.Fatalf("expected candidates, got %#v", result.Candidates)
	}
}

func TestInstagramNeedsContextWithoutHintWhenMetadataUnavailable(t *testing.T) {
	resolver := NewWithMetadata(nil, nil, &fakeMetadataFetcher{})

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

func TestInstagramMetadataFindsCandidatesWithoutManualHint(t *testing.T) {
	searcher := &fakeSearcher{
		byCity: map[string][]catalog.Place{
			"spb": {
				{
					ID:            "sp_birch_spb",
					Name:          "Birch",
					City:          "spb",
					CityLabel:     "Санкт-Петербург",
					Category:      "restaurant",
					CategoryLabel: "Ресторан",
					Address:       "Кирочная улица, 3",
				},
			},
			"moscow": {},
		},
	}
	metadata := &fakeMetadataFetcher{
		metadata: PageMetadata{
			Title:       "Birch on Instagram",
			Description: "Birch, Кирочная улица 3. Петербург. Сохрани, чтобы не потерять.",
		},
	}
	resolver := NewWithMetadata(nil, searcher, metadata)

	result, err := resolver.Resolve(
		context.Background(),
		"https://www.instagram.com/reel/abc123/",
		"spb",
		"",
	)
	if err != nil {
		t.Fatal(err)
	}
	if metadata.calls != 1 {
		t.Fatalf("expected one metadata fetch, got %d", metadata.calls)
	}
	if result.SuggestedQuery == "" {
		t.Fatal("expected query extracted from page metadata")
	}
	if result.SourceTitle != "Birch" {
		t.Fatalf("expected cleaned source title, got %q", result.SourceTitle)
	}
	if result.SourceExcerpt == "" || !strings.Contains(result.SourceExcerpt, "Кирочная") {
		t.Fatalf("expected source excerpt, got %q", result.SourceExcerpt)
	}
	if len(result.Candidates) == 0 || result.Candidates[0].Name != "Birch" {
		t.Fatalf("expected Birch candidate, got %#v", result.Candidates)
	}
	if !strings.Contains(result.Message, "прочитал данные страницы") {
		t.Fatalf("unexpected message: %q", result.Message)
	}
}

func TestManualHintSkipsMetadataFetch(t *testing.T) {
	metadata := &fakeMetadataFetcher{
		metadata: PageMetadata{
			Title: "Wrong place",
		},
	}
	searcher := &fakeSearcher{}
	resolver := NewWithMetadata(nil, searcher, metadata)

	result, err := resolver.Resolve(
		context.Background(),
		"https://www.tiktok.com/@creator/video/123",
		"spb",
		"Birch",
	)
	if err != nil {
		t.Fatal(err)
	}
	if metadata.calls != 0 {
		t.Fatalf("manual share hint should win without page fetch, calls=%d", metadata.calls)
	}
	if result.SuggestedQuery != "Birch" {
		t.Fatalf("unexpected query: %q", result.SuggestedQuery)
	}
	if result.SourceExcerpt != "Birch" {
		t.Fatalf("expected share hint to be remembered as source excerpt, got %q", result.SourceExcerpt)
	}
}

func TestRejectJavascriptScheme(t *testing.T) {
	resolver := New(nil, nil)
	if _, err := resolver.Resolve(context.Background(), "javascript:alert(1)", "spb", ""); err == nil {
		t.Fatal("expected unsupported scheme error")
	}
}


type listSearcher struct{}

func (s *listSearcher) Search(_ context.Context, query, city, _ string) ([]catalog.Place, error) {
	label := "Санкт-Петербург"
	if city == "moscow" {
		label = "Москва"
	}

	lower := strings.ToLower(query)
	switch {
	case strings.Contains(lower, "birch"):
		return []catalog.Place{{
			ID:            "sp_birch_" + city,
			Name:          "Birch",
			City:          city,
			CityLabel:     label,
			Category:      "restaurant",
			CategoryLabel: "Ресторан",
			Address:       "Кирочная улица, 3",
		}}, nil
	case strings.Contains(lower, "aster"):
		return []catalog.Place{{
			ID:            "sp_aster_" + city,
			Name:          "Aster",
			City:          city,
			CityLabel:     label,
			Category:      "coffee",
			CategoryLabel: "Кофейня",
			Address:       "Улица Маяковского, 23",
		}}, nil
	case strings.Contains(lower, "noor"):
		return []catalog.Place{{
			ID:            "sp_noor_" + city,
			Name:          "Noor",
			City:          city,
			CityLabel:     label,
			Category:      "bar",
			CategoryLabel: "Бар",
			Address:       "Тверская улица, 23",
		}}, nil
	default:
		return nil, nil
	}
}

func TestPlaceQueriesFromNumberedCaption(t *testing.T) {
	queries := placeQueriesFromText("5 мест в Петербурге: 1. Birch — Кирочная 3 2. Aster — Маяковского 23 3. Noor — бар")
	if len(queries) != 3 {
		t.Fatalf("expected 3 list queries, got %#v", queries)
	}
	if !strings.Contains(strings.ToLower(queries[0]), "birch") {
		t.Fatalf("expected Birch first, got %#v", queries)
	}
	if !strings.Contains(strings.ToLower(queries[1]), "aster") {
		t.Fatalf("expected Aster second, got %#v", queries)
	}
	if !strings.Contains(strings.ToLower(queries[2]), "noor") {
		t.Fatalf("expected Noor third, got %#v", queries)
	}
}

func TestPlaceQueriesIgnoreOrdinarySentence(t *testing.T) {
	queries := placeQueriesFromText("Birch — ресторан на Кирочной улице, который хочется попробовать вечером.")
	if len(queries) != 0 {
		t.Fatalf("ordinary caption must not become multi-place list: %#v", queries)
	}
}

func TestInstagramNumberedCaptionResolvesMultiplePlaces(t *testing.T) {
	resolver := NewWithMetadata(nil, &listSearcher{}, &fakeMetadataFetcher{})

	result, err := resolver.Resolve(
		context.Background(),
		"https://www.instagram.com/reel/abc123/",
		"spb",
		"1. Birch — Кирочная 3 2. Aster — Маяковского 23 3. Noor — Тверская 23",
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Detected) != 3 {
		t.Fatalf("expected 3 detected places, got %#v", result.Detected)
	}
	if len(result.Candidates) != 3 {
		t.Fatalf("expected one compatibility candidate per detected place, got %#v", result.Candidates)
	}
	if result.Detected[0].Candidates[0].Name != "Birch" {
		t.Fatalf("unexpected first detection: %#v", result.Detected[0])
	}
	if result.Detected[1].Candidates[0].Name != "Aster" {
		t.Fatalf("unexpected second detection: %#v", result.Detected[1])
	}
	if result.Detected[2].Candidates[0].Name != "Noor" {
		t.Fatalf("unexpected third detection: %#v", result.Detected[2])
	}
	if !strings.Contains(result.Message, "3 мест") {
		t.Fatalf("unexpected multi-place message: %q", result.Message)
	}
}

func TestDuplicateTopMatchesDoNotFakeMultiPlaceResult(t *testing.T) {
	resolver := NewWithMetadata(nil, &fakeSearcher{}, &fakeMetadataFetcher{})

	result, err := resolver.Resolve(
		context.Background(),
		"https://www.instagram.com/reel/abc123/",
		"spb",
		"1. Birch 2. Birch restaurant",
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Detected) != 0 {
		t.Fatalf("duplicate place must not become multi import: %#v", result.Detected)
	}
}
