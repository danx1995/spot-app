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
		ID: "sp_demo",
		Name: "Demo",
		City: city,
		CityLabel: "Санкт-Петербург",
		Category: "restaurant",
		CategoryLabel: "Ресторан",
		Latitude: 59.9,
		Longitude: 30.3,
	}, nil
}

func TestResolveDirectTwoGISFirm(t *testing.T) {
	provider := &fakeTwoGIS{enabled: true}
	resolver := New(provider)

	result, err := resolver.Resolve(
		context.Background(),
		"https://2gis.ru/spb/firm/70000001012345678",
		"spb",
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

func TestInstagramNeedsContextWithoutFetching(t *testing.T) {
	resolver := New(nil)

	result, err := resolver.Resolve(
		context.Background(),
		"https://www.instagram.com/reel/abc123/",
		"spb",
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
}

func TestRejectJavascriptScheme(t *testing.T) {
	resolver := New(nil)
	if _, err := resolver.Resolve(context.Background(), "javascript:alert(1)", "spb"); err == nil {
		t.Fatal("expected unsupported scheme error")
	}
}
