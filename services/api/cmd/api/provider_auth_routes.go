package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/danx1995/spot-app/services/api/internal/auth"
	"github.com/danx1995/spot-app/services/api/internal/cloud"
)

type providerAuthRequest struct {
	Provider string `json:"provider"`
	IDToken  string `json:"id_token"`
	Nonce    string `json:"nonce,omitempty"`
}

func registerProviderAuthRoutes(
	mux *http.ServeMux,
	store cloud.Store,
	tokens *auth.TokenService,
	verifier *auth.ProviderVerifier,
) {
	mux.HandleFunc("GET /api/v1/auth/providers", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{
			"google": verifier.Enabled("google"),
			"apple":  verifier.Enabled("apple"),
		})
	})

	mux.HandleFunc("POST /api/v1/me/identity/link", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		request, ok := decodeProviderAuthRequest(w, r)
		if !ok {
			return
		}

		identity, err := verifier.Verify(
			r.Context(),
			request.Provider,
			request.IDToken,
			request.Nonce,
		)
		switch {
		case errors.Is(err, auth.ErrProviderNotConfigured):
			writeError(w, http.StatusServiceUnavailable, "provider login is not configured")
			return
		case errors.Is(err, auth.ErrInvalidProviderToken):
			writeError(w, http.StatusUnauthorized, "invalid provider token")
			return
		case err != nil:
			writeError(w, http.StatusBadGateway, "provider verification unavailable")
			return
		}

		profile, err := store.LinkIdentity(r.Context(), userID, cloud.VerifiedIdentity{
			Provider:      identity.Provider,
			Subject:       identity.Subject,
			Email:         identity.Email,
			EmailVerified: identity.EmailVerified,
			DisplayName:   identity.DisplayName,
			AvatarURL:     identity.AvatarURL,
		})
		switch {
		case errors.Is(err, cloud.ErrIdentityInUse):
			writeError(w, http.StatusConflict, "identity is already linked to another profile")
			return
		case errors.Is(err, cloud.ErrInvalidProfile):
			writeError(w, http.StatusBadRequest, "invalid identity")
			return
		case errors.Is(err, cloud.ErrUserNotFound):
			writeError(w, http.StatusNotFound, "user not found")
			return
		case err != nil:
			writeError(w, http.StatusInternalServerError, "failed to link identity")
			return
		}

		writeJSON(w, http.StatusOK, profile)
	})

	mux.HandleFunc("POST /api/v1/auth/provider", func(w http.ResponseWriter, r *http.Request) {
		request, ok := decodeProviderAuthRequest(w, r)
		if !ok {
			return
		}

		identity, err := verifier.Verify(
			r.Context(),
			request.Provider,
			request.IDToken,
			request.Nonce,
		)
		switch {
		case errors.Is(err, auth.ErrProviderNotConfigured):
			writeError(w, http.StatusServiceUnavailable, "provider login is not configured")
			return
		case errors.Is(err, auth.ErrInvalidProviderToken):
			writeError(w, http.StatusUnauthorized, "invalid provider token")
			return
		case err != nil:
			writeError(w, http.StatusBadGateway, "provider verification unavailable")
			return
		}

		profile, err := store.FindUserByIdentity(r.Context(), identity.Provider, identity.Subject)
		switch {
		case errors.Is(err, cloud.ErrIdentityNotFound):
			writeError(w, http.StatusNotFound, "provider identity is not linked")
			return
		case errors.Is(err, cloud.ErrUserNotFound):
			writeError(w, http.StatusNotFound, "user not found")
			return
		case err != nil:
			writeError(w, http.StatusInternalServerError, "failed to load linked profile")
			return
		}

		token, err := tokens.Issue(profile.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create session")
			return
		}

		writeJSON(w, http.StatusOK, guestSessionResponse{
			UserID: profile.ID,
			Token:  token,
		})
	})
}

func decodeProviderAuthRequest(w http.ResponseWriter, r *http.Request) (providerAuthRequest, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)

	var request providerAuthRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, "invalid provider auth payload")
		return providerAuthRequest{}, false
	}
	if request.Provider == "" || request.IDToken == "" {
		writeError(w, http.StatusBadRequest, "provider and id_token are required")
		return providerAuthRequest{}, false
	}
	return request, true
}
