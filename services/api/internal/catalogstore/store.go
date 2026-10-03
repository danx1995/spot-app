package catalogstore

import (
	"context"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

type Store interface {
	Upsert(ctx context.Context, places []catalog.Place) error
	Search(ctx context.Context, query, city, category string, page, pageSize int) ([]catalog.Place, error)
	SearchAt(ctx context.Context, query, city, category string, lat, lng float64, page, pageSize int) ([]catalog.Place, error)
	Find(ctx context.Context, id string) (catalog.Place, bool, error)
	Mode() string
	Close()
}

func normalizePage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}
