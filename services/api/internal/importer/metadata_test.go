package importer

import "testing"

func TestParsePageMetadataPrefersOpenGraph(t *testing.T) {
	document := `<!doctype html>
	<html>
	  <head>
	    <title>Fallback title</title>
	    <meta name="description" content="Fallback description">
	    <meta property="og:title" content="Birch on Instagram">
	    <meta content="Birch, Кирочная улица 3. Петербург." property="og:description">
	  </head>
	</html>`

	metadata := parsePageMetadata(document)
	if metadata.Title != "Birch on Instagram" {
		t.Fatalf("unexpected title: %q", metadata.Title)
	}
	if metadata.Description != "Birch, Кирочная улица 3. Петербург." {
		t.Fatalf("unexpected description: %q", metadata.Description)
	}
}

func TestParsePageMetadataDecodesEntitiesAndWhitespace(t *testing.T) {
	document := `<html><head>
	  <meta property='og:title' content='Birch &amp; Friends'>
	  <meta property='og:description' content='  Кирочная&nbsp;улица, 3
	    Санкт-Петербург  '>
	</head></html>`

	metadata := parsePageMetadata(document)
	if metadata.Title != "Birch & Friends" {
		t.Fatalf("unexpected title: %q", metadata.Title)
	}
	if metadata.Description != "Кирочная улица, 3 Санкт-Петербург" {
		t.Fatalf("unexpected description: %q", metadata.Description)
	}
}

func TestMetadataSearchQueryStripsPlatformBoilerplate(t *testing.T) {
	query := metadataSearchQuery(PageMetadata{
		Title:       "Birch on Instagram",
		Description: "Birch — ресторан на Кирочной улице, 3. Санкт-Петербург.",
	}, "instagram")

	if query == "" {
		t.Fatal("expected metadata query")
	}
	if normalizeText(query) == "instagram" {
		t.Fatalf("platform boilerplate leaked into query: %q", query)
	}
	if cityFromText(query) != "spb" {
		t.Fatalf("expected city hint from metadata, got query %q", query)
	}
}

func TestMetadataFetchAllowlist(t *testing.T) {
	for _, platform := range []string{"instagram", "tiktok", "telegram"} {
		if !metadataPlatformSupported(platform) {
			t.Fatalf("expected %s to be supported", platform)
		}
	}
	for _, platform := range []string{"web", "2gis", "yandex_maps"} {
		if metadataPlatformSupported(platform) {
			t.Fatalf("did not expect %s to be fetched as social metadata", platform)
		}
	}
}
