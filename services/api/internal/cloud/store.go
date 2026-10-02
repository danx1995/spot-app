package cloud

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

var (
	ErrStateNotFound  = errors.New("cloud state not found")
	ErrRevisionConflict = errors.New("revision conflict")
)

type State struct {
	Revision  int64           `json:"revision"`
	Data      json.RawMessage `json:"state"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type Store interface {
	CreateGuest(ctx context.Context) (string, error)
	TouchUser(ctx context.Context, userID string) error
	GetState(ctx context.Context, userID string) (State, error)
	PutState(ctx context.Context, userID string, baseRevision int64, data json.RawMessage) (State, error)
	Close()
	Mode() string
}
