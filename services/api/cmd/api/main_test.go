package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWithCommonHeadersAllowsConfiguredOrigin(t *testing.T) {
	handler := withCommonHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), map[string]struct{}{
		"https://spot-telegram.example": {},
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "https://spot-telegram.example")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}
	if got := res.Header().Get("Access-Control-Allow-Origin"); got != "https://spot-telegram.example" {
		t.Fatalf("unexpected allow origin %q", got)
	}
}

func TestWithCommonHeadersRejectsUnknownPreflightOrigin(t *testing.T) {
	handler := withCommonHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("preflight must not reach application handler")
	}), map[string]struct{}{
		"https://spot-telegram.example": {},
	})

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/auth/telegram", nil)
	req.Header.Set("Origin", "https://evil.example")
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", res.Code)
	}
}
