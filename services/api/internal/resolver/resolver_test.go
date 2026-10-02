package resolver

import "testing"

func TestMixedDiscoveryPageRotatesCategoriesBeforePagingProvider(t *testing.T) {
	tests := []struct {
		page         int
		wantCategory string
		wantProvider int
	}{
		{1, "restaurant", 1},
		{2, "coffee", 1},
		{3, "bar", 1},
		{4, "hotel", 1},
		{5, "culture", 1},
		{6, "entertainment", 1},
		{7, "shop", 1},
		{8, "park", 1},
		{9, "restaurant", 2},
		{16, "park", 2},
		{17, "restaurant", 3},
	}

	for _, tt := range tests {
		category, providerPage := mixedDiscoveryPage(tt.page)
		if category != tt.wantCategory || providerPage != tt.wantProvider {
			t.Fatalf(
				"page %d: got (%q,%d), want (%q,%d)",
				tt.page,
				category,
				providerPage,
				tt.wantCategory,
				tt.wantProvider,
			)
		}
	}
}

func TestCategoryDiscoveryQueryCoversTelegramCatalog(t *testing.T) {
	categories := []string{
		"restaurant",
		"coffee",
		"bar",
		"hotel",
		"culture",
		"entertainment",
		"shop",
		"park",
	}

	for _, category := range categories {
		if query := categoryDiscoveryQuery(category); query == "" {
			t.Fatalf("category %q has no discovery query", category)
		}
	}

	if query := categoryDiscoveryQuery("unknown"); query != "" {
		t.Fatalf("unknown category returned %q", query)
	}
}

func TestCategoryDiscoveryPageRotatesQueryVariants(t *testing.T) {
	query, providerPage := categoryDiscoveryPage("culture", 1)
	if query != "музеи" || providerPage != 1 {
		t.Fatalf("culture page 1 = (%q,%d)", query, providerPage)
	}

	query, providerPage = categoryDiscoveryPage("culture", 5)
	if query != "библиотеки" || providerPage != 1 {
		t.Fatalf("culture page 5 = (%q,%d)", query, providerPage)
	}

	query, providerPage = categoryDiscoveryPage("culture", 6)
	if query != "музеи" || providerPage != 2 {
		t.Fatalf("culture page 6 = (%q,%d)", query, providerPage)
	}
}
