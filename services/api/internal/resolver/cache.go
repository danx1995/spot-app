package resolver

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

type cacheEntry struct {
	places    []catalog.Place
	expiresAt time.Time
}

type searchCache struct {
	mu      sync.Mutex
	entries map[string]cacheEntry
	ttl     time.Duration
	max     int
	now     func() time.Time
}

func newSearchCache(ttl time.Duration, max int) *searchCache {
	if max < 1 {
		max = 1
	}
	return &searchCache{
		entries: make(map[string]cacheEntry),
		ttl:     ttl,
		max:     max,
		now:     time.Now,
	}
}

func (c *searchCache) Get(key string) ([]catalog.Place, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, ok := c.entries[key]
	if !ok {
		return nil, false
	}
	if !entry.expiresAt.After(c.now()) {
		delete(c.entries, key)
		return nil, false
	}
	return clonePlaces(entry.places), true
}

func (c *searchCache) Set(key string, places []catalog.Place) {
	if c.ttl <= 0 {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	for existingKey, entry := range c.entries {
		if !entry.expiresAt.After(now) {
			delete(c.entries, existingKey)
		}
	}

	if _, exists := c.entries[key]; !exists && len(c.entries) >= c.max {
		var oldestKey string
		var oldestExpiry time.Time
		for existingKey, entry := range c.entries {
			if oldestKey == "" || entry.expiresAt.Before(oldestExpiry) {
				oldestKey = existingKey
				oldestExpiry = entry.expiresAt
			}
		}
		if oldestKey != "" {
			delete(c.entries, oldestKey)
		}
	}

	c.entries[key] = cacheEntry{
		places:    clonePlaces(places),
		expiresAt: now.Add(c.ttl),
	}
}

func searchKey(query, city, category string) string {
	return searchPageKey(query, city, category, 1)
}

func searchPageKey(query, city, category string, page int) string {
	return fmt.Sprintf(
		"city|%s|%s|%s|p%d",
		normalizeKeyPart(city),
		normalizeKeyPart(category),
		normalizeKeyPart(query),
		page,
	)
}

func searchAtKey(query, city, category string, lat, lon float64) string {
	return searchAtPageKey(query, city, category, lat, lon, 1)
}

func searchAtPageKey(query, city, category string, lat, lon float64, page int) string {
	return fmt.Sprintf(
		"map|%s|%s|%s|%.3f|%.3f|p%d",
		normalizeKeyPart(city),
		normalizeKeyPart(category),
		normalizeKeyPart(query),
		lat,
		lon,
		page,
	)
}

func normalizeKeyPart(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}

func clonePlaces(places []catalog.Place) []catalog.Place {
	return append([]catalog.Place(nil), places...)
}
