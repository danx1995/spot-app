package migrations

import "testing"

func TestEmbeddedVersionsSorted(t *testing.T) {
	versions, err := EmbeddedVersions()
	if err != nil {
		t.Fatal(err)
	}

	expected := []string{
		"0004_account_profiles.sql",
		"0005_account_transfer_codes.sql",
		"0006_auth_identities.sql",
		"0007_place_shares.sql",
	}
	if len(versions) != len(expected) {
		t.Fatalf("unexpected migration count: got %d want %d (%v)", len(versions), len(expected), versions)
	}
	for i := range expected {
		if versions[i] != expected[i] {
			t.Fatalf("unexpected migration at %d: got %q want %q", i, versions[i], expected[i])
		}
	}
}
