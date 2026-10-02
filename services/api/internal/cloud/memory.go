package cloud

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type MemoryStore struct {
	mu     sync.RWMutex
	users  map[string]UserProfile
	states map[string]State
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		users:  make(map[string]UserProfile),
		states: make(map[string]State),
	}
}

func (s *MemoryStore) CreateGuest(_ context.Context) (string, error) {
	id, err := randomUUID()
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	profile := UserProfile{
		ID:         id,
		IsGuest:    true,
		Theme:      "system",
		CreatedAt:  now,
		UpdatedAt:  now,
		LastSeenAt: &now,
	}

	s.mu.Lock()
	s.users[id] = profile
	s.mu.Unlock()
	return id, nil
}

func (s *MemoryStore) TouchUser(_ context.Context, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	profile, ok := s.users[userID]
	if !ok {
		return ErrUserNotFound
	}

	now := time.Now().UTC()
	profile.LastSeenAt = &now
	profile.UpdatedAt = now
	s.users[userID] = profile
	return nil
}

func (s *MemoryStore) GetUserProfile(_ context.Context, userID string) (UserProfile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	profile, ok := s.users[userID]
	if !ok {
		return UserProfile{}, ErrUserNotFound
	}
	return profile, nil
}

func (s *MemoryStore) PatchUserProfile(_ context.Context, userID string, patch UserProfilePatch) (UserProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	current, ok := s.users[userID]
	if !ok {
		return UserProfile{}, ErrUserNotFound
	}

	next, err := applyProfilePatch(current, patch)
	if err != nil {
		return UserProfile{}, err
	}

	now := time.Now().UTC()
	next.UpdatedAt = now
	next.LastSeenAt = &now
	s.users[userID] = next
	return next, nil
}

func (s *MemoryStore) GetState(_ context.Context, userID string) (State, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	state, ok := s.states[userID]
	if !ok {
		return State{}, ErrStateNotFound
	}
	return cloneState(state), nil
}

func (s *MemoryStore) PutState(_ context.Context, userID string, baseRevision int64, data json.RawMessage) (State, error) {
	if !json.Valid(data) {
		return State{}, fmt.Errorf("invalid state json")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	profile, ok := s.users[userID]
	if !ok {
		return State{}, ErrUserNotFound
	}

	current, exists := s.states[userID]
	if exists && current.Revision != baseRevision {
		return cloneState(current), ErrRevisionConflict
	}
	if !exists && baseRevision != 0 {
		return State{}, ErrRevisionConflict
	}

	next := State{
		Revision:  baseRevision + 1,
		Data:      append(json.RawMessage(nil), data...),
		UpdatedAt: time.Now().UTC(),
	}
	s.states[userID] = next

	now := time.Now().UTC()
	profile.LastSeenAt = &now
	profile.UpdatedAt = now
	s.users[userID] = profile

	return cloneState(next), nil
}

func (s *MemoryStore) Close() {}

func (s *MemoryStore) Mode() string { return "memory" }

func cloneState(state State) State {
	state.Data = append(json.RawMessage(nil), state.Data...)
	return state
}

func randomUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	raw := hex.EncodeToString(b[:])
	return fmt.Sprintf("%s-%s-%s-%s-%s", raw[0:8], raw[8:12], raw[12:16], raw[16:20], raw[20:32]), nil
}

