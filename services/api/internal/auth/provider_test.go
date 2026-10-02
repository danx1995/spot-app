package auth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func makeProviderToken(t *testing.T, key *rsa.PrivateKey, keyID string, claims map[string]any) string {
	t.Helper()

	headerBytes, err := json.Marshal(map[string]any{
		"alg": "RS256",
		"kid": keyID,
	})
	if err != nil {
		t.Fatal(err)
	}
	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}

	header := base64.RawURLEncoding.EncodeToString(headerBytes)
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signed := header + "." + payload
	digest := sha256.Sum256([]byte(signed))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}

	return signed + "." + base64.RawURLEncoding.EncodeToString(signature)
}

func TestProviderVerifierAcceptsValidGoogleToken(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	verifier := NewProviderVerifier("google-client", "")
	verifier.cache["google"] = providerKeyCache{
		keys: map[string]*rsa.PublicKey{
			"k1": &key.PublicKey,
		},
		expiresAt: time.Now().Add(time.Hour),
	}

	token := makeProviderToken(t, key, "k1", map[string]any{
		"iss":            "https://accounts.google.com",
		"sub":            "subject-123",
		"aud":            "google-client",
		"exp":            time.Now().Add(time.Hour).Unix(),
		"iat":            time.Now().Add(-time.Minute).Unix(),
		"email":          "User@Example.com",
		"email_verified": true,
		"name":           "Demo User",
		"picture":        "https://example.com/avatar.jpg",
		"nonce":          "nonce-1",
	})

	identity, err := verifier.Verify(context.Background(), "google", token, "nonce-1")
	if err != nil {
		t.Fatal(err)
	}
	if identity.Subject != "subject-123" || identity.Email != "User@Example.com" || !identity.EmailVerified {
		t.Fatalf("unexpected identity: %#v", identity)
	}
}

func TestProviderVerifierRejectsWrongAudience(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	verifier := NewProviderVerifier("google-client", "")
	verifier.cache["google"] = providerKeyCache{
		keys: map[string]*rsa.PublicKey{
			"k1": &key.PublicKey,
		},
		expiresAt: time.Now().Add(time.Hour),
	}

	token := makeProviderToken(t, key, "k1", map[string]any{
		"iss": "https://accounts.google.com",
		"sub": "subject-123",
		"aud": "other-client",
		"exp": time.Now().Add(time.Hour).Unix(),
	})

	if _, err := verifier.Verify(context.Background(), "google", token, ""); err != ErrInvalidProviderToken {
		t.Fatalf("expected invalid provider token, got %v", err)
	}
}

func TestProviderVerifierRequiresConfiguredAudience(t *testing.T) {
	verifier := NewProviderVerifier("", "")
	if verifier.Enabled("google") || verifier.Enabled("apple") {
		t.Fatal("providers should be disabled without client ids")
	}
	if _, err := verifier.Verify(context.Background(), "google", "x.y.z", ""); err != ErrProviderNotConfigured {
		t.Fatalf("expected provider-not-configured error, got %v", err)
	}
}


func TestProviderVerifierRequiresAuthorizedPartyForMultipleAudiences(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	verifier := NewProviderVerifier("google-client", "")
	verifier.cache["google"] = providerKeyCache{
		keys: map[string]*rsa.PublicKey{
			"k1": &key.PublicKey,
		},
		expiresAt: time.Now().Add(time.Hour),
	}

	token := makeProviderToken(t, key, "k1", map[string]any{
		"iss": "https://accounts.google.com",
		"sub": "subject-123",
		"aud": []string{"google-client", "other-client"},
		"azp": "other-client",
		"exp": time.Now().Add(time.Hour).Unix(),
	})

	if _, err := verifier.Verify(context.Background(), "google", token, ""); err != ErrInvalidProviderToken {
		t.Fatalf("expected invalid authorized party, got %v", err)
	}
}
