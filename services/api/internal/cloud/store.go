package cloud

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

var (
	ErrStateNotFound    = errors.New("cloud state not found")
	ErrRevisionConflict = errors.New("revision conflict")
	ErrInvalidProfile   = errors.New("invalid user profile")
	ErrUserNotFound     = errors.New("user not found")
)

type State struct {
	Revision  int64           `json:"revision"`
	Data      json.RawMessage `json:"state"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type UserProfile struct {
	ID          string     `json:"id"`
	IsGuest     bool       `json:"is_guest"`
	DisplayName string     `json:"display_name,omitempty"`
	Email       string     `json:"email,omitempty"`
	AvatarURL   string     `json:"avatar_url,omitempty"`
	HomeCity    string     `json:"home_city,omitempty"`
	Theme       string     `json:"theme"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	LastSeenAt  *time.Time `json:"last_seen_at,omitempty"`
}

type UserProfilePatch struct {
	DisplayName *string `json:"display_name,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	HomeCity    *string `json:"home_city,omitempty"`
	Theme       *string `json:"theme,omitempty"`
}

type Store interface {
	CreateGuest(ctx context.Context) (string, error)
	TouchUser(ctx context.Context, userID string) error
	GetUserProfile(ctx context.Context, userID string) (UserProfile, error)
	PatchUserProfile(ctx context.Context, userID string, patch UserProfilePatch) (UserProfile, error)
	GetState(ctx context.Context, userID string) (State, error)
	PutState(ctx context.Context, userID string, baseRevision int64, data json.RawMessage) (State, error)
	Close()
	Mode() string
}
