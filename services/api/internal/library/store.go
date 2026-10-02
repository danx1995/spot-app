package library

import (
	"context"
	"errors"
)

var (
	ErrNotFound      = errors.New("library item not found")
	ErrInvalidInput  = errors.New("invalid library input")
	ErrPlaceNotSaved = errors.New("place is not saved by user")
)

type Store interface {
	UpsertPlace(ctx context.Context, userID string, input SavePlaceInput) (SavedPlace, error)
	ListPlaces(ctx context.Context, userID string, filters PlaceFilters) ([]SavedPlace, error)
	NearbyPlaces(ctx context.Context, userID string, query NearbyQuery) ([]SavedPlace, error)
	PatchPlace(ctx context.Context, userID, placeID string, patch PlacePatch) (SavedPlace, error)
	DeletePlace(ctx context.Context, userID, placeID string) error

	CreateCollection(ctx context.Context, userID string, input CreateCollectionInput) (Collection, error)
	ListCollections(ctx context.Context, userID string) ([]Collection, error)
	GetCollection(ctx context.Context, userID, collectionID string) (Collection, error)
	GetSharedCollection(ctx context.Context, collectionID string) (SharedCollection, error)
	PatchCollection(ctx context.Context, userID, collectionID string, patch CollectionPatch) (Collection, error)
	DeleteCollection(ctx context.Context, userID, collectionID string) error
	SetCollectionPlace(ctx context.Context, userID, collectionID, placeID string, add bool) (Collection, error)

	Mode() string
	Close()
}
