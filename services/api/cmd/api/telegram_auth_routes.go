package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/danx1995/spot-app/services/api/internal/auth"
	"github.com/danx1995/spot-app/services/api/internal/cloud"
)

type telegramAuthRequest struct {
	InitData string `json:"init_data"`
}

type telegramAuthResponse struct {
	UserID  string            `json:"user_id"`
	Token   string            `json:"token"`
	Profile cloud.UserProfile `json:"profile"`
}

func registerTelegramAuthRoutes(
	mux *http.ServeMux,
	store cloud.Store,
	tokens *auth.TokenService,
	verifier *auth.TelegramVerifier,
) {
	mux.HandleFunc("POST /api/v1/auth/telegram", func(w http.ResponseWriter, r *http.Request) {
		if verifier == nil || !verifier.Enabled() {
			writeError(w, http.StatusServiceUnavailable, "telegram auth is not configured")
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
		var request telegramAuthRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.InitData == "" {
			writeError(w, http.StatusBadRequest, "invalid telegram auth payload")
			return
		}

		identity, err := verifier.Verify(request.InitData)
		switch {
		case errors.Is(err, auth.ErrTelegramExpired):
			writeError(w, http.StatusUnauthorized, "telegram session expired")
			return
		case err != nil:
			writeError(w, http.StatusUnauthorized, "invalid telegram session")
			return
		}

		profile, err := store.FindUserByIdentity(r.Context(), identity.Provider, identity.Subject)
		if errors.Is(err, cloud.ErrIdentityNotFound) {
			userID, createErr := store.CreateGuest(r.Context())
			if createErr != nil {
				writeError(w, http.StatusInternalServerError, "failed to create telegram account")
				return
			}

			profile, err = store.LinkIdentity(r.Context(), userID, identity)
			if errors.Is(err, cloud.ErrIdentityInUse) {
				profile, err = store.FindUserByIdentity(r.Context(), identity.Provider, identity.Subject)
			}
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to open telegram account")
			return
		}

		token, err := tokens.Issue(profile.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create telegram session")
			return
		}

		writeJSON(w, http.StatusOK, telegramAuthResponse{
			UserID:  profile.ID,
			Token:   token,
			Profile: profile,
		})
	})
}
