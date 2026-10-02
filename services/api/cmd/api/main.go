package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/danx1995/spot-app/services/api/internal/auth"
	"github.com/danx1995/spot-app/services/api/internal/catalog"
	"github.com/danx1995/spot-app/services/api/internal/cloud"
	"github.com/danx1995/spot-app/services/api/internal/importer"
	"github.com/danx1995/spot-app/services/api/internal/library"
	"github.com/danx1995/spot-app/services/api/internal/provider/twogis"
	"github.com/danx1995/spot-app/services/api/internal/resolver"
)

type guestSessionResponse struct {
	UserID string `json:"user_id"`
	Token  string `json:"token"`
}

type cloudStateResponse struct {
	Revision  int64            `json:"revision"`
	State     *json.RawMessage `json:"state"`
	UpdatedAt *time.Time       `json:"updated_at"`
}

type putStateRequest struct {
	BaseRevision int64           `json:"base_revision"`
	State        json.RawMessage `json:"state"`
}

type linkImportRequest struct {
	URL  string `json:"url"`
	City string `json:"city"`
}

func main() {
	ctx := context.Background()

	twoGIS := twogis.New(os.Getenv("TWO_GIS_API_KEY"))
	placesResolver := resolver.New(twoGIS)
	linkImporter := importer.New(twoGIS)

	databaseURL := os.Getenv("DATABASE_URL")
	syncStore := cloud.NewStore(ctx, databaseURL)
	defer syncStore.Close()

	libraryStore := library.NewStore(ctx, databaseURL)
	defer libraryStore.Close()

	authSecret := strings.TrimSpace(os.Getenv("AUTH_SECRET"))
	if len(authSecret) < 16 {
		authSecret = "spot-development-secret-change-me"
		log.Printf("WARNING: AUTH_SECRET is not configured; using development-only secret")
	}
	tokens := auth.NewTokenService(authSecret, 365*24*time.Hour)

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ok",
			"service": "spot-api",
			"time": time.Now().UTC(),
			"places_provider": map[string]bool{
				"2gis": twoGIS.Enabled(),
			},
			"sync_store": syncStore.Mode(),
			"library_store": libraryStore.Mode(),
		})
	})

	mux.HandleFunc("POST /api/v1/auth/guest", func(w http.ResponseWriter, r *http.Request) {
		userID, err := syncStore.CreateGuest(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create guest session")
			return
		}

		token, err := tokens.Issue(userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create guest token")
			return
		}

		writeJSON(w, http.StatusCreated, guestSessionResponse{
			UserID: userID,
			Token:  token,
		})
	})

	mux.HandleFunc("GET /api/v1/me/state", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		state, err := syncStore.GetState(r.Context(), userID)
		if errors.Is(err, cloud.ErrStateNotFound) {
			writeJSON(w, http.StatusOK, cloudStateResponse{
				Revision: 0,
				State:    nil,
			})
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load cloud state")
			return
		}

		writeJSON(w, http.StatusOK, cloudStateResponse{
			Revision:  state.Revision,
			State:     &state.Data,
			UpdatedAt: &state.UpdatedAt,
		})
	})

	mux.HandleFunc("PUT /api/v1/me/state", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
		var request putStateRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeError(w, http.StatusBadRequest, "invalid state payload")
			return
		}
		if request.BaseRevision < 0 || !json.Valid(request.State) {
			writeError(w, http.StatusBadRequest, "invalid state revision or json")
			return
		}

		state, err := syncStore.PutState(r.Context(), userID, request.BaseRevision, request.State)
		if errors.Is(err, cloud.ErrRevisionConflict) {
			writeJSON(w, http.StatusConflict, cloudStateResponse{
				Revision:  state.Revision,
				State:     &state.Data,
				UpdatedAt: &state.UpdatedAt,
			})
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save cloud state")
			return
		}

		writeJSON(w, http.StatusOK, cloudStateResponse{
			Revision:  state.Revision,
			State:     &state.Data,
			UpdatedAt: &state.UpdatedAt,
		})
	})

	mux.HandleFunc("POST /api/v1/imports/link", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireUser(w, r, tokens); !ok {
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
		var request linkImportRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeError(w, http.StatusBadRequest, "invalid link import payload")
			return
		}
		if request.City == "" {
			request.City = "spb"
		}

		result, err := linkImporter.Resolve(r.Context(), request.URL, request.City)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, result)
	})

	registerLibraryRoutes(mux, libraryStore, tokens)

	mux.HandleFunc("GET /api/v1/cities", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, catalog.Cities)
	})

	mux.HandleFunc("GET /api/v1/categories", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, catalog.Categories)
	})

	mux.HandleFunc("GET /api/v1/places", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		city := r.URL.Query().Get("city")
		category := r.URL.Query().Get("category")

		if city == "" {
			city = "spb"
		}

		places, err := placesResolver.Search(r.Context(), q, city, category)
		if err != nil {
			writeError(w, http.StatusBadGateway, "places search unavailable")
			return
		}

		writeJSON(w, http.StatusOK, places)
	})

	mux.HandleFunc("GET /api/v1/places/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/v1/places/")
		if id == "" {
			writeError(w, http.StatusBadRequest, "place id is required")
			return
		}

		place, ok := catalog.FindPlace(id)
		if !ok {
			writeError(w, http.StatusNotFound, "place not found")
			return
		}

		writeJSON(w, http.StatusOK, place)
	})

	handler := withCommonHeaders(mux)

	port := os.Getenv("API_PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("SPOT API listening on :%s (sync=%s, library=%s)", port, syncStore.Mode(), libraryStore.Mode())
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}

func requireUser(w http.ResponseWriter, r *http.Request, tokens *auth.TokenService) (string, bool) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		writeError(w, http.StatusUnauthorized, "authorization required")
		return "", false
	}

	claims, err := tokens.Parse(strings.TrimSpace(strings.TrimPrefix(header, prefix)))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid or expired session")
		return "", false
	}

	return claims.UserID, true
}

func withCommonHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
