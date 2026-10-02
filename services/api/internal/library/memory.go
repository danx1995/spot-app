package library

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"
)

type memoryPlaceShare struct {
	userID  string
	placeID string
}

type MemoryStore struct {
	mu          sync.RWMutex
	places      map[string]map[string]SavedPlace
	collections map[string]map[string]Collection
	placeShares map[string]memoryPlaceShare
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		places:      make(map[string]map[string]SavedPlace),
		collections: make(map[string]map[string]Collection),
		placeShares: make(map[string]memoryPlaceShare),
	}
}

func (s *MemoryStore) UpsertPlace(_ context.Context, userID string, input SavePlaceInput) (SavedPlace, error) {
	if err := validateSavePlace(input); err != nil {
		return SavedPlace{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.places[userID] == nil {
		s.places[userID] = make(map[string]SavedPlace)
	}

	now := time.Now().UTC()
	status := normalizeStatus(input.Status)
	current, exists := s.places[userID][input.ID]
	savedAt := now
	var visitedAt *time.Time
	if exists {
		savedAt = current.SavedAt
		visitedAt = current.VisitedAt
	}
	if status == "visited" && visitedAt == nil {
		value := now
		visitedAt = &value
	}

	result := SavedPlace{
		Place:       input.Place,
		Status:      status,
		Note:        strings.TrimSpace(input.Note),
		SourceType:  strings.TrimSpace(input.SourceType),
		SourceURL:   strings.TrimSpace(input.SourceURL),
		IsFavorite:  input.IsFavorite,
		SavedAt:     savedAt,
		VisitedAt:   visitedAt,
		UpdatedAt:   now,
	}
	s.places[userID][input.ID] = result
	return result, nil
}

func (s *MemoryStore) ListPlaces(_ context.Context, userID string, filters PlaceFilters) ([]SavedPlace, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	limit := normalizeLimit(filters.Limit, 50, 100)
	result := make([]SavedPlace, 0)

	for _, place := range s.places[userID] {
		if filters.City != "" && place.City != filters.City {
			continue
		}
		if filters.Status != "" && place.Status != filters.Status {
			continue
		}
		if filters.Before != nil && !place.SavedAt.Before(*filters.Before) {
			continue
		}
		result = append(result, place)
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].SavedAt.Equal(result[j].SavedAt) {
			return result[i].ID > result[j].ID
		}
		return result[i].SavedAt.After(result[j].SavedAt)
	})

	if len(result) > limit {
		result = result[:limit]
	}
	return result, nil
}

func (s *MemoryStore) NearbyPlaces(_ context.Context, userID string, query NearbyQuery) ([]SavedPlace, error) {
	if !validCoordinate(query.Latitude, query.Longitude) {
		return nil, ErrInvalidInput
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	radius := query.RadiusM
	if radius <= 0 {
		radius = 2000
	}
	if radius > 50000 {
		radius = 50000
	}
	limit := normalizeLimit(query.Limit, 50, 100)

	result := make([]SavedPlace, 0)
	for _, place := range s.places[userID] {
		distance := haversineMeters(query.Latitude, query.Longitude, place.Latitude, place.Longitude)
		if distance > radius {
			continue
		}
		value := distance
		place.DistanceM = &value
		result = append(result, place)
	}

	sort.Slice(result, func(i, j int) bool {
		return *result[i].DistanceM < *result[j].DistanceM
	})
	if len(result) > limit {
		result = result[:limit]
	}
	return result, nil
}

func (s *MemoryStore) PatchPlace(_ context.Context, userID, placeID string, patch PlacePatch) (SavedPlace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	place, ok := s.places[userID][placeID]
	if !ok {
		return SavedPlace{}, ErrNotFound
	}

	if patch.Status != nil {
		status := normalizeStatus(*patch.Status)
		if status == "" {
			return SavedPlace{}, ErrInvalidInput
		}
		place.Status = status
		if status == "visited" && place.VisitedAt == nil {
			now := time.Now().UTC()
			place.VisitedAt = &now
		}
	}
	if patch.Note != nil {
		place.Note = strings.TrimSpace(*patch.Note)
	}
	if patch.SourceType != nil {
		place.SourceType = strings.TrimSpace(*patch.SourceType)
	}
	if patch.SourceURL != nil {
		place.SourceURL = strings.TrimSpace(*patch.SourceURL)
	}
	if patch.IsFavorite != nil {
		place.IsFavorite = *patch.IsFavorite
	}
	place.UpdatedAt = time.Now().UTC()
	s.places[userID][placeID] = place
	return place, nil
}

func (s *MemoryStore) DeletePlace(_ context.Context, userID, placeID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.places[userID][placeID]; !ok {
		return ErrNotFound
	}
	delete(s.places[userID], placeID)

	for id, collection := range s.collections[userID] {
		collection.PlaceIDs = removeString(collection.PlaceIDs, placeID)
		collection.UpdatedAt = time.Now().UTC()
		s.collections[userID][id] = collection
	}
	return nil
}

func (s *MemoryStore) PublishPlace(_ context.Context, userID, placeID string) (SharedPlace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	saved, ok := s.places[userID][placeID]
	if !ok {
		return SharedPlace{}, ErrPlaceNotSaved
	}

	for shareID, share := range s.placeShares {
		if share.userID == userID && share.placeID == placeID {
			return SharedPlace{
				ShareID: shareID,
				Place:   saved.Place,
			}, nil
		}
	}

	shareID, err := newShareID()
	if err != nil {
		return SharedPlace{}, err
	}
	s.placeShares[shareID] = memoryPlaceShare{
		userID:  userID,
		placeID: placeID,
	}

	return SharedPlace{
		ShareID: shareID,
		Place:   saved.Place,
	}, nil
}

func (s *MemoryStore) GetSharedPlace(_ context.Context, shareID string) (SharedPlace, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	share, ok := s.placeShares[strings.TrimSpace(shareID)]
	if !ok {
		return SharedPlace{}, ErrNotFound
	}

	saved, ok := s.places[share.userID][share.placeID]
	if !ok {
		return SharedPlace{}, ErrNotFound
	}

	return SharedPlace{
		ShareID: strings.TrimSpace(shareID),
		Place:   saved.Place,
	}, nil
}

func (s *MemoryStore) CreateCollection(_ context.Context, userID string, input CreateCollectionInput) (Collection, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" || len([]rune(title)) > 120 {
		return Collection{}, ErrInvalidInput
	}
	visibility := normalizeVisibility(input.Visibility)
	if visibility == "" {
		return Collection{}, ErrInvalidInput
	}
	if input.City != "" && input.City != "spb" && input.City != "moscow" {
		return Collection{}, ErrInvalidInput
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.collections[userID] == nil {
		s.collections[userID] = make(map[string]Collection)
	}
	now := time.Now().UTC()
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = newPublicID("col")
	} else if !validPublicID(id) {
		return Collection{}, ErrInvalidInput
	}

	createdAt := now
	placeIDs := []string{}
	if existing, ok := s.collections[userID][id]; ok {
		createdAt = existing.CreatedAt
		placeIDs = append([]string(nil), existing.PlaceIDs...)
	}

	collection := Collection{
		ID:          id,
		Title:       title,
		Description: strings.TrimSpace(input.Description),
		City:        input.City,
		CityLabel:   cityLabel(input.City),
		Visibility:  visibility,
		CoverURL:    strings.TrimSpace(input.CoverURL),
		PlaceIDs:    placeIDs,
		CreatedAt:   createdAt,
		UpdatedAt:   now,
	}
	s.collections[userID][id] = collection
	return collection, nil
}

func (s *MemoryStore) ListCollections(_ context.Context, userID string) ([]Collection, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]Collection, 0, len(s.collections[userID]))
	for _, collection := range s.collections[userID] {
		result = append(result, cloneCollection(collection))
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.After(result[j].CreatedAt)
	})
	return result, nil
}

func (s *MemoryStore) GetCollection(_ context.Context, userID, collectionID string) (Collection, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	collection, ok := s.collections[userID][collectionID]
	if !ok {
		return Collection{}, ErrNotFound
	}
	return cloneCollection(collection), nil
}

func (s *MemoryStore) GetSharedCollection(_ context.Context, collectionID string) (SharedCollection, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for userID, collections := range s.collections {
		collection, ok := collections[collectionID]
		if !ok || (collection.Visibility != "shared" && collection.Visibility != "public") {
			continue
		}

		places := make([]Place, 0, len(collection.PlaceIDs))
		for _, placeID := range collection.PlaceIDs {
			saved, exists := s.places[userID][placeID]
			if !exists {
				continue
			}
			places = append(places, saved.Place)
		}

		return SharedCollection{
			Collection: cloneCollection(collection),
			Places:     places,
		}, nil
	}

	return SharedCollection{}, ErrNotFound
}

func (s *MemoryStore) PatchCollection(_ context.Context, userID, collectionID string, patch CollectionPatch) (Collection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	collection, ok := s.collections[userID][collectionID]
	if !ok {
		return Collection{}, ErrNotFound
	}

	if patch.Title != nil {
		title := strings.TrimSpace(*patch.Title)
		if title == "" || len([]rune(title)) > 120 {
			return Collection{}, ErrInvalidInput
		}
		collection.Title = title
	}
	if patch.Description != nil {
		collection.Description = strings.TrimSpace(*patch.Description)
	}
	if patch.City != nil {
		if *patch.City != "" && *patch.City != "spb" && *patch.City != "moscow" {
			return Collection{}, ErrInvalidInput
		}
		collection.City = *patch.City
		collection.CityLabel = cityLabel(*patch.City)
	}
	if patch.Visibility != nil {
		visibility := normalizeVisibility(*patch.Visibility)
		if visibility == "" {
			return Collection{}, ErrInvalidInput
		}
		collection.Visibility = visibility
	}
	if patch.CoverURL != nil {
		collection.CoverURL = strings.TrimSpace(*patch.CoverURL)
	}
	collection.UpdatedAt = time.Now().UTC()
	s.collections[userID][collectionID] = collection
	return cloneCollection(collection), nil
}

func (s *MemoryStore) DeleteCollection(_ context.Context, userID, collectionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.collections[userID][collectionID]; !ok {
		return ErrNotFound
	}
	delete(s.collections[userID], collectionID)
	return nil
}

func (s *MemoryStore) SetCollectionPlace(_ context.Context, userID, collectionID, placeID string, add bool) (Collection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	collection, ok := s.collections[userID][collectionID]
	if !ok {
		return Collection{}, ErrNotFound
	}
	if _, ok := s.places[userID][placeID]; !ok {
		return Collection{}, ErrPlaceNotSaved
	}

	if add {
		if !containsString(collection.PlaceIDs, placeID) {
			collection.PlaceIDs = append(collection.PlaceIDs, placeID)
		}
	} else {
		collection.PlaceIDs = removeString(collection.PlaceIDs, placeID)
	}
	collection.UpdatedAt = time.Now().UTC()
	s.collections[userID][collectionID] = collection
	return cloneCollection(collection), nil
}

func (s *MemoryStore) Mode() string { return "memory" }
func (s *MemoryStore) Close()       {}

func validateSavePlace(input SavePlaceInput) error {
	if strings.TrimSpace(input.ID) == "" ||
		strings.TrimSpace(input.Name) == "" ||
		(input.City != "spb" && input.City != "moscow") ||
		!validCoordinate(input.Latitude, input.Longitude) ||
		normalizeStatus(input.Status) == "" {
		return ErrInvalidInput
	}
	return nil
}

func validPublicID(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 128 {
		return false
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '_' || r == '-' || r == '.' {
			continue
		}
		return false
	}
	return true
}

func normalizeStatus(status string) string {
	if status == "" {
		return "want"
	}
	switch status {
	case "want", "visited", "booked":
		return status
	default:
		return ""
	}
}

func normalizeVisibility(visibility string) string {
	if visibility == "" {
		return "private"
	}
	switch visibility {
	case "private", "shared", "public":
		return visibility
	default:
		return ""
	}
}

func normalizeLimit(value, fallback, max int) int {
	if value <= 0 {
		return fallback
	}
	if value > max {
		return max
	}
	return value
}

func validCoordinate(lat, lng float64) bool {
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

func cityLabel(city string) string {
	switch city {
	case "spb":
		return "Санкт-Петербург"
	case "moscow":
		return "Москва"
	default:
		return ""
	}
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func removeString(values []string, value string) []string {
	out := make([]string, 0, len(values))
	for _, candidate := range values {
		if candidate != value {
			out = append(out, candidate)
		}
	}
	return out
}

func newShareID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return "ps_" + hex.EncodeToString(raw[:]), nil
}

func newPublicID(prefix string) string {
	return fmt.Sprintf("%s_%d", prefix, time.Now().UTC().UnixNano())
}

func cloneCollection(collection Collection) Collection {
	collection.PlaceIDs = append([]string(nil), collection.PlaceIDs...)
	return collection
}

func haversineMeters(lat1, lng1, lat2, lng2 float64) int {
	const earthRadius = 6371000.0
	toRad := func(value float64) float64 { return value * math.Pi / 180 }

	phi1 := toRad(lat1)
	phi2 := toRad(lat2)
	dPhi := toRad(lat2 - lat1)
	dLambda := toRad(lng2 - lng1)

	a := math.Sin(dPhi/2)*math.Sin(dPhi/2) +
		math.Cos(phi1)*math.Cos(phi2)*math.Sin(dLambda/2)*math.Sin(dLambda/2)

	return int(math.Round(2 * earthRadius * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))))
}
