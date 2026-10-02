package twogis

import "testing"

func TestCategoryFromRubrics(t *testing.T) {
	tests := []struct {
		name string
		want string
	}{
		{name: "Кофейня", want: "coffee"},
		{name: "Ресторан", want: "restaurant"},
		{name: "Бар", want: "bar"},
		{name: "Гостиница", want: "hotel"},
		{name: "Музей", want: "culture"},
		{name: "Кинотеатр", want: "entertainment"},
		{name: "Магазин одежды", want: "shop"},
		{name: "Парк культуры и отдыха", want: "park"},
		{name: "Квест-комната", want: "entertainment"},
		{name: "Пекарня", want: "restaurant"},
		{name: "Неизвестная рубрика", want: "other"},
	}

	for _, tc := range tests {
		got, _ := categoryFromRubrics([]rubric{{Name: tc.name, Kind: "primary"}})
		if got != tc.want {
			t.Fatalf("%s: expected %s, got %s", tc.name, tc.want, got)
		}
	}
}

func TestPublicIDStable(t *testing.T) {
	first := publicID("700000010123")
	second := publicID("700000010123")
	if first != second {
		t.Fatalf("public id should be stable: %s != %s", first, second)
	}
	if first == "700000010123" {
		t.Fatal("public id must not expose provider id")
	}
}


func TestNormalizeItemUsesGeneralRating(t *testing.T) {
	place, ok := normalizeItem(item{
		ID:          "700000010123",
		Name:        "Demo Cafe",
		AddressName: "Невский проспект, 1",
		Point:       &point{Lat: 59.93, Lon: 30.32},
		Rubrics:     []rubric{{Name: "Кафе", Kind: "primary"}},
		Reviews:     &reviews{GeneralRating: 4.73},
	}, "spb", "Санкт-Петербург")
	if !ok {
		t.Fatal("expected usable place")
	}
	if place.Rating != 4.73 {
		t.Fatalf("expected 4.73 rating, got %v", place.Rating)
	}
}

func TestNormalizeItemRejectsImpossibleRating(t *testing.T) {
	place, ok := normalizeItem(item{
		ID:      "700000010124",
		Name:    "Demo Cafe",
		Point:   &point{Lat: 59.93, Lon: 30.32},
		Reviews: &reviews{GeneralRating: 7.5},
	}, "spb", "Санкт-Петербург")
	if !ok {
		t.Fatal("expected usable place")
	}
	if place.Rating != 0 {
		t.Fatalf("impossible rating must be discarded, got %v", place.Rating)
	}
}


func TestNormalizeItemMapsReviewCountAndSchedule(t *testing.T) {
	place, ok := normalizeItem(item{
		ID:          "700000010200",
		Name:        "Late Cafe",
		AddressName: "Литейный проспект, 10",
		Point:       &point{Lat: 59.94, Lon: 30.35},
		Reviews: &reviews{
			GeneralRating:      4.6,
			GeneralReviewCount: 128,
			ReviewCount:        121,
		},
		Schedule: &schedule{
			Mon: scheduleDay{WorkingHours: []workingHours{{From: "09:00", To: "23:00"}}},
			Fri: scheduleDay{WorkingHours: []workingHours{{From: "10:00", To: "02:00"}}},
		},
		Description: "Авторская кофейня",
	}, "spb", "Санкт-Петербург")
	if !ok {
		t.Fatal("expected usable place")
	}
	if place.ReviewCount != 128 {
		t.Fatalf("expected review count 128, got %d", place.ReviewCount)
	}
	if place.OpeningHours == nil {
		t.Fatal("expected opening hours")
	}
	if got := place.OpeningHours.Days["mon"]; len(got) != 1 || got[0].From != "09:00" || got[0].To != "23:00" {
		t.Fatalf("unexpected monday hours: %#v", got)
	}
	if place.Description != "Авторская кофейня" {
		t.Fatalf("unexpected description: %q", place.Description)
	}
}

func TestNormalizeScheduleHandles24x7(t *testing.T) {
	hours := normalizeSchedule(&schedule{Is24x7: true})
	if hours == nil || !hours.Is24x7 {
		t.Fatalf("expected 24x7 hours, got %#v", hours)
	}
}

func TestNormalizeScheduleDropsEmptySchedule(t *testing.T) {
	if hours := normalizeSchedule(&schedule{}); hours != nil {
		t.Fatalf("expected nil empty schedule, got %#v", hours)
	}
}


func TestValidCoordinateForMapDiscovery(t *testing.T) {
	tests := []struct {
		lat  float64
		lon  float64
		want bool
	}{
		{lat: 59.9386, lon: 30.3141, want: true},
		{lat: 55.7558, lon: 37.6173, want: true},
		{lat: -90, lon: -180, want: true},
		{lat: 90, lon: 180, want: true},
		{lat: 90.1, lon: 30, want: false},
		{lat: 55, lon: 180.1, want: false},
	}

	for _, tc := range tests {
		if got := validCoordinate(tc.lat, tc.lon); got != tc.want {
			t.Fatalf("validCoordinate(%v, %v) = %v, want %v", tc.lat, tc.lon, got, tc.want)
		}
	}
}
