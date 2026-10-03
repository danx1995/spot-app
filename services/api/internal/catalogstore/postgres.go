package catalogstore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
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

func (s *PostgresStore) Upsert(ctx context.Context, places []catalog.Place) error {
	if len(places) == 0 {
		return nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, place := range places {
		if strings.TrimSpace(place.ID) == "" ||
			strings.TrimSpace(place.Name) == "" ||
			(place.City != "spb" && place.City != "moscow") {
			continue
		}

		openingJSON := []byte("{}")
		if place.OpeningHours != nil {
			encoded, marshalErr := json.Marshal(place.OpeningHours)
			if marshalErr == nil {
				openingJSON = encoded
			}
		}

		_, err = tx.Exec(ctx, `
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
				latitude,
				longitude,
				address,
				rating,
				rating_count,
				working_hours,
				attributes,
				provider_data,
				is_active,
				updated_at
			)
			SELECT
				$1,
				c.id,
				category.id,
				$4,
				lower(trim($4)),
				$5,
				$6,
				NULLIF(trim($7), ''),
				NULLIF($8, 0),
				NULLIF($9, 0),
				$10::jsonb,
				jsonb_strip_nulls(jsonb_build_object('description', NULLIF(trim($11), ''))),
				jsonb_build_object('source', 'catalog', 'last_synced_at', now()),
				true,
				now()
			FROM cities c
			LEFT JOIN category ON true
			WHERE c.slug = $2
			ON CONFLICT (public_id) DO UPDATE
			SET city_id = EXCLUDED.city_id,
			    category_id = EXCLUDED.category_id,
			    name = EXCLUDED.name,
			    normalized_name = EXCLUDED.normalized_name,
			    latitude = EXCLUDED.latitude,
			    longitude = EXCLUDED.longitude,
			    address = EXCLUDED.address,
			    rating = COALESCE(EXCLUDED.rating, places.rating),
			    rating_count = GREATEST(COALESCE(EXCLUDED.rating_count, 0), COALESCE(places.rating_count, 0)),
			    working_hours = CASE
			      WHEN EXCLUDED.working_hours <> '{}'::jsonb THEN EXCLUDED.working_hours
			      ELSE places.working_hours
			    END,
			    attributes = places.attributes || EXCLUDED.attributes,
			    provider_data = places.provider_data || EXCLUDED.provider_data,
			    is_active = true,
			    updated_at = now()
		`,
			strings.TrimSpace(place.ID),
			place.City,
			place.Category,
			strings.TrimSpace(place.Name),
			place.Latitude,
			place.Longitude,
			place.Address,
			place.Rating,
			place.ReviewCount,
			string(openingJSON),
			place.Description,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (s *PostgresStore) Search(ctx context.Context, query, city, category string, page, pageSize int) ([]catalog.Place, error) {
	page, pageSize = normalizePage(page, pageSize)
	offset := (page - 1) * pageSize
	q := strings.ToLower(strings.TrimSpace(query))

	rows, err := s.pool.Query(ctx, `
		SELECT
			p.public_id,
			p.name,
			COALESCE(cat.slug, 'other'),
			COALESCE(cat.name, 'Другое'),
			c.slug,
			c.name,
			COALESCE(p.address, ''),
			p.latitude,
			p.longitude,
			COALESCE(p.rating::float8, 0),
			COALESCE(p.rating_count, 0),
			COALESCE(p.working_hours::text, '{}'),
			COALESCE(p.attributes->>'description', '')
		FROM places p
		JOIN cities c ON c.id = p.city_id
		LEFT JOIN categories cat ON cat.id = p.category_id
		WHERE p.is_active = true
		  AND ($1 = '' OR c.slug = $1)
		  AND ($2 = '' OR COALESCE(cat.slug, 'other') = $2)
		  AND (
		    $3 = ''
		    OR p.normalized_name LIKE '%' || $3 || '%'
		    OR lower(COALESCE(p.address, '')) LIKE '%' || $3 || '%'
		    OR lower(COALESCE(cat.name, '')) LIKE '%' || $3 || '%'
		  )
		ORDER BY
			COALESCE(p.rating, 0) DESC,
			COALESCE(p.rating_count, 0) DESC,
			p.name ASC,
			p.public_id ASC
		LIMIT $4 OFFSET $5
	`, city, category, q, pageSize, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]catalog.Place, 0, pageSize)
	for rows.Next() {
		var place catalog.Place
		var openingJSON string
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
			&place.ReviewCount,
			&openingJSON,
			&place.Description,
		); err != nil {
			return nil, err
		}
		place.OpeningHours = decodeOpeningHours(openingJSON)
		result = append(result, place)
	}
	return result, rows.Err()
}

func (s *PostgresStore) Find(ctx context.Context, id string) (catalog.Place, bool, error) {
	var place catalog.Place
	var openingJSON string
	err := s.pool.QueryRow(ctx, `
		SELECT
			p.public_id,
			p.name,
			COALESCE(cat.slug, 'other'),
			COALESCE(cat.name, 'Другое'),
			c.slug,
			c.name,
			COALESCE(p.address, ''),
			p.latitude,
			p.longitude,
			COALESCE(p.rating::float8, 0),
			COALESCE(p.rating_count, 0),
			COALESCE(p.working_hours::text, '{}'),
			COALESCE(p.attributes->>'description', '')
		FROM places p
		JOIN cities c ON c.id = p.city_id
		LEFT JOIN categories cat ON cat.id = p.category_id
		WHERE p.public_id = $1
		  AND p.is_active = true
	`, strings.TrimSpace(id)).Scan(
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
		&place.ReviewCount,
		&openingJSON,
		&place.Description,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return catalog.Place{}, false, nil
	}
	if err != nil {
		return catalog.Place{}, false, err
	}
	place.OpeningHours = decodeOpeningHours(openingJSON)
	return place, true, nil
}

func decodeOpeningHours(raw string) *catalog.OpeningHours {
	if strings.TrimSpace(raw) == "" || strings.TrimSpace(raw) == "{}" {
		return nil
	}
	var value catalog.OpeningHours
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return nil
	}
	if !value.Is24x7 && len(value.Days) == 0 {
		return nil
	}
	return &value
}

func (s *PostgresStore) Mode() string { return "postgres" }
func (s *PostgresStore) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}
