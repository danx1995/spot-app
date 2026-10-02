package library

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
)

type cloudState struct {
	SavedSpots  []cloudSpot       `json:"saved_spots"`
	Collections []cloudCollection `json:"collections"`
}

type cloudOpeningHours struct {
	Is24x7 bool                   `json:"is24x7"`
	Days   map[string][]TimeRange `json:"days"`
}

type cloudSpot struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Category       string  `json:"category"`
	CategoryLabel  string  `json:"categoryLabel"`
	City           string  `json:"city"`
	CityLabel      string  `json:"cityLabel"`
	Address        string  `json:"address"`
	Latitude       float64 `json:"latitude"`
	Longitude      float64 `json:"longitude"`
	Rating         float64       `json:"rating"`
	ReviewCount    int           `json:"reviewCount"`
	OpeningHours   *cloudOpeningHours `json:"openingHours"`
	Description    string        `json:"description"`
	Status         string        `json:"status"`
	Favorite       bool    `json:"favorite"`
	Note           string  `json:"note"`
	SourceURL      string  `json:"sourceUrl"`
	SourcePlatform string  `json:"sourcePlatform"`
	SourceTitle    string  `json:"sourceTitle"`
	SourceExcerpt  string  `json:"sourceExcerpt"`
}

type cloudRoutePlan struct {
	Kind        string `json:"kind"`
	Transport   string `json:"transport"`
	StartPreset string `json:"startPreset"`
	StopMinutes int    `json:"stopMinutes"`
	StartMode   string `json:"startMode"`
}

type cloudCollection struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Subtitle  string   `json:"subtitle"`
	City      string   `json:"city"`
	CityLabel string          `json:"cityLabel"`
	PlaceIDs  []string        `json:"placeIds"`
	RoutePlan *cloudRoutePlan `json:"routePlan"`
}

type normalizedCloudState struct {
	places      map[string]SavePlaceInput
	collections map[string]normalizedCloudCollection
}

type normalizedCloudCollection struct {
	input    CreateCollectionInput
	placeIDs []string
}

// ApplyCloudDelta projects the mobile offline snapshot into the normalized
// library tables without changing the snapshot sync contract. Only changed
// records are written, so existing clients can migrate incrementally.
func ApplyCloudDelta(
	ctx context.Context,
	store Store,
	userID string,
	previous json.RawMessage,
	next json.RawMessage,
) error {
	before, err := decodeCloudState(previous, true)
	if err != nil {
		return fmt.Errorf("decode previous cloud state: %w", err)
	}
	after, err := decodeCloudState(next, false)
	if err != nil {
		return fmt.Errorf("decode next cloud state: %w", err)
	}

	for id, place := range after.places {
		old, exists := before.places[id]
		if exists && reflect.DeepEqual(old, place) {
			continue
		}
		if _, err := store.UpsertPlace(ctx, userID, place); err != nil {
			return fmt.Errorf("upsert place %s: %w", id, err)
		}
	}

	for id, collection := range after.collections {
		old, existed := before.collections[id]
		metadataChanged := !existed || !reflect.DeepEqual(old.input, collection.input)
		if metadataChanged {
			input := collection.input
			if current, currentErr := store.GetCollection(ctx, userID, id); currentErr == nil {
				if current.Visibility == "shared" || current.Visibility == "public" {
					input.Visibility = current.Visibility
				}
			}

			if _, err := store.CreateCollection(ctx, userID, input); err != nil {
				return fmt.Errorf("upsert collection %s: %w", id, err)
			}
		}

		beforeIDs := map[string]struct{}{}
		if existed {
			for _, placeID := range old.placeIDs {
				beforeIDs[placeID] = struct{}{}
			}
		}
		afterIDs := make(map[string]struct{}, len(collection.placeIDs))
		for _, placeID := range collection.placeIDs {
			afterIDs[placeID] = struct{}{}
			if _, existedBefore := beforeIDs[placeID]; existedBefore {
				continue
			}

			_, err := store.SetCollectionPlace(ctx, userID, id, placeID, true)
			if errors.Is(err, ErrPlaceNotSaved) {
				if place, ok := after.places[placeID]; ok {
					if _, upsertErr := store.UpsertPlace(ctx, userID, place); upsertErr != nil {
						return fmt.Errorf("repair place %s: %w", placeID, upsertErr)
					}
					_, err = store.SetCollectionPlace(ctx, userID, id, placeID, true)
				}
			}
			if err != nil {
				return fmt.Errorf("add place %s to collection %s: %w", placeID, id, err)
			}
		}

		for _, placeID := range old.placeIDs {
			if _, keep := afterIDs[placeID]; keep {
				continue
			}
			if _, err := store.SetCollectionPlace(ctx, userID, id, placeID, false); err != nil && !errors.Is(err, ErrPlaceNotSaved) {
				return fmt.Errorf("remove place %s from collection %s: %w", placeID, id, err)
			}
		}

		if !existed || !reflect.DeepEqual(old.placeIDs, collection.placeIDs) {
			if _, err := store.SetCollectionPlaceOrder(ctx, userID, id, collection.placeIDs); err != nil {
				return fmt.Errorf("reorder collection %s: %w", id, err)
			}
		}
	}

	for id := range before.collections {
		if _, keep := after.collections[id]; keep {
			continue
		}
		if err := store.DeleteCollection(ctx, userID, id); err != nil && !errors.Is(err, ErrNotFound) {
			return fmt.Errorf("delete collection %s: %w", id, err)
		}
	}

	for id := range before.places {
		if _, keep := after.places[id]; keep {
			continue
		}
		if err := store.DeletePlace(ctx, userID, id); err != nil && !errors.Is(err, ErrNotFound) {
			return fmt.Errorf("delete place %s: %w", id, err)
		}
	}

	return nil
}

func decodeCloudState(raw json.RawMessage, allowEmpty bool) (normalizedCloudState, error) {
	state := normalizedCloudState{
		places:      make(map[string]SavePlaceInput),
		collections: make(map[string]normalizedCloudCollection),
	}

	if len(raw) == 0 || string(raw) == "null" {
		if allowEmpty {
			return state, nil
		}
		return state, ErrInvalidInput
	}

	var payload cloudState
	if err := json.Unmarshal(raw, &payload); err != nil {
		return state, ErrInvalidInput
	}

	for _, item := range payload.SavedSpots {
		input := normalizeCloudSpot(item)
		if err := validateSavePlace(input); err != nil {
			return state, err
		}
		state.places[input.ID] = input
	}

	for _, item := range payload.Collections {
		id := strings.TrimSpace(item.ID)
		title := strings.TrimSpace(item.Title)
		if !validPublicID(id) || title == "" || len([]rune(title)) > 120 {
			return state, ErrInvalidInput
		}

		city := item.City
		if city == "both" {
			city = ""
		}
		if city != "" && city != "spb" && city != "moscow" {
			return state, ErrInvalidInput
		}

		placeIDs := make([]string, 0, len(item.PlaceIDs))
		seen := make(map[string]struct{}, len(item.PlaceIDs))
		for _, rawID := range item.PlaceIDs {
			placeID := strings.TrimSpace(rawID)
			if placeID == "" {
				continue
			}
			if _, duplicate := seen[placeID]; duplicate {
				continue
			}
			seen[placeID] = struct{}{}
			placeIDs = append(placeIDs, placeID)
		}

		state.collections[id] = normalizedCloudCollection{
			input: CreateCollectionInput{
				ID:          id,
				Title:       title,
				Description: strings.TrimSpace(item.Subtitle),
				City:        city,
				Visibility:  "private",
				RoutePlan:   normalizeCloudRoutePlan(item.RoutePlan),
			},
			placeIDs: placeIDs,
		}
	}

	return state, nil
}

func normalizeCloudRoutePlan(value *cloudRoutePlan) *RoutePlan {
	if value == nil {
		return nil
	}
	return &RoutePlan{
		Kind:        strings.TrimSpace(value.Kind),
		Transport:   strings.TrimSpace(value.Transport),
		StartPreset: strings.TrimSpace(value.StartPreset),
		StopMinutes: value.StopMinutes,
		StartMode:   strings.TrimSpace(value.StartMode),
	}
}

func normalizeCloudOpeningHours(value *cloudOpeningHours) *OpeningHours {
	if value == nil {
		return nil
	}

	days := make(map[string][]TimeRange, len(value.Days))
	for day, ranges := range value.Days {
		days[day] = append([]TimeRange(nil), ranges...)
	}

	if !value.Is24x7 && len(days) == 0 {
		return nil
	}
	return &OpeningHours{
		Is24x7: value.Is24x7,
		Days:   days,
	}
}

func normalizeCloudSpot(item cloudSpot) SavePlaceInput {
	category := strings.TrimSpace(item.Category)
	if category == "" {
		category = "other"
	}
	categoryLabel := strings.TrimSpace(item.CategoryLabel)
	if categoryLabel == "" {
		categoryLabel = "Другое"
	}

	return SavePlaceInput{
		Place: Place{
			ID:            strings.TrimSpace(item.ID),
			Name:          strings.TrimSpace(item.Name),
			Category:      category,
			CategoryLabel: categoryLabel,
			City:          strings.TrimSpace(item.City),
			CityLabel:     strings.TrimSpace(item.CityLabel),
			Address:       strings.TrimSpace(item.Address),
			Latitude:      item.Latitude,
			Longitude:     item.Longitude,
			Rating:        item.Rating,
			ReviewCount:   item.ReviewCount,
			OpeningHours:  normalizeCloudOpeningHours(item.OpeningHours),
			Description:   strings.TrimSpace(item.Description),
		},
		Status:     item.Status,
		Note:       strings.TrimSpace(item.Note),
		SourceType:    strings.TrimSpace(item.SourcePlatform),
		SourceURL:     strings.TrimSpace(item.SourceURL),
		SourceTitle:   strings.TrimSpace(item.SourceTitle),
		SourceExcerpt: strings.TrimSpace(item.SourceExcerpt),
		IsFavorite:    item.Favorite,
	}
}
