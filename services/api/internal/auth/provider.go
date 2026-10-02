package auth

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

var (
	ErrProviderNotConfigured = errors.New("provider is not configured")
	ErrInvalidProviderToken  = errors.New("invalid provider token")
)

type ProviderIdentity struct {
	Provider      string
	Subject       string
	Email         string
	EmailVerified bool
	DisplayName   string
	AvatarURL     string
}

type ProviderVerifier struct {
	client          *http.Client
	googleAudiences map[string]struct{}
	appleAudiences  map[string]struct{}

	mu    sync.Mutex
	cache map[string]providerKeyCache
}

type providerKeyCache struct {
	keys      map[string]*rsa.PublicKey
	expiresAt time.Time
}

type jwtHeader struct {
	Algorithm string `json:"alg"`
	KeyID     string `json:"kid"`
}

type jwtClaims struct {
	Issuer        string     `json:"iss"`
	Subject       string     `json:"sub"`
	Audience        stringList `json:"aud"`
	AuthorizedParty string     `json:"azp"`
	ExpiresAt       int64      `json:"exp"`
	IssuedAt      int64      `json:"iat"`
	Nonce         string     `json:"nonce"`
	Email         string     `json:"email"`
	EmailVerified boolish    `json:"email_verified"`
	Name          string     `json:"name"`
	Picture       string     `json:"picture"`
}

type stringList []string

func (s *stringList) UnmarshalJSON(data []byte) error {
	var single string
	if err := json.Unmarshal(data, &single); err == nil {
		*s = []string{single}
		return nil
	}

	var many []string
	if err := json.Unmarshal(data, &many); err != nil {
		return err
	}
	*s = many
	return nil
}

type boolish bool

func (b *boolish) UnmarshalJSON(data []byte) error {
	var value bool
	if err := json.Unmarshal(data, &value); err == nil {
		*b = boolish(value)
		return nil
	}

	var text string
	if err := json.Unmarshal(data, &text); err != nil {
		return err
	}
	*b = boolish(strings.EqualFold(strings.TrimSpace(text), "true"))
	return nil
}

type jwksResponse struct {
	Keys []jwk `json:"keys"`
}

type jwk struct {
	KeyID     string `json:"kid"`
	KeyType   string `json:"kty"`
	Algorithm string `json:"alg"`
	Use       string `json:"use"`
	Modulus   string `json:"n"`
	Exponent  string `json:"e"`
}

func NewProviderVerifier(googleClientIDs, appleClientIDs string) *ProviderVerifier {
	return &ProviderVerifier{
		client: &http.Client{
			Timeout: 6 * time.Second,
		},
		googleAudiences: parseAudiences(googleClientIDs),
		appleAudiences:  parseAudiences(appleClientIDs),
		cache:           make(map[string]providerKeyCache),
	}
}

func (v *ProviderVerifier) Enabled(provider string) bool {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "google":
		return len(v.googleAudiences) > 0
	case "apple":
		return len(v.appleAudiences) > 0
	default:
		return false
	}
}

func (v *ProviderVerifier) Verify(
	ctx context.Context,
	provider string,
	idToken string,
	nonce string,
) (ProviderIdentity, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	idToken = strings.TrimSpace(idToken)
	nonce = strings.TrimSpace(nonce)

	if !v.Enabled(provider) {
		return ProviderIdentity{}, ErrProviderNotConfigured
	}
	if idToken == "" || len(idToken) > 32*1024 {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}

	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}

	var header jwtHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}
	if header.Algorithm != "RS256" || strings.TrimSpace(header.KeyID) == "" {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}

	key, err := v.publicKey(ctx, provider, header.KeyID)
	if err != nil {
		return ProviderIdentity{}, err
	}

	signed := parts[0] + "." + parts[1]
	digest := sha256.Sum256([]byte(signed))
	if err := rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], signature); err != nil {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}

	var claims jwtClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}

	now := time.Now().Unix()
	if claims.Subject == "" || claims.ExpiresAt <= now {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}
	if claims.IssuedAt > 0 && claims.IssuedAt > now+300 {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}
	if nonce != "" && claims.Nonce != nonce {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}
	if !v.validIssuer(provider, claims.Issuer) || !v.validAudience(provider, claims.Audience) {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}
	if len(claims.Audience) > 1 && !v.validAuthorizedParty(provider, claims.AuthorizedParty) {
		return ProviderIdentity{}, ErrInvalidProviderToken
	}

	return ProviderIdentity{
		Provider:      provider,
		Subject:       claims.Subject,
		Email:         strings.TrimSpace(claims.Email),
		EmailVerified: bool(claims.EmailVerified),
		DisplayName:   strings.TrimSpace(claims.Name),
		AvatarURL:     strings.TrimSpace(claims.Picture),
	}, nil
}

func (v *ProviderVerifier) validIssuer(provider, issuer string) bool {
	switch provider {
	case "google":
		return issuer == "https://accounts.google.com" || issuer == "accounts.google.com"
	case "apple":
		return issuer == "https://appleid.apple.com"
	default:
		return false
	}
}

func (v *ProviderVerifier) validAudience(provider string, audience []string) bool {
	allowed := v.googleAudiences
	if provider == "apple" {
		allowed = v.appleAudiences
	}
	for _, candidate := range audience {
		if _, ok := allowed[candidate]; ok {
			return true
		}
	}
	return false
}

func (v *ProviderVerifier) validAuthorizedParty(provider, candidate string) bool {
	candidate = strings.TrimSpace(candidate)
	if candidate == "" {
		return false
	}

	allowed := v.googleAudiences
	if provider == "apple" {
		allowed = v.appleAudiences
	}
	_, ok := allowed[candidate]
	return ok
}

func (v *ProviderVerifier) publicKey(ctx context.Context, provider, keyID string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	cached := v.cache[provider]
	if cached.expiresAt.After(time.Now()) {
		if key := cached.keys[keyID]; key != nil {
			v.mu.Unlock()
			return key, nil
		}
	}
	v.mu.Unlock()

	keys, err := v.fetchKeys(ctx, provider)
	if err != nil {
		return nil, err
	}

	v.mu.Lock()
	v.cache[provider] = providerKeyCache{
		keys:      keys,
		expiresAt: time.Now().Add(time.Hour),
	}
	key := keys[keyID]
	v.mu.Unlock()

	if key == nil {
		return nil, ErrInvalidProviderToken
	}
	return key, nil
}

func (v *ProviderVerifier) fetchKeys(ctx context.Context, provider string) (map[string]*rsa.PublicKey, error) {
	endpoint := ""
	switch provider {
	case "google":
		endpoint = "https://www.googleapis.com/oauth2/v3/certs"
	case "apple":
		endpoint = "https://appleid.apple.com/auth/keys"
	default:
		return nil, ErrInvalidProviderToken
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")

	response, err := v.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch provider keys: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("provider keys returned %d", response.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	var payload jwksResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}

	keys := make(map[string]*rsa.PublicKey, len(payload.Keys))
	for _, item := range payload.Keys {
		if item.KeyID == "" || item.KeyType != "RSA" {
			continue
		}
		if item.Algorithm != "" && item.Algorithm != "RS256" {
			continue
		}

		modulusBytes, err := base64.RawURLEncoding.DecodeString(item.Modulus)
		if err != nil || len(modulusBytes) == 0 {
			continue
		}
		exponentBytes, err := base64.RawURLEncoding.DecodeString(item.Exponent)
		if err != nil || len(exponentBytes) == 0 {
			continue
		}

		exponent := 0
		for _, value := range exponentBytes {
			exponent = exponent<<8 + int(value)
		}
		if exponent <= 1 {
			continue
		}

		keys[item.KeyID] = &rsa.PublicKey{
			N: new(big.Int).SetBytes(modulusBytes),
			E: exponent,
		}
	}

	if len(keys) == 0 {
		return nil, ErrInvalidProviderToken
	}
	return keys, nil
}

func parseAudiences(value string) map[string]struct{} {
	result := make(map[string]struct{})
	for _, candidate := range strings.Split(value, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate != "" {
			result[candidate] = struct{}{}
		}
	}
	return result
}
