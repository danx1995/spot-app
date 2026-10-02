package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/danx1995/spot-app/services/api/internal/auth"
	"github.com/danx1995/spot-app/services/api/internal/cloud"
)

func registerProfileRoutes(mux *http.ServeMux, store cloud.Store, tokens *auth.TokenService) {
	mux.HandleFunc("GET /api/v1/me/profile", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		profile, err := store.GetUserProfile(r.Context(), userID)
		if errors.Is(err, cloud.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load profile")
			return
		}

		writeJSON(w, http.StatusOK, profile)
	})

	mux.HandleFunc("PATCH /api/v1/me/profile", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
		var patch cloud.UserProfilePatch
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&patch); err != nil {
			writeError(w, http.StatusBadRequest, "invalid profile payload")
			return
		}

		profile, err := store.PatchUserProfile(r.Context(), userID, patch)
		switch {
		case errors.Is(err, cloud.ErrInvalidProfile):
			writeError(w, http.StatusBadRequest, "invalid profile fields")
			return
		case errors.Is(err, cloud.ErrUserNotFound):
			writeError(w, http.StatusNotFound, "user not found")
			return
		case err != nil:
			writeError(w, http.StatusInternalServerError, "failed to update profile")
			return
		}

		writeJSON(w, http.StatusOK, profile)
	})
}
