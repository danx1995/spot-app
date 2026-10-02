package cloud

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

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

func (s *PostgresStore) CreateGuest(ctx context.Context) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (is_guest, last_seen_at)
		VALUES (true, now())
		RETURNING id::text
	`).Scan(&id)
	return id, err
}

func (s *PostgresStore) TouchUser(ctx context.Context, userID string) error {
	command, err := s.pool.Exec(ctx, `
		UPDATE users
		SET last_seen_at = now(), updated_at = now()
		WHERE id = $1::uuid
	`, userID)
	if err != nil {
		return err
	}
	if command.RowsAffected() == 0 {
		return fmt.Errorf("unknown user")
	}
	return nil
}

func (s *PostgresStore) GetUserProfile(ctx context.Context, userID string) (UserProfile, error) {
	var profile UserProfile
	err := s.pool.QueryRow(ctx, `
		SELECT
			u.id::text,
			COALESCE(u.is_guest, true),
			COALESCE(u.display_name, ''),
			COALESCE(u.email, ''),
			COALESCE(u.avatar_url, ''),
			COALESCE(c.slug, ''),
			COALESCE(u.theme, 'system'),
			u.created_at,
			u.updated_at,
			u.last_seen_at
		FROM users u
		LEFT JOIN cities c ON c.id = u.home_city_id
		WHERE u.id = $1::uuid
	`, userID).Scan(
		&profile.ID,
		&profile.IsGuest,
		&profile.DisplayName,
		&profile.Email,
		&profile.AvatarURL,
		&profile.HomeCity,
		&profile.Theme,
		&profile.CreatedAt,
		&profile.UpdatedAt,
		&profile.LastSeenAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return UserProfile{}, ErrUserNotFound
	}
	return profile, err
}

func (s *PostgresStore) PatchUserProfile(ctx context.Context, userID string, patch UserProfilePatch) (UserProfile, error) {
	current, err := s.GetUserProfile(ctx, userID)
	if err != nil {
		return UserProfile{}, err
	}

	next, err := applyProfilePatch(current, patch)
	if err != nil {
		return UserProfile{}, err
	}

	command, err := s.pool.Exec(ctx, `
		UPDATE users
		SET display_name = NULLIF(trim($2), ''),
		    avatar_url = NULLIF(trim($3), ''),
		    home_city_id = (SELECT id FROM cities WHERE slug = NULLIF($4, '')),
		    theme = $5,
		    last_seen_at = now(),
		    updated_at = now()
		WHERE id = $1::uuid
	`,
		userID,
		next.DisplayName,
		next.AvatarURL,
		next.HomeCity,
		next.Theme,
	)
	if err != nil {
		return UserProfile{}, err
	}
	if command.RowsAffected() == 0 {
		return UserProfile{}, ErrUserNotFound
	}

	return s.GetUserProfile(ctx, userID)
}

func (s *PostgresStore) GetState(ctx context.Context, userID string) (State, error) {
	var state State
	err := s.pool.QueryRow(ctx, `
		SELECT revision, state, updated_at
		FROM user_state_snapshots
		WHERE user_id = $1::uuid
	`, userID).Scan(&state.Revision, &state.Data, &state.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return State{}, ErrStateNotFound
	}
	return state, err
}

func (s *PostgresStore) PutState(ctx context.Context, userID string, baseRevision int64, data json.RawMessage) (State, error) {
	if !json.Valid(data) {
		return State{}, fmt.Errorf("invalid state json")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return State{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var currentRevision int64
	err = tx.QueryRow(ctx, `
		SELECT revision
		FROM user_state_snapshots
		WHERE user_id = $1::uuid
		FOR UPDATE
	`, userID).Scan(&currentRevision)

	switch {
	case errors.Is(err, pgx.ErrNoRows):
		if baseRevision != 0 {
			return State{}, ErrRevisionConflict
		}
	case err != nil:
		return State{}, err
	default:
		if currentRevision != baseRevision {
			current, getErr := s.getStateTx(ctx, tx, userID)
			if getErr != nil {
				return State{}, getErr
			}
			return current, ErrRevisionConflict
		}
	}

	var state State
	err = tx.QueryRow(ctx, `
		INSERT INTO user_state_snapshots (user_id, revision, state, updated_at)
		VALUES ($1::uuid, $2, $3::jsonb, now())
		ON CONFLICT (user_id) DO UPDATE
		SET revision = EXCLUDED.revision,
		    state = EXCLUDED.state,
		    updated_at = now()
		RETURNING revision, state, updated_at
	`, userID, baseRevision+1, data).Scan(&state.Revision, &state.Data, &state.UpdatedAt)
	if err != nil {
		return State{}, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE users
		SET last_seen_at = now(), updated_at = now()
		WHERE id = $1::uuid
	`, userID); err != nil {
		return State{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return State{}, err
	}
	return state, nil
}

func (s *PostgresStore) getStateTx(ctx context.Context, tx pgx.Tx, userID string) (State, error) {
	var state State
	err := tx.QueryRow(ctx, `
		SELECT revision, state, updated_at
		FROM user_state_snapshots
		WHERE user_id = $1::uuid
	`, userID).Scan(&state.Revision, &state.Data, &state.UpdatedAt)
	return state, err
}

func (s *PostgresStore) Close() { s.pool.Close() }

func (s *PostgresStore) Mode() string { return "postgres" }

func NewStore(ctx context.Context, databaseURL string) Store {
	store, err := NewPostgresStore(ctx, databaseURL)
	if err == nil {
		return store
	}
	return NewMemoryStore()
}

var _ Store = (*PostgresStore)(nil)
var _ Store = (*MemoryStore)(nil)
