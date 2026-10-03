package resolver

import (
	"context"
	"strings"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
	"github.com/danx1995/spot-app/services/api/internal/catalogstore"
	"github.com/danx1995/spot-app/services/api/internal/provider/twogis"
)

const (
	defaultSearchCacheTTL = 2 * time.Minute
	defaultSearchCacheMax = 2048
)

type Resolver struct {
	twoGIS *twogis.Client
	store  catalogstore.Store
	cache  *searchCache
	group  singleflight.Group
}

func New(twoGIS *twogis.Client) *Resolver {
	return NewWithStore(twoGIS, catalogstore.NewMemoryStore())
}

func NewWithStore(twoGIS *twogis.Client, store catalogstore.Store) *Resolver {
	if store == nil {
		store = catalogstore.NewMemoryStore()
	}
	return &Resolver{
		twoGIS: twoGIS,
		store:  store,
		cache:  newSearchCache(defaultSearchCacheTTL, defaultSearchCacheMax),
	}
}

func (r *Resolver) Find(ctx context.Context, id string) (catalog.Place, bool, error) {
	if place, ok := catalog.FindPlace(id); ok {
		return place, true, nil
	}
	if r.store == nil {
		return catalog.Place{}, false, nil
	}
	return r.store.Find(ctx, id)
}

func (r *Resolver) Search(ctx context.Context, query, city, category string) ([]catalog.Place, error) {
	return r.SearchPage(ctx, query, city, category, 1)
}

func (r *Resolver) SearchPage(
	ctx context.Context,
	query, city, category string,
	page int,
) ([]catalog.Place, error) {
	if page < 1 {
		page = 1
	}

	remoteQuery := strings.TrimSpace(query)
	providerPage := page
	if remoteQuery == "" {
		if category == "" {
			var discoveryCategory string
			discoveryCategory, providerPage = mixedDiscoveryPage(page)
			remoteQuery = categoryDiscoveryQuery(discoveryCategory)
		} else {
			remoteQuery, providerPage = categoryDiscoveryPage(category, page)
		}
	}

	builtIn := []catalog.Place{}
	if page == 1 {
		builtIn = catalog.SearchPlaces(query, city, category)
	}
	stored := []catalog.Place{}
	if r.store != nil {
		if cachedPlaces, storeErr := r.store.Search(ctx, query, city, category, page, 20); storeErr == nil {
			stored = cachedPlaces
		}
	}
	base := mergeSearchPlaces(builtIn, stored, category)
	if remoteQuery == "" || r.twoGIS == nil || !r.twoGIS.Enabled() {
		return base, nil
	}

	key := searchPageKey(remoteQuery, city, category, page)
	if cached, ok := r.cache.Get(key); ok {
		return cached, nil
	}

	value, err, _ := r.group.Do(key, func() (any, error) {
		if cached, ok := r.cache.Get(key); ok {
			return cached, nil
		}

		remote, remoteErr := r.twoGIS.SearchPage(ctx, remoteQuery, city, providerPage)
		if remoteErr != nil {
			return base, nil
		}

		if r.store != nil {
			_ = r.store.Upsert(ctx, remote)
		}

		out := mergeSearchPlaces(base, remote, category)
		if len(out) > 50 {
			out = out[:50]
		}
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
	return r.SearchAtPage(ctx, query, city, category, lat, lon, 1)
}

func (r *Resolver) SearchAtPage(
	ctx context.Context,
	query, city, category string,
	lat, lon float64,
	page int,
) ([]catalog.Place, error) {
	if page < 1 {
		page = 1
	}

	remoteQuery := strings.TrimSpace(query)
	providerPage := page
	if remoteQuery == "" {
		if category == "" {
			var discoveryCategory string
			discoveryCategory, providerPage = mixedDiscoveryPage(page)
			remoteQuery = categoryDiscoveryQuery(discoveryCategory)
		} else {
			remoteQuery, providerPage = categoryDiscoveryPage(category, page)
		}
	}

	builtIn := []catalog.Place{}
	if page == 1 {
		builtIn = catalog.SearchPlaces(query, city, category)
	}
	stored := []catalog.Place{}
	if r.store != nil {
		if cachedPlaces, storeErr := r.store.Search(ctx, query, city, category, page, 20); storeErr == nil {
			stored = cachedPlaces
		}
	}
	base := mergeSearchPlaces(builtIn, stored, category)
	if remoteQuery == "" || r.twoGIS == nil || !r.twoGIS.Enabled() {
		return base, nil
	}

	key := searchAtPageKey(remoteQuery, city, category, lat, lon, page)
	if cached, ok := r.cache.Get(key); ok {
		return cached, nil
	}

	value, err, _ := r.group.Do(key, func() (any, error) {
		if cached, ok := r.cache.Get(key); ok {
			return cached, nil
		}

		remote, remoteErr := r.twoGIS.SearchAtPage(ctx, remoteQuery, city, lat, lon, providerPage)
		if remoteErr != nil {
			return base, nil
		}

		if r.store != nil {
			_ = r.store.Upsert(ctx, remote)
		}

		out := mergeSearchPlaces(base, remote, category)
		if len(out) > 50 {
			out = out[:50]
		}

		r.cache.Set(key, out)
		return out, nil
	})
	if err != nil {
		return nil, err
	}

	return clonePlaces(value.([]catalog.Place)), nil
}

func mixedDiscoveryPage(page int) (string, int) {
	categories := []string{"restaurant", "coffee", "bar", "hotel", "culture", "entertainment", "shop", "park"}
	if page < 1 {
		page = 1
	}
	index := (page - 1) % len(categories)
	providerPage := ((page - 1) / len(categories)) + 1
	return categories[index], providerPage
}

func categoryDiscoveryPage(category string, page int) (string, int) {
	queries := map[string][]string{
		"restaurant":    {"рестораны", "кафе", "пекарни", "столовые", "пиццерии"},
		"coffee":        {"кофейни"},
		"bar":           {"бары", "пабы", "винные бары"},
		"hotel":         {"отели", "гостиницы", "хостелы"},
		"culture":       {"музеи", "театры", "галереи", "выставочные центры", "библиотеки"},
		"entertainment": {"развлечения", "кинотеатры", "боулинг", "квесты", "караоке"},
		"shop":          {"магазины", "торговые центры", "бутики"},
		"park":          {"парки", "скверы", "сады", "достопримечательности", "смотровые площадки"},
	}

	variants := queries[category]
	if len(variants) == 0 {
		return "", page
	}
	if page < 1 {
		page = 1
	}

	index := (page - 1) % len(variants)
	providerPage := ((page - 1) / len(variants)) + 1
	return variants[index], providerPage
}

func categoryDiscoveryQuery(category string) string {
	query, _ := categoryDiscoveryPage(category, 1)
	return query
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

	if len(out) > 50 {
		out = out[:50]
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
