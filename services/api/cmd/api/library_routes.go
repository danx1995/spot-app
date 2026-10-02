package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/danx1995/spot-app/services/api/internal/auth"
	"github.com/danx1995/spot-app/services/api/internal/library"
)

func registerLibraryRoutes(mux *http.ServeMux, store library.Store, tokens *auth.TokenService) {
	mux.HandleFunc("POST /api/v1/me/places", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		var input library.SavePlaceInput
		if !decodeJSON(w, r, 256<<10, &input) {
			return
		}

		place, err := store.UpsertPlace(r.Context(), userID, input)
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, place)
	})

	mux.HandleFunc("POST /api/v1/me/places/{id}/share", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		shared, err := store.PublishPlace(r.Context(), userID, r.PathValue("id"))
		if err != nil {
			writeLibraryError(w, err)
			return
		}

		writeJSON(w, http.StatusCreated, shared)
	})

	mux.HandleFunc("GET /api/v1/me/places", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		filters := library.PlaceFilters{
			City:   strings.TrimSpace(r.URL.Query().Get("city")),
			Status: strings.TrimSpace(r.URL.Query().Get("status")),
		}
		if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
			value, err := strconv.Atoi(raw)
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid limit")
				return
			}
			filters.Limit = value
		}
		if raw := strings.TrimSpace(r.URL.Query().Get("before")); raw != "" {
			value, err := time.Parse(time.RFC3339, raw)
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid before cursor")
				return
			}
			filters.Before = &value
		}

		places, err := store.ListPlaces(r.Context(), userID, filters)
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, places)
	})

	mux.HandleFunc("GET /api/v1/me/places/nearby", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		lat, err := strconv.ParseFloat(strings.TrimSpace(r.URL.Query().Get("lat")), 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid lat")
			return
		}
		lng, err := strconv.ParseFloat(strings.TrimSpace(r.URL.Query().Get("lng")), 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid lng")
			return
		}

		query := library.NearbyQuery{
			Latitude:  lat,
			Longitude: lng,
		}
		if raw := strings.TrimSpace(r.URL.Query().Get("radius_m")); raw != "" {
			value, err := strconv.Atoi(raw)
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid radius_m")
				return
			}
			query.RadiusM = value
		}
		if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
			value, err := strconv.Atoi(raw)
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid limit")
				return
			}
			query.Limit = value
		}

		places, err := store.NearbyPlaces(r.Context(), userID, query)
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, places)
	})

	mux.HandleFunc("PATCH /api/v1/me/places/{id}", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		var patch library.PlacePatch
		if !decodeJSON(w, r, 64<<10, &patch) {
			return
		}

		place, err := store.PatchPlace(r.Context(), userID, r.PathValue("id"), patch)
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, place)
	})

	mux.HandleFunc("DELETE /api/v1/me/places/{id}", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		if err := store.DeletePlace(r.Context(), userID, r.PathValue("id")); err != nil {
			writeLibraryError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/v1/me/collections", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		var input library.CreateCollectionInput
		if !decodeJSON(w, r, 64<<10, &input) {
			return
		}

		collection, err := store.CreateCollection(r.Context(), userID, input)
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, collection)
	})

	mux.HandleFunc("GET /api/v1/me/collections", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		collections, err := store.ListCollections(r.Context(), userID)
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, collections)
	})

	mux.HandleFunc("GET /api/v1/me/collections/{id}", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		collection, err := store.GetCollection(r.Context(), userID, r.PathValue("id"))
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, collection)
	})

	mux.HandleFunc("PATCH /api/v1/me/collections/{id}", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		var patch library.CollectionPatch
		if !decodeJSON(w, r, 64<<10, &patch) {
			return
		}

		collection, err := store.PatchCollection(r.Context(), userID, r.PathValue("id"), patch)
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, collection)
	})

	mux.HandleFunc("DELETE /api/v1/me/collections/{id}", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		if err := store.DeleteCollection(r.Context(), userID, r.PathValue("id")); err != nil {
			writeLibraryError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("PUT /api/v1/me/collections/{collectionID}/places/{placeID}", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		collection, err := store.SetCollectionPlace(
			r.Context(),
			userID,
			r.PathValue("collectionID"),
			r.PathValue("placeID"),
			true,
		)
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, collection)
	})

	mux.HandleFunc("DELETE /api/v1/me/collections/{collectionID}/places/{placeID}", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		collection, err := store.SetCollectionPlace(
			r.Context(),
			userID,
			r.PathValue("collectionID"),
			r.PathValue("placeID"),
			false,
		)
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, collection)
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json payload")
		return false
	}
	return true
}

func writeLibraryError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, library.ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "invalid library input")
	case errors.Is(err, library.ErrNotFound):
		writeError(w, http.StatusNotFound, "library item not found")
	case errors.Is(err, library.ErrPlaceNotSaved):
		writeError(w, http.StatusConflict, "place must be saved before adding it to a collection")
	default:
		writeError(w, http.StatusInternalServerError, "library operation failed")
	}
}
