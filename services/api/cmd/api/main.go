package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/danx1995/spot-app/services/api/internal/accounttransfer"
	"github.com/danx1995/spot-app/services/api/internal/auth"
	"github.com/danx1995/spot-app/services/api/internal/catalog"
	"github.com/danx1995/spot-app/services/api/internal/cloud"
	"github.com/danx1995/spot-app/services/api/internal/importer"
	"github.com/danx1995/spot-app/services/api/internal/library"
	"github.com/danx1995/spot-app/services/api/internal/migrations"
	"github.com/danx1995/spot-app/services/api/internal/provider/twogis"
	"github.com/danx1995/spot-app/services/api/internal/resolver"
	"github.com/danx1995/spot-app/services/api/internal/routing"
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
	Hint string `json:"hint,omitempty"`
}

func main() {
	ctx := context.Background()

	twoGIS := twogis.New(os.Getenv("TWO_GIS_API_KEY"))
	placesResolver := resolver.New(twoGIS)
	linkImporter := importer.New(twoGIS, placesResolver)
	routeService := routing.New(twoGIS)

	databaseURL := os.Getenv("DATABASE_URL")
	if strings.TrimSpace(databaseURL) != "" {
		if err := migrations.Run(ctx, databaseURL); err != nil {
			log.Fatalf("database migrations failed: %v", err)
		}
	}

	syncStore := cloud.NewStore(ctx, databaseURL)
	defer syncStore.Close()

	libraryStore := library.NewStore(ctx, databaseURL)
	defer libraryStore.Close()

	transferStore := accounttransfer.NewStore(ctx, databaseURL)
	defer transferStore.Close()

	authSecret := strings.TrimSpace(os.Getenv("AUTH_SECRET"))
	if len(authSecret) < 16 {
		authSecret = "spot-development-secret-change-me"
		log.Printf("WARNING: AUTH_SECRET is not configured; using development-only secret")
	}
	tokens := auth.NewTokenService(authSecret, 365*24*time.Hour)
	providerVerifier := auth.NewProviderVerifier(
		os.Getenv("GOOGLE_CLIENT_IDS"),
		os.Getenv("APPLE_CLIENT_IDS"),
	)
	telegramVerifier := auth.NewTelegramVerifier(os.Getenv("TELEGRAM_BOT_TOKEN"))

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
			"library_store":  libraryStore.Mode(),
			"transfer_store": transferStore.Mode(),
			"auth_providers": map[string]bool{
				"google":   providerVerifier.Enabled("google"),
				"apple":    providerVerifier.Enabled("apple"),
				"telegram": telegramVerifier.Enabled(),
			},
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

		var previousState json.RawMessage
		if request.BaseRevision > 0 {
			if previous, previousErr := syncStore.GetState(r.Context(), userID); previousErr == nil {
				previousState = previous.Data
			}
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

		if projectionErr := library.ApplyCloudDelta(
			r.Context(),
			libraryStore,
			userID,
			previousState,
			request.State,
		); projectionErr != nil {
			log.Printf("library projection failed for user %s revision %d: %v", userID, state.Revision, projectionErr)
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

		result, err := linkImporter.Resolve(r.Context(), request.URL, request.City, request.Hint)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, result)
	})

	registerProfileRoutes(mux, syncStore, tokens)
	registerProviderAuthRoutes(mux, syncStore, tokens, providerVerifier)
	registerTelegramAuthRoutes(mux, syncStore, tokens, telegramVerifier)
	registerAccountTransferRoutes(mux, transferStore, tokens)
	registerLibraryRoutes(mux, libraryStore, tokens)
	registerPublicCollectionRoutes(mux, libraryStore)
	registerPublicPlaceRoutes(mux, libraryStore)
	registerRouteRoutes(mux, routeService, tokens)

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
		rawLat := strings.TrimSpace(r.URL.Query().Get("lat"))
		rawLng := strings.TrimSpace(r.URL.Query().Get("lng"))

		if city == "" {
			city = "spb"
		}
		if city != "spb" && city != "moscow" {
			writeError(w, http.StatusBadRequest, "unsupported city")
			return
		}
		if (rawLat == "") != (rawLng == "") {
			writeError(w, http.StatusBadRequest, "lat and lng must be provided together")
			return
		}

		var (
			places []catalog.Place
			err    error
		)

		if rawLat != "" {
			lat, latErr := strconv.ParseFloat(rawLat, 64)
			lng, lngErr := strconv.ParseFloat(rawLng, 64)
			if latErr != nil || lngErr != nil || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
				writeError(w, http.StatusBadRequest, "invalid map coordinates")
				return
			}
			places, err = placesResolver.SearchAt(r.Context(), q, city, category, lat, lng)
		} else {
			places, err = placesResolver.Search(r.Context(), q, city, category)
		}

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

	handler := withCommonHeaders(mux, parseAllowedOrigins(os.Getenv("WEB_ALLOWED_ORIGINS")))

	port := os.Getenv("API_PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       75 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	log.Printf("SPOT API listening on :%s (sync=%s, library=%s, transfer=%s)", port, syncStore.Mode(), libraryStore.Mode(), transferStore.Mode())

	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.ListenAndServe()
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)

	select {
	case err := <-serverErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("SPOT API stopped unexpectedly: %v", err)
		}
	case sig := <-signals:
		log.Printf("SPOT API received %s; draining requests", sig)

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("SPOT API graceful shutdown failed: %v", err)
			_ = server.Close()
		}
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

func parseAllowedOrigins(raw string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, item := range strings.Split(raw, ",") {
		origin := strings.TrimSpace(item)
		if origin == "" {
			continue
		}
		out[origin] = struct{}{}
	}
	return out
}

func withCommonHeaders(next http.Handler, allowedOrigins map[string]struct{}) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")

		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" {
			if _, ok := allowedOrigins[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			}
		}

		if r.Method == http.MethodOptions {
			if origin == "" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			if _, ok := allowedOrigins[origin]; !ok {
				writeError(w, http.StatusForbidden, "origin not allowed")
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

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
