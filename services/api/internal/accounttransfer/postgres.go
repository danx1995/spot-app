package accounttransfer

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

func (s *PostgresStore) Issue(ctx context.Context, userID string) (TransferCode, error) {
	code, hash, err := generateCode()
	if err != nil {
		return TransferCode{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return TransferCode{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		DELETE FROM account_transfer_codes
		WHERE user_id = $1::uuid
		  AND used_at IS NULL
	`, userID); err != nil {
		return TransferCode{}, err
	}

	var expiresAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO account_transfer_codes (user_id, code_hash, expires_at)
		VALUES ($1::uuid, $2, now() + interval '10 minutes')
		RETURNING expires_at
	`, userID, hash).Scan(&expiresAt)
	if err != nil {
		return TransferCode{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return TransferCode{}, err
	}

	return TransferCode{Code: code, ExpiresAt: expiresAt}, nil
}

func (s *PostgresStore) Redeem(ctx context.Context, code string) (string, error) {
	var userID string
	err := s.pool.QueryRow(ctx, `
		UPDATE account_transfer_codes
		SET used_at = now()
		WHERE code_hash = $1
		  AND used_at IS NULL
		  AND expires_at > now()
		RETURNING user_id::text
	`, codeHash(code)).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrInvalidCode
	}
	return userID, err
}

func (s *PostgresStore) Mode() string { return "postgres" }
func (s *PostgresStore) Close()       { s.pool.Close() }

var _ Store = (*PostgresStore)(nil)
