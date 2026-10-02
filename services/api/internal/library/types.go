package library

import "time"

type Place struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Category      string  `json:"category"`
	CategoryLabel string  `json:"category_label"`
	City          string  `json:"city"`
	CityLabel     string  `json:"city_label"`
	Address       string  `json:"address"`
	Latitude      float64 `json:"lat"`
	Longitude     float64 `json:"lng"`
	Rating        float64 `json:"rating"`
}

type SavedPlace struct {
	Place
	Status       string     `json:"status"`
	Note         string     `json:"note,omitempty"`
	SourceType   string     `json:"source_type,omitempty"`
	SourceURL    string     `json:"source_url,omitempty"`
	IsFavorite   bool       `json:"is_favorite"`
	SavedAt      time.Time  `json:"saved_at"`
	VisitedAt    *time.Time `json:"visited_at,omitempty"`
	UpdatedAt    time.Time  `json:"updated_at"`
	DistanceM    *int       `json:"distance_meters,omitempty"`
}

type SavePlaceInput struct {
	Place
	Status     string `json:"status"`
	Note       string `json:"note,omitempty"`
	SourceType string `json:"source_type,omitempty"`
	SourceURL  string `json:"source_url,omitempty"`
	IsFavorite bool   `json:"is_favorite"`
}

type PlacePatch struct {
	Status     *string `json:"status,omitempty"`
	Note       *string `json:"note,omitempty"`
	SourceType *string `json:"source_type,omitempty"`
	SourceURL  *string `json:"source_url,omitempty"`
	IsFavorite *bool   `json:"is_favorite,omitempty"`
}

type PlaceFilters struct {
	City   string
	Status string
	Before *time.Time
	Limit  int
}

type NearbyQuery struct {
	Latitude  float64
	Longitude float64
	RadiusM   int
	Limit     int
}

type Collection struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description,omitempty"`
	City        string    `json:"city,omitempty"`
	CityLabel   string    `json:"city_label,omitempty"`
	Visibility  string    `json:"visibility"`
	CoverURL    string    `json:"cover_url,omitempty"`
	PlaceIDs    []string  `json:"place_ids"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type SharedCollection struct {
	Collection Collection `json:"collection"`
	Places     []Place    `json:"places"`
}

type CreateCollectionInput struct {
	ID          string `json:"id,omitempty"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
	City        string `json:"city,omitempty"`
	Visibility  string `json:"visibility,omitempty"`
	CoverURL    string `json:"cover_url,omitempty"`
}

type CollectionPatch struct {
	Title       *string `json:"title,omitempty"`
	Description *string `json:"description,omitempty"`
	City        *string `json:"city,omitempty"`
	Visibility  *string `json:"visibility,omitempty"`
	CoverURL    *string `json:"cover_url,omitempty"`
}
