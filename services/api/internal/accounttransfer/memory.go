package accounttransfer

import (
	"bytes"
	"context"
	"sync"
	"time"
)

type memoryRecord struct {
	userID    string
	hash      []byte
	expiresAt time.Time
	used      bool
}

type MemoryStore struct {
	mu      sync.Mutex
	records []memoryRecord
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{}
}

func (s *MemoryStore) Issue(_ context.Context, userID string) (TransferCode, error) {
	code, hash, err := generateCode()
	if err != nil {
		return TransferCode{}, err
	}
	expiresAt := time.Now().UTC().Add(10 * time.Minute)

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	next := s.records[:0]
	for _, record := range s.records {
		if record.expiresAt.After(now) && !record.used && record.userID != userID {
			next = append(next, record)
		}
	}
	s.records = append(next, memoryRecord{
		userID:    userID,
		hash:      append([]byte(nil), hash...),
		expiresAt: expiresAt,
	})

	return TransferCode{Code: code, ExpiresAt: expiresAt}, nil
}

func (s *MemoryStore) Redeem(_ context.Context, code string) (string, error) {
	hash := codeHash(code)
	now := time.Now().UTC()

	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.records {
		record := &s.records[i]
		if record.used || !record.expiresAt.After(now) || !bytes.Equal(record.hash, hash) {
			continue
		}
		record.used = true
		return record.userID, nil
	}

	return "", ErrInvalidCode
}

func (s *MemoryStore) Mode() string { return "memory" }
func (s *MemoryStore) Close()       {}

var _ Store = (*MemoryStore)(nil)
