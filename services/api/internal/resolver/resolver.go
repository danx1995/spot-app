package resolver

import (
	"context"
	"strings"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
	"github.com/danx1995/spot-app/services/api/internal/provider/twogis"
)

const (
	defaultSearchCacheTTL = 2 * time.Minute
	defaultSearchCacheMax = 2048
)

type Resolver struct {
	twoGIS *twogis.Client
	cache  *searchCache
	group  singleflight.Group
}

func New(twoGIS *twogis.Client) *Resolver {
	return &Resolver{
		twoGIS: twoGIS,
		cache:  newSearchCache(defaultSearchCacheTTL, defaultSearchCacheMax),
	}
}

func (r *Resolver) Search(ctx context.Context, query, city, category string) ([]catalog.Place, error) {
	local := catalog.SearchPlaces(query, city, category)
	if strings.TrimSpace(query) == "" || len(local) >= 5 || r.twoGIS == nil || !r.twoGIS.Enabled() {
		return local, nil
	}

	key := searchKey(query, city, category)
	if cached, ok := r.cache.Get(key); ok {
		return cached, nil
	}

	value, err, _ := r.group.Do(key, func() (any, error) {
		if cached, ok := r.cache.Get(key); ok {
			return cached, nil
		}

		remote, remoteErr := r.twoGIS.Search(ctx, query, city)
		if remoteErr != nil {
			// Keep the UI usable, but do not cache provider failures so a later
			// request can recover immediately.
			return local, nil
		}

		out := mergeSearchPlaces(local, remote, category)
		r.cache.Set(key, out)
		return out, nil
	})
	if err != nil {
		return nil, err
	}

	return clonePlaces(value.([]catalog.Place)), nil
}

func (r *Resolver) SearchAt(
	ctx context.Context,
	query, city, category string,
	lat, lon float64,
) ([]catalog.Place, error) {
	local := catalog.SearchPlaces(query, city, category)
	if strings.TrimSpace(query) == "" || r.twoGIS == nil || !r.twoGIS.Enabled() {
		return local, nil
	}

	key := searchAtKey(query, city, category, lat, lon)
	if cached, ok := r.cache.Get(key); ok {
		return cached, nil
	}

	value, err, _ := r.group.Do(key, func() (any, error) {
		if cached, ok := r.cache.Get(key); ok {
			return cached, nil
		}

		remote, remoteErr := r.twoGIS.SearchAt(ctx, query, city, lat, lon)
		if remoteErr != nil {
			return local, nil
		}

		out := filterSearchPlaces(remote, category)
		if len(out) == 0 {
			out = local
		}
		if len(out) > 20 {
			out = out[:20]
		}

		r.cache.Set(key, out)
		return out, nil
	})
	if err != nil {
		return nil, err
	}

	return clonePlaces(value.([]catalog.Place)), nil
}

func mergeSearchPlaces(local, remote []catalog.Place, category string) []catalog.Place {
	seen := make(map[string]struct{}, len(local)+len(remote))
	out := make([]catalog.Place, 0, len(local)+len(remote))

	appendPlace := func(place catalog.Place) {
		if category != "" && place.Category != category {
			return
		}
		key := placeDedupeKey(place)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		out = append(out, place)
	}

	for _, place := range local {
		appendPlace(place)
	}
	for _, place := range remote {
		appendPlace(place)
	}

	if len(out) > 20 {
		out = out[:20]
	}
	return out
}

func filterSearchPlaces(places []catalog.Place, category string) []catalog.Place {
	seen := make(map[string]struct{}, len(places))
	out := make([]catalog.Place, 0, len(places))

	for _, place := range places {
		if category != "" && place.Category != category {
			continue
		}

		key := placeDedupeKey(place)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, place)
	}

	return out
}

func placeDedupeKey(place catalog.Place) string {
	return strings.ToLower(strings.TrimSpace(place.Name)) +
		"|" +
		strings.ToLower(strings.TrimSpace(place.Address))
}
