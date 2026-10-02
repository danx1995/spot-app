package cloud

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

func TestMemoryStoreOptimisticRevision(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()

	userID, err := store.CreateGuest(ctx)
	if err != nil {
		t.Fatal(err)
	}

	first, err := store.PutState(ctx, userID, 0, json.RawMessage(`{"saved_spots":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	if first.Revision != 1 {
		t.Fatalf("expected revision 1, got %d", first.Revision)
	}

	current, err := store.PutState(ctx, userID, 0, json.RawMessage(`{"saved_spots":[1]}`))
	if !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	if current.Revision != 1 {
		t.Fatalf("expected current revision 1, got %d", current.Revision)
	}
}
