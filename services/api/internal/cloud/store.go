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
	ErrUserNotFound      = errors.New("user not found")
	ErrIdentityInUse     = errors.New("identity already linked")
	ErrIdentityNotFound  = errors.New("identity not found")
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

type VerifiedIdentity struct {
	Provider      string `json:"provider"`
	Subject       string `json:"subject"`
	Email         string `json:"email,omitempty"`
	EmailVerified bool   `json:"email_verified"`
	DisplayName   string `json:"display_name,omitempty"`
	AvatarURL     string `json:"avatar_url,omitempty"`
}

type Store interface {
	CreateGuest(ctx context.Context) (string, error)
	TouchUser(ctx context.Context, userID string) error
	GetUserProfile(ctx context.Context, userID string) (UserProfile, error)
	PatchUserProfile(ctx context.Context, userID string, patch UserProfilePatch) (UserProfile, error)
	LinkIdentity(ctx context.Context, userID string, identity VerifiedIdentity) (UserProfile, error)
	FindUserByIdentity(ctx context.Context, provider, subject string) (UserProfile, error)
	GetState(ctx context.Context, userID string) (State, error)
	PutState(ctx context.Context, userID string, baseRevision int64, data json.RawMessage) (State, error)
	Close()
	Mode() string
}
