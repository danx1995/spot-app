package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/danx1995/spot-app/services/api/internal/auth"
	"github.com/danx1995/spot-app/services/api/internal/cloud"
)

type telegramAuthRequest struct {
	InitData string `json:"init_data"`
}

func registerTelegramAuthRoutes(
	mux *http.ServeMux,
	store cloud.Store,
	tokens *auth.TokenService,
	verifier *auth.TelegramVerifier,
) {
	mux.HandleFunc("POST /api/v1/auth/telegram", func(w http.ResponseWriter, r *http.Request) {
		if !verifier.Enabled() {
			writeError(w, http.StatusServiceUnavailable, "telegram login is not configured")
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 96<<10)
		var request telegramAuthRequest
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil || request.InitData == "" {
			writeError(w, http.StatusBadRequest, "invalid telegram auth payload")
			return
		}

		user, err := verifier.Verify(request.InitData)
		switch {
		case errors.Is(err, auth.ErrProviderNotConfigured):
			writeError(w, http.StatusServiceUnavailable, "telegram login is not configured")
			return
		case errors.Is(err, auth.ErrInvalidTelegramInitData):
			writeError(w, http.StatusUnauthorized, "invalid telegram init data")
			return
		case err != nil:
			writeError(w, http.StatusUnauthorized, "telegram verification failed")
			return
		}

		identity := auth.TelegramIdentity(user)
		profile, err := store.FindUserByIdentity(r.Context(), identity.Provider, identity.Subject)
		if errors.Is(err, cloud.ErrIdentityNotFound) {
			userID, createErr := store.CreateGuest(r.Context())
			if createErr != nil {
				writeError(w, http.StatusInternalServerError, "failed to create telegram profile")
				return
			}

			profile, err = store.LinkIdentity(r.Context(), userID, cloud.VerifiedIdentity{
				Provider:      identity.Provider,
				Subject:       identity.Subject,
				DisplayName:   identity.DisplayName,
				AvatarURL:     identity.AvatarURL,
				EmailVerified: false,
			})
			if errors.Is(err, cloud.ErrIdentityInUse) {
				profile, err = store.FindUserByIdentity(r.Context(), identity.Provider, identity.Subject)
			}
		}

		switch {
		case errors.Is(err, cloud.ErrUserNotFound), errors.Is(err, cloud.ErrIdentityNotFound):
			writeError(w, http.StatusNotFound, "telegram profile not found")
			return
		case errors.Is(err, cloud.ErrInvalidProfile):
			writeError(w, http.StatusBadRequest, "invalid telegram profile")
			return
		case err != nil:
			writeError(w, http.StatusInternalServerError, "failed to open telegram profile")
			return
		}

		if profile.DisplayName == "" || profile.AvatarURL == "" {
			name := identity.DisplayName
			avatar := identity.AvatarURL
			patch := cloud.UserProfilePatch{}
			if profile.DisplayName == "" && name != "" {
				patch.DisplayName = &name
			}
			if profile.AvatarURL == "" && avatar != "" {
				patch.AvatarURL = &avatar
			}
			if patch.DisplayName != nil || patch.AvatarURL != nil {
				if updated, patchErr := store.PatchUserProfile(r.Context(), profile.ID, patch); patchErr == nil {
					profile = updated
				}
			}
		}

		token, err := tokens.Issue(profile.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create telegram session")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"user_id": profile.ID,
			"token": token,
			"profile": profile,
			"telegram": map[string]any{
				"id": user.ID,
				"username": user.Username,
				"language_code": user.LanguageCode,
			},
			"issued_at": time.Now().UTC(),
		})
	})
}
