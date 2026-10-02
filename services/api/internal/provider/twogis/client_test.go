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
