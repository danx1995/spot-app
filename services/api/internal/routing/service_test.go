package routing

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/danx1995/spot-app/services/api/internal/provider/twogis"
)

type fakeProvider struct {
	enabled bool
	calls   int
	legs    []twogis.RouteLeg
	err     error
}

func (f *fakeProvider) Enabled() bool {
	return f.enabled
}

func (f *fakeProvider) RoutePairs(
	_ context.Context,
	pairs []twogis.RoutePair,
	_ string,
) ([]twogis.RouteLeg, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	if len(f.legs) > 0 {
		return append([]twogis.RouteLeg(nil), f.legs...), nil
	}

	out := make([]twogis.RouteLeg, len(pairs))
	for index := range pairs {
		out[index] = twogis.RouteLeg{
			DistanceMeters:  1000 + index,
			DurationSeconds: 700 + index,
			Status:          "OK",
			Reliability:     1,
		}
	}
	return out, nil
}

func testPoints() []Point {
	return []Point{
		{Latitude: 59.9386, Longitude: 30.3141},
		{Latitude: 59.944, Longitude: 30.33},
		{Latitude: 59.95, Longitude: 30.35},
	}
}

func TestBuildUsesProviderAndCachesLegs(t *testing.T) {
	provider := &fakeProvider{enabled: true}
	service := New(provider)
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return now }

	first, err := service.Build(context.Background(), testPoints(), "walking")
	if err != nil {
		t.Fatal(err)
	}
	if first.Source != "2gis" {
		t.Fatalf("expected 2gis source, got %q", first.Source)
	}
	if provider.calls != 1 {
		t.Fatalf("expected one provider call, got %d", provider.calls)
	}
	if first.TotalDistanceMeters != 2001 {
		t.Fatalf("unexpected total distance: %d", first.TotalDistanceMeters)
	}

	second, err := service.Build(context.Background(), testPoints(), "walking")
	if err != nil {
		t.Fatal(err)
	}
	if second.Source != "2gis" {
		t.Fatalf("expected cached 2gis source, got %q", second.Source)
	}
	if provider.calls != 1 {
		t.Fatalf("cache should avoid second provider call, got %d", provider.calls)
	}
}

func TestBuildFallsBackToEstimate(t *testing.T) {
	provider := &fakeProvider{enabled: true, err: errors.New("routing unavailable")}
	service := New(provider)

	summary, err := service.Build(context.Background(), testPoints(), "walking")
	if err != nil {
		t.Fatal(err)
	}
	if summary.Source != "estimate" {
		t.Fatalf("expected estimate source, got %q", summary.Source)
	}
	if summary.TotalDistanceMeters <= 0 || summary.TotalDurationSeconds <= 0 {
		t.Fatalf("expected positive fallback summary: %#v", summary)
	}
}

func TestBuildRejectsInvalidInput(t *testing.T) {
	service := New(nil)

	if _, err := service.Build(context.Background(), []Point{{Latitude: 59, Longitude: 30}}, "walking"); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected invalid input for one point, got %v", err)
	}
	if _, err := service.Build(context.Background(), testPoints(), "flying"); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected invalid transport, got %v", err)
	}
	if _, err := service.Build(context.Background(), []Point{
		{Latitude: 95, Longitude: 30},
		{Latitude: 59, Longitude: 30},
	}, "walking"); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected invalid coordinates, got %v", err)
	}
}
