package library

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	if strings.TrimSpace(databaseURL) == "" {
		return nil, fmt.Errorf("database url is empty")
	}

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	return &PostgresStore{pool: pool}, nil
}

func NewStore(ctx context.Context, databaseURL string) Store {
	store, err := NewPostgresStore(ctx, databaseURL)
	if err == nil {
		return store
	}
	return NewMemoryStore()
}

func (s *PostgresStore) UpsertPlace(ctx context.Context, userID string, input SavePlaceInput) (SavedPlace, error) {
	if err := validateSavePlace(input); err != nil {
		return SavedPlace{}, err
	}

	status := normalizeStatus(input.Status)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SavedPlace{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var placeUUID string
	err = tx.QueryRow(ctx, `
		WITH category AS (
			SELECT id
			FROM categories
			WHERE slug = $3
			UNION ALL
			SELECT id
			FROM categories
			WHERE slug = 'other'
			  AND NOT EXISTS (SELECT 1 FROM categories WHERE slug = $3)
			LIMIT 1
		)
		INSERT INTO places (
			public_id,
			city_id,
			category_id,
			name,
			normalized_name,
			location,
			address,
			rating,
			updated_at
		)
		SELECT
			$1,
			c.id,
			category.id,
			$4,
			lower(trim($4)),
			ST_SetSRID(ST_Point($6, $5), 4326)::geography,
			NULLIF(trim($7), ''),
			NULLIF($8, 0),
			now()
		FROM cities c
		LEFT JOIN category ON true
		WHERE c.slug = $2
		ON CONFLICT (public_id) DO UPDATE
		SET city_id = EXCLUDED.city_id,
		    category_id = EXCLUDED.category_id,
		    name = EXCLUDED.name,
		    normalized_name = EXCLUDED.normalized_name,
		    location = EXCLUDED.location,
		    address = EXCLUDED.address,
		    rating = EXCLUDED.rating,
		    updated_at = now()
		RETURNING id::text
	`,
		strings.TrimSpace(input.ID),
		input.City,
		input.Category,
		strings.TrimSpace(input.Name),
		input.Latitude,
		input.Longitude,
		input.Address,
		input.Rating,
	).Scan(&placeUUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return SavedPlace{}, ErrInvalidInput
	}
	if err != nil {
		return SavedPlace{}, err
	}

	var savedAt, updatedAt time.Time
	var visitedAt *time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO user_places (
			user_id,
			place_id,
			status,
			note,
			source_type,
			source_url,
			is_favorite,
			visited_at,
			updated_at
		)
		VALUES (
			$1::uuid,
			$2::uuid,
			$3,
			NULLIF(trim($4), ''),
			NULLIF(trim($5), ''),
			NULLIF(trim($6), ''),
			$7,
			CASE WHEN $3 = 'visited' THEN now() ELSE NULL END,
			now()
		)
		ON CONFLICT (user_id, place_id) DO UPDATE
		SET status = EXCLUDED.status,
		    note = EXCLUDED.note,
		    source_type = EXCLUDED.source_type,
		    source_url = EXCLUDED.source_url,
		    is_favorite = EXCLUDED.is_favorite,
		    visited_at = CASE
		      WHEN EXCLUDED.status = 'visited' THEN COALESCE(user_places.visited_at, now())
		      ELSE user_places.visited_at
		    END,
		    updated_at = now()
		RETURNING saved_at, visited_at, updated_at
	`,
		userID,
		placeUUID,
		status,
		input.Note,
		input.SourceType,
		input.SourceURL,
		input.IsFavorite,
	).Scan(&savedAt, &visitedAt, &updatedAt)
	if err != nil {
		return SavedPlace{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return SavedPlace{}, err
	}

	return SavedPlace{
		Place:       input.Place,
		Status:      status,
		Note:        strings.TrimSpace(input.Note),
		SourceType:  strings.TrimSpace(input.SourceType),
		SourceURL:   strings.TrimSpace(input.SourceURL),
		IsFavorite:  input.IsFavorite,
		SavedAt:     savedAt,
		VisitedAt:   visitedAt,
		UpdatedAt:   updatedAt,
	}, nil
}

func (s *PostgresStore) ListPlaces(ctx context.Context, userID string, filters PlaceFilters) ([]SavedPlace, error) {
	limit := normalizeLimit(filters.Limit, 50, 100)

	rows, err := s.pool.Query(ctx, `
		SELECT
			p.public_id,
			p.name,
			COALESCE(cat.slug, 'other'),
			COALESCE(cat.name, 'Другое'),
			c.slug,
			c.name,
			COALESCE(p.address, ''),
			ST_Y(p.location::geometry),
			ST_X(p.location::geometry),
			COALESCE(p.rating::float8, 0),
			up.status,
			COALESCE(up.note, ''),
			COALESCE(up.source_type, ''),
			COALESCE(up.source_url, ''),
			up.is_favorite,
			up.saved_at,
			up.visited_at,
			up.updated_at
		FROM user_places up
		JOIN places p ON p.id = up.place_id
		JOIN cities c ON c.id = p.city_id
		LEFT JOIN categories cat ON cat.id = p.category_id
		WHERE up.user_id = $1::uuid
		  AND ($2 = '' OR c.slug = $2)
		  AND ($3 = '' OR up.status = $3)
		  AND ($4::timestamptz IS NULL OR up.saved_at < $4)
		ORDER BY up.saved_at DESC, p.public_id DESC
		LIMIT $5
	`, userID, filters.City, filters.Status, filters.Before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]SavedPlace, 0)
	for rows.Next() {
		place, err := scanSavedPlace(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, place)
	}
	return result, rows.Err()
}

func (s *PostgresStore) NearbyPlaces(ctx context.Context, userID string, query NearbyQuery) ([]SavedPlace, error) {
	if !validCoordinate(query.Latitude, query.Longitude) {
		return nil, ErrInvalidInput
	}

	radius := query.RadiusM
	if radius <= 0 {
		radius = 2000
	}
	if radius > 50000 {
		radius = 50000
	}
	limit := normalizeLimit(query.Limit, 50, 100)

	rows, err := s.pool.Query(ctx, `
		WITH origin AS (
			SELECT ST_SetSRID(ST_Point($3, $2), 4326)::geography AS point
		)
		SELECT
			p.public_id,
			p.name,
			COALESCE(cat.slug, 'other'),
			COALESCE(cat.name, 'Другое'),
			c.slug,
			c.name,
			COALESCE(p.address, ''),
			ST_Y(p.location::geometry),
			ST_X(p.location::geometry),
			COALESCE(p.rating::float8, 0),
			up.status,
			COALESCE(up.note, ''),
			COALESCE(up.source_type, ''),
			COALESCE(up.source_url, ''),
			up.is_favorite,
			up.saved_at,
			up.visited_at,
			up.updated_at,
			round(ST_Distance(p.location, origin.point))::int
		FROM user_places up
		JOIN places p ON p.id = up.place_id
		JOIN cities c ON c.id = p.city_id
		LEFT JOIN categories cat ON cat.id = p.category_id
		CROSS JOIN origin
		WHERE up.user_id = $1::uuid
		  AND ST_DWithin(p.location, origin.point, $4)
		ORDER BY ST_Distance(p.location, origin.point), up.saved_at DESC
		LIMIT $5
	`, userID, query.Latitude, query.Longitude, radius, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]SavedPlace, 0)
	for rows.Next() {
		var place SavedPlace
		var distance int
		if err := rows.Scan(
			&place.ID,
			&place.Name,
			&place.Category,
			&place.CategoryLabel,
			&place.City,
			&place.CityLabel,
			&place.Address,
			&place.Latitude,
			&place.Longitude,
			&place.Rating,
			&place.Status,
			&place.Note,
			&place.SourceType,
			&place.SourceURL,
			&place.IsFavorite,
			&place.SavedAt,
			&place.VisitedAt,
			&place.UpdatedAt,
			&distance,
		); err != nil {
			return nil, err
		}
		place.DistanceM = &distance
		result = append(result, place)
	}
	return result, rows.Err()
}

func (s *PostgresStore) PatchPlace(ctx context.Context, userID, placeID string, patch PlacePatch) (SavedPlace, error) {
	current, err := s.getPlace(ctx, userID, placeID)
	if err != nil {
		return SavedPlace{}, err
	}

	input := SavePlaceInput{
		Place:       current.Place,
		Status:      current.Status,
		Note:        current.Note,
		SourceType:  current.SourceType,
		SourceURL:   current.SourceURL,
		IsFavorite:  current.IsFavorite,
	}
	if patch.Status != nil {
		if normalizeStatus(*patch.Status) == "" {
			return SavedPlace{}, ErrInvalidInput
		}
		input.Status = *patch.Status
	}
	if patch.Note != nil {
		input.Note = *patch.Note
	}
	if patch.SourceType != nil {
		input.SourceType = *patch.SourceType
	}
	if patch.SourceURL != nil {
		input.SourceURL = *patch.SourceURL
	}
	if patch.IsFavorite != nil {
		input.IsFavorite = *patch.IsFavorite
	}

	return s.UpsertPlace(ctx, userID, input)
}

func (s *PostgresStore) DeletePlace(ctx context.Context, userID, placeID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var placeUUID string
	err = tx.QueryRow(ctx, `
		SELECT p.id::text
		FROM user_places up
		JOIN places p ON p.id = up.place_id
		WHERE up.user_id = $1::uuid
		  AND p.public_id = $2
	`, userID, placeID).Scan(&placeUUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM collection_places
		WHERE place_id = $2::uuid
		  AND collection_id IN (
		    SELECT id FROM collections WHERE owner_id = $1::uuid
		  )
	`, userID, placeUUID); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM user_places
		WHERE user_id = $1::uuid
		  AND place_id = $2::uuid
	`, userID, placeUUID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (s *PostgresStore) CreateCollection(ctx context.Context, userID string, input CreateCollectionInput) (Collection, error) {
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

	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = newPublicID("col")
	} else if !validPublicID(id) {
		return Collection{}, ErrInvalidInput
	}

	var collection Collection
	err := s.pool.QueryRow(ctx, `
		INSERT INTO collections (
			public_id,
			owner_id,
			title,
			description,
			city_id,
			visibility,
			cover_url,
			updated_at
		)
		VALUES (
			$1,
			$2::uuid,
			$3,
			NULLIF(trim($4), ''),
			(SELECT id FROM cities WHERE slug = NULLIF($5, '')),
			$6,
			NULLIF(trim($7), ''),
			now()
		)
		ON CONFLICT (public_id) DO UPDATE
		SET title = EXCLUDED.title,
		    description = EXCLUDED.description,
		    city_id = EXCLUDED.city_id,
		    visibility = EXCLUDED.visibility,
		    cover_url = EXCLUDED.cover_url,
		    updated_at = now()
		WHERE collections.owner_id = EXCLUDED.owner_id
		RETURNING
			public_id,
			title,
			COALESCE(description, ''),
			$5,
			COALESCE((SELECT name FROM cities WHERE id = collections.city_id), ''),
			visibility,
			COALESCE(cover_url, ''),
			created_at,
			updated_at
	`,
		id,
		userID,
		title,
		input.Description,
		input.City,
		visibility,
		input.CoverURL,
	).Scan(
		&collection.ID,
		&collection.Title,
		&collection.Description,
		&collection.City,
		&collection.CityLabel,
		&collection.Visibility,
		&collection.CoverURL,
		&collection.CreatedAt,
		&collection.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Collection{}, ErrInvalidInput
	}
	if err != nil {
		return Collection{}, err
	}

	current, getErr := s.GetCollection(ctx, userID, id)
	if getErr == nil {
		return current, nil
	}
	collection.PlaceIDs = []string{}
	return collection, nil
}

func (s *PostgresStore) ListCollections(ctx context.Context, userID string) ([]Collection, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT
			col.public_id,
			col.title,
			COALESCE(col.description, ''),
			COALESCE(c.slug, ''),
			COALESCE(c.name, ''),
			col.visibility,
			COALESCE(col.cover_url, ''),
			col.created_at,
			col.updated_at,
			COALESCE(
				array_agg(p.public_id ORDER BY cp.sort_order, cp.created_at)
				FILTER (WHERE p.public_id IS NOT NULL),
				ARRAY[]::text[]
			)
		FROM collections col
		LEFT JOIN cities c ON c.id = col.city_id
		LEFT JOIN collection_places cp ON cp.collection_id = col.id
		LEFT JOIN places p ON p.id = cp.place_id
		WHERE col.owner_id = $1::uuid
		GROUP BY col.id, c.slug, c.name
		ORDER BY col.created_at DESC, col.id DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]Collection, 0)
	for rows.Next() {
		var collection Collection
		if err := rows.Scan(
			&collection.ID,
			&collection.Title,
			&collection.Description,
			&collection.City,
			&collection.CityLabel,
			&collection.Visibility,
			&collection.CoverURL,
			&collection.CreatedAt,
			&collection.UpdatedAt,
			&collection.PlaceIDs,
		); err != nil {
			return nil, err
		}
		result = append(result, collection)
	}
	return result, rows.Err()
}

func (s *PostgresStore) GetCollection(ctx context.Context, userID, collectionID string) (Collection, error) {
	var collection Collection
	err := s.pool.QueryRow(ctx, `
		SELECT
			col.public_id,
			col.title,
			COALESCE(col.description, ''),
			COALESCE(c.slug, ''),
			COALESCE(c.name, ''),
			col.visibility,
			COALESCE(col.cover_url, ''),
			col.created_at,
			col.updated_at,
			COALESCE(
				array_agg(p.public_id ORDER BY cp.sort_order, cp.created_at)
				FILTER (WHERE p.public_id IS NOT NULL),
				ARRAY[]::text[]
			)
		FROM collections col
		LEFT JOIN cities c ON c.id = col.city_id
		LEFT JOIN collection_places cp ON cp.collection_id = col.id
		LEFT JOIN places p ON p.id = cp.place_id
		WHERE col.owner_id = $1::uuid
		  AND col.public_id = $2
		GROUP BY col.id, c.slug, c.name
	`, userID, collectionID).Scan(
		&collection.ID,
		&collection.Title,
		&collection.Description,
		&collection.City,
		&collection.CityLabel,
		&collection.Visibility,
		&collection.CoverURL,
		&collection.CreatedAt,
		&collection.UpdatedAt,
		&collection.PlaceIDs,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Collection{}, ErrNotFound
	}
	return collection, err
}

func (s *PostgresStore) PatchCollection(ctx context.Context, userID, collectionID string, patch CollectionPatch) (Collection, error) {
	current, err := s.GetCollection(ctx, userID, collectionID)
	if err != nil {
		return Collection{}, err
	}

	if patch.Title != nil {
		value := strings.TrimSpace(*patch.Title)
		if value == "" || len([]rune(value)) > 120 {
			return Collection{}, ErrInvalidInput
		}
		current.Title = value
	}
	if patch.Description != nil {
		current.Description = strings.TrimSpace(*patch.Description)
	}
	if patch.City != nil {
		if *patch.City != "" && *patch.City != "spb" && *patch.City != "moscow" {
			return Collection{}, ErrInvalidInput
		}
		current.City = *patch.City
	}
	if patch.Visibility != nil {
		value := normalizeVisibility(*patch.Visibility)
		if value == "" {
			return Collection{}, ErrInvalidInput
		}
		current.Visibility = value
	}
	if patch.CoverURL != nil {
		current.CoverURL = strings.TrimSpace(*patch.CoverURL)
	}

	_, err = s.pool.Exec(ctx, `
		UPDATE collections
		SET title = $3,
		    description = NULLIF(trim($4), ''),
		    city_id = (SELECT id FROM cities WHERE slug = NULLIF($5, '')),
		    visibility = $6,
		    cover_url = NULLIF(trim($7), ''),
		    updated_at = now()
		WHERE owner_id = $1::uuid
		  AND public_id = $2
	`,
		userID,
		collectionID,
		current.Title,
		current.Description,
		current.City,
		current.Visibility,
		current.CoverURL,
	)
	if err != nil {
		return Collection{}, err
	}
	return s.GetCollection(ctx, userID, collectionID)
}

func (s *PostgresStore) DeleteCollection(ctx context.Context, userID, collectionID string) error {
	command, err := s.pool.Exec(ctx, `
		DELETE FROM collections
		WHERE owner_id = $1::uuid
		  AND public_id = $2
	`, userID, collectionID)
	if err != nil {
		return err
	}
	if command.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) SetCollectionPlace(ctx context.Context, userID, collectionID, placeID string, add bool) (Collection, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Collection{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var collectionUUID string
	err = tx.QueryRow(ctx, `
		SELECT id::text
		FROM collections
		WHERE owner_id = $1::uuid
		  AND public_id = $2
	`, userID, collectionID).Scan(&collectionUUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Collection{}, ErrNotFound
	}
	if err != nil {
		return Collection{}, err
	}

	var placeUUID string
	err = tx.QueryRow(ctx, `
		SELECT p.id::text
		FROM user_places up
		JOIN places p ON p.id = up.place_id
		WHERE up.user_id = $1::uuid
		  AND p.public_id = $2
	`, userID, placeID).Scan(&placeUUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Collection{}, ErrPlaceNotSaved
	}
	if err != nil {
		return Collection{}, err
	}

	if add {
		_, err = tx.Exec(ctx, `
			INSERT INTO collection_places (collection_id, place_id, added_by, sort_order)
			VALUES (
				$1::uuid,
				$2::uuid,
				$3::uuid,
				COALESCE(
					(SELECT max(sort_order) + 1 FROM collection_places WHERE collection_id = $1::uuid),
					0
				)
			)
			ON CONFLICT (collection_id, place_id) DO NOTHING
		`, collectionUUID, placeUUID, userID)
	} else {
		_, err = tx.Exec(ctx, `
			DELETE FROM collection_places
			WHERE collection_id = $1::uuid
			  AND place_id = $2::uuid
		`, collectionUUID, placeUUID)
	}
	if err != nil {
		return Collection{}, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE collections
		SET updated_at = now()
		WHERE id = $1::uuid
	`, collectionUUID); err != nil {
		return Collection{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Collection{}, err
	}
	return s.GetCollection(ctx, userID, collectionID)
}

func (s *PostgresStore) getPlace(ctx context.Context, userID, placeID string) (SavedPlace, error) {
	var place SavedPlace
	err := s.pool.QueryRow(ctx, `
		SELECT
			p.public_id,
			p.name,
			COALESCE(cat.slug, 'other'),
			COALESCE(cat.name, 'Другое'),
			c.slug,
			c.name,
			COALESCE(p.address, ''),
			ST_Y(p.location::geometry),
			ST_X(p.location::geometry),
			COALESCE(p.rating::float8, 0),
			up.status,
			COALESCE(up.note, ''),
			COALESCE(up.source_type, ''),
			COALESCE(up.source_url, ''),
			up.is_favorite,
			up.saved_at,
			up.visited_at,
			up.updated_at
		FROM user_places up
		JOIN places p ON p.id = up.place_id
		JOIN cities c ON c.id = p.city_id
		LEFT JOIN categories cat ON cat.id = p.category_id
		WHERE up.user_id = $1::uuid
		  AND p.public_id = $2
	`, userID, placeID).Scan(
		&place.ID,
		&place.Name,
		&place.Category,
		&place.CategoryLabel,
		&place.City,
		&place.CityLabel,
		&place.Address,
		&place.Latitude,
		&place.Longitude,
		&place.Rating,
		&place.Status,
		&place.Note,
		&place.SourceType,
		&place.SourceURL,
		&place.IsFavorite,
		&place.SavedAt,
		&place.VisitedAt,
		&place.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return SavedPlace{}, ErrNotFound
	}
	return place, err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanSavedPlace(row rowScanner) (SavedPlace, error) {
	var place SavedPlace
	err := row.Scan(
		&place.ID,
		&place.Name,
		&place.Category,
		&place.CategoryLabel,
		&place.City,
		&place.CityLabel,
		&place.Address,
		&place.Latitude,
		&place.Longitude,
		&place.Rating,
		&place.Status,
		&place.Note,
		&place.SourceType,
		&place.SourceURL,
		&place.IsFavorite,
		&place.SavedAt,
		&place.VisitedAt,
		&place.UpdatedAt,
	)
	return place, err
}

func (s *PostgresStore) Mode() string { return "postgres" }

func (s *PostgresStore) Close() { s.pool.Close() }

var _ Store = (*PostgresStore)(nil)
var _ Store = (*MemoryStore)(nil)
