package migrations

import "testing"

func TestEmbeddedVersionsSorted(t *testing.T) {
	versions, err := EmbeddedVersions()
	if err != nil {
		t.Fatal(err)
	}

	if len(versions) == 0 {
		t.Fatal("expected at least one runtime migration")
	}
	if versions[0] != "0004_account_profiles.sql" {
		t.Fatalf("unexpected first runtime migration: %q", versions[0])
	}
}
