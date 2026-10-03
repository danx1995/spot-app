package catalogstore

import (
	"context"
	"math"
	"sort"
	"strings"
	"sync"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

type MemoryStore struct {
	mu     sync.RWMutex
	places map[string]catalog.Place
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{places: make(map[string]catalog.Place)}
}

func (s *MemoryStore) Upsert(_ context.Context, places []catalog.Place) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, place := range places {
		if strings.TrimSpace(place.ID) == "" {
			continue
		}
		s.places[place.ID] = place
	}
	return nil
}

func (s *MemoryStore) Search(_ context.Context, query, city, category string, page, pageSize int) ([]catalog.Place, error) {
	page, pageSize = normalizePage(page, pageSize)
	result := s.filtered(query, city, category)

	sort.Slice(result, func(i, j int) bool {
		if result[i].Rating == result[j].Rating {
			if result[i].ReviewCount == result[j].ReviewCount {
				return result[i].Name < result[j].Name
			}
			return result[i].ReviewCount > result[j].ReviewCount
		}
		return result[i].Rating > result[j].Rating
	})

	return pagePlaces(result, page, pageSize), nil
}

func (s *MemoryStore) SearchAt(_ context.Context, query, city, category string, lat, lng float64, page, pageSize int) ([]catalog.Place, error) {
	page, pageSize = normalizePage(page, pageSize)
	result := s.filtered(query, city, category)

	for i := range result {
		result[i].DistanceMeters = haversineMeters(lat, lng, result[i].Latitude, result[i].Longitude)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].DistanceMeters == result[j].DistanceMeters {
			if result[i].Rating == result[j].Rating {
				if result[i].ReviewCount == result[j].ReviewCount {
					return result[i].Name < result[j].Name
				}
				return result[i].ReviewCount > result[j].ReviewCount
			}
			return result[i].Rating > result[j].Rating
		}
		return result[i].DistanceMeters < result[j].DistanceMeters
	})

	return pagePlaces(result, page, pageSize), nil
}

func (s *MemoryStore) filtered(query, city, category string) []catalog.Place {
	q := strings.ToLower(strings.TrimSpace(query))

	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]catalog.Place, 0)
	for _, place := range s.places {
		if city != "" && place.City != city {
			continue
		}
		if category != "" && place.Category != category {
			continue
		}
		if q != "" {
			haystack := strings.ToLower(place.Name + " " + place.Address + " " + place.CategoryLabel)
			if !strings.Contains(haystack, q) {
				continue
			}
		}
		result = append(result, place)
	}
	return result
}

func pagePlaces(result []catalog.Place, page, pageSize int) []catalog.Place {
	start := (page - 1) * pageSize
	if start >= len(result) {
		return []catalog.Place{}
	}
	end := start + pageSize
	if end > len(result) {
		end = len(result)
	}
	return append([]catalog.Place(nil), result[start:end]...)
}

func haversineMeters(lat1, lng1, lat2, lng2 float64) int {
	const earthRadius = 6371000.0
	phi1 := lat1 * math.Pi / 180
	phi2 := lat2 * math.Pi / 180
	deltaPhi := (lat2 - lat1) * math.Pi / 180
	deltaLambda := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(deltaPhi/2)*math.Sin(deltaPhi/2) +
		math.Cos(phi1)*math.Cos(phi2)*math.Sin(deltaLambda/2)*math.Sin(deltaLambda/2)
	return int(math.Round(2 * earthRadius * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))))
}

func (s *MemoryStore) Find(_ context.Context, id string) (catalog.Place, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	place, ok := s.places[strings.TrimSpace(id)]
	return place, ok, nil
}

func (s *MemoryStore) Mode() string { return "memory" }
func (s *MemoryStore) Close()       {}
