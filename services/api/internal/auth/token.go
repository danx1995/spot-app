package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("expired token")
)

type Claims struct {
	UserID string `json:"uid"`
	Exp    int64  `json:"exp"`
}

type TokenService struct {
	secret []byte
	ttl    time.Duration
}

func NewTokenService(secret string, ttl time.Duration) *TokenService {
	return &TokenService{
		secret: []byte(secret),
		ttl:    ttl,
	}
}

func (s *TokenService) Issue(userID string) (string, error) {
	if strings.TrimSpace(userID) == "" {
		return "", fmt.Errorf("user id is required")
	}
	if len(s.secret) < 16 {
		return "", fmt.Errorf("auth secret must be at least 16 bytes")
	}

	payload, err := json.Marshal(Claims{
		UserID: userID,
		Exp:    time.Now().Add(s.ttl).Unix(),
	})
	if err != nil {
		return "", err
	}

	body := base64.RawURLEncoding.EncodeToString(payload)
	sig := s.sign(body)
	return body + "." + sig, nil
}

func (s *TokenService) Parse(token string) (Claims, error) {
	var claims Claims

	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return claims, ErrInvalidToken
	}

	expected := s.sign(parts[0])
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return claims, ErrInvalidToken
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return claims, ErrInvalidToken
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return claims, ErrInvalidToken
	}
	if claims.UserID == "" || claims.Exp == 0 {
		return claims, ErrInvalidToken
	}
	if time.Now().Unix() >= claims.Exp {
		return claims, ErrExpiredToken
	}

	return claims, nil
}

func (s *TokenService) sign(body string) string {
	mac := hmac.New(sha256.New, s.secret)
	_, _ = mac.Write([]byte(body))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
