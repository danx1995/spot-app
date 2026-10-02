package resolver

import (
	"context"
	"strings"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
	"github.com/danx1995/spot-app/services/api/internal/provider/twogis"
)

type Resolver struct {
	twoGIS *twogis.Client
}

func New(twoGIS *twogis.Client) *Resolver {
	return &Resolver{twoGIS: twoGIS}
}

func (r *Resolver) Search(ctx context.Context, query, city, category string) ([]catalog.Place, error) {
	local := catalog.SearchPlaces(query, city, category)
	if strings.TrimSpace(query) == "" || len(local) >= 5 || r.twoGIS == nil || !r.twoGIS.Enabled() {
		return local, nil
	}

	remote, err := r.twoGIS.Search(ctx, query, city)
	if err != nil {
		// Search must remain usable if the external provider is temporarily unavailable.
		return local, nil
	}

	seen := make(map[string]struct{}, len(local)+len(remote))
	out := make([]catalog.Place, 0, len(local)+len(remote))

	appendPlace := func(place catalog.Place) {
		if category != "" && place.Category != category {
			return
		}
		key := strings.ToLower(strings.TrimSpace(place.Name)) + "|" + strings.ToLower(strings.TrimSpace(place.Address))
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
	return out, nil
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

	remote, err := r.twoGIS.SearchAt(ctx, query, city, lat, lon)
	if err != nil {
		return local, nil
	}

	seen := make(map[string]struct{}, len(remote))
	out := make([]catalog.Place, 0, len(remote))
	for _, place := range remote {
		if category != "" && place.Category != category {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(place.Name)) + "|" + strings.ToLower(strings.TrimSpace(place.Address))
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, place)
	}

	if len(out) == 0 {
		return local, nil
	}
	if len(out) > 20 {
		out = out[:20]
	}
	return out, nil
}
