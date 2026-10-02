package resolver

import (
	"testing"
	"time"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

func TestSearchCacheExpiresEntries(t *testing.T) {
	cache := newSearchCache(time.Minute, 10)
	now := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	cache.now = func() time.Time { return now }

	cache.Set("one", []catalog.Place{{ID: "sp_1"}})
	if places, ok := cache.Get("one"); !ok || len(places) != 1 {
		t.Fatalf("expected cache hit, got ok=%v places=%#v", ok, places)
	}

	now = now.Add(61 * time.Second)
	if _, ok := cache.Get("one"); ok {
		t.Fatal("expected expired entry to miss")
	}
}

func TestSearchCacheIsBounded(t *testing.T) {
	cache := newSearchCache(time.Minute, 2)
	now := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	cache.now = func() time.Time { return now }

	cache.Set("one", []catalog.Place{{ID: "sp_1"}})
	now = now.Add(time.Second)
	cache.Set("two", []catalog.Place{{ID: "sp_2"}})
	now = now.Add(time.Second)
	cache.Set("three", []catalog.Place{{ID: "sp_3"}})

	if _, ok := cache.Get("one"); ok {
		t.Fatal("expected oldest entry to be evicted")
	}
	if _, ok := cache.Get("two"); !ok {
		t.Fatal("expected second entry to remain")
	}
	if _, ok := cache.Get("three"); !ok {
		t.Fatal("expected newest entry to remain")
	}
}

func TestSearchKeysNormalizeAndBucketCoordinates(t *testing.T) {
	first := searchAtKey("  КОФЕЙНЯ ", "spb", "coffee", 59.93861, 30.31414)
	second := searchAtKey("кофейня", "SPB", "COFFEE", 59.93864, 30.31411)
	if first != second {
		t.Fatalf("expected nearby equivalent requests to share cache key: %q != %q", first, second)
	}

	if searchKey("  Birch  ", "SPB", "") != searchKey("birch", "spb", "") {
		t.Fatal("expected text search keys to normalize")
	}
}
