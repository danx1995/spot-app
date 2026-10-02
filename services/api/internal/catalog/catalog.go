package catalog

import (
	"strings"
)

type City struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

type Category struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

type TimeRange struct {
	From string `json:"from,omitempty"`
	To   string `json:"to,omitempty"`
}

type OpeningHours struct {
	Is24x7 bool                   `json:"is_24x7,omitempty"`
	Days   map[string][]TimeRange `json:"days,omitempty"`
}

type Place struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Category       string  `json:"category"`
	CategoryLabel  string  `json:"category_label"`
	City           string  `json:"city"`
	CityLabel      string  `json:"city_label"`
	Address        string  `json:"address"`
	Latitude       float64 `json:"lat"`
	Longitude      float64 `json:"lng"`
	Rating         float64       `json:"rating"`
	ReviewCount    int           `json:"review_count,omitempty"`
	OpeningHours   *OpeningHours `json:"opening_hours,omitempty"`
	Description    string        `json:"description,omitempty"`
	DistanceMeters int           `json:"distance_meters,omitempty"`
}

var Cities = []City{
	{Slug: "spb", Name: "Санкт-Петербург"},
	{Slug: "moscow", Name: "Москва"},
}

var Categories = []Category{
	{Slug: "restaurant", Name: "Рестораны"},
	{Slug: "coffee", Name: "Кофейни"},
	{Slug: "bar", Name: "Бары"},
	{Slug: "hotel", Name: "Отели"},
	{Slug: "culture", Name: "Культура"},
	{Slug: "entertainment", Name: "Развлечения"},
	{Slug: "shop", Name: "Магазины"},
	{Slug: "park", Name: "Места"},
}

var Places = []Place{
	{
		ID: "sp_birch_demo",
		Name: "Birch",
		Category: "restaurant",
		CategoryLabel: "Ресторан",
		City: "spb",
		CityLabel: "Санкт-Петербург",
		Address: "Кирочная улица, 3",
		Latitude: 59.9449,
		Longitude: 30.3596,
		Rating: 4.8,
		DistanceMeters: 420,
	},
	{
		ID: "sp_skuratov_demo",
		Name: "Skuratov Coffee",
		Category: "coffee",
		CategoryLabel: "Кофейня",
		City: "spb",
		CityLabel: "Санкт-Петербург",
		Address: "Невский проспект",
		Latitude: 59.9343,
		Longitude: 30.3351,
		Rating: 4.7,
		DistanceMeters: 710,
	},
	{
		ID: "sp_wawelberg_demo",
		Name: "Wawelberg Hotel",
		Category: "hotel",
		CategoryLabel: "Отель",
		City: "spb",
		CityLabel: "Санкт-Петербург",
		Address: "Невский проспект, 7–9",
		Latitude: 59.9361,
		Longitude: 30.3154,
		Rating: 4.9,
		DistanceMeters: 1200,
	},
}

func SearchPlaces(query, city, category string) []Place {
	q := strings.ToLower(strings.TrimSpace(query))
	out := make([]Place, 0)

	for _, place := range Places {
		if city != "" && place.City != city {
			continue
		}
		if category != "" && place.Category != category {
			continue
		}
		if q != "" {
			haystack := strings.ToLower(place.Name + " " + place.Address + " " + place.CategoryLabel)
			if !strings.Contains(haystack, q) {
				continue
			}
		}
		out = append(out, place)
	}

	return out
}

func FindPlace(id string) (Place, bool) {
	for _, place := range Places {
		if place.ID == id {
			return place, true
		}
	}
	return Place{}, false
}
