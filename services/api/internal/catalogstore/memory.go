package catalogstore

import (
	"context"
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

	sort.Slice(result, func(i, j int) bool {
		if result[i].Rating == result[j].Rating {
			if result[i].ReviewCount == result[j].ReviewCount {
				return result[i].Name < result[j].Name
			}
			return result[i].ReviewCount > result[j].ReviewCount
		}
		return result[i].Rating > result[j].Rating
	})

	start := (page - 1) * pageSize
	if start >= len(result) {
		return []catalog.Place{}, nil
	}
	end := start + pageSize
	if end > len(result) {
		end = len(result)
	}
	return append([]catalog.Place(nil), result[start:end]...), nil
}

func (s *MemoryStore) Find(_ context.Context, id string) (catalog.Place, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	place, ok := s.places[strings.TrimSpace(id)]
	return place, ok, nil
}

func (s *MemoryStore) Mode() string { return "memory" }
func (s *MemoryStore) Close()       {}
