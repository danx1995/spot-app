package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ok",
			"service": "spot-api",
			"time": time.Now().UTC(),
		})
	})

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

		writeJSON(w, http.StatusOK, catalog.SearchPlaces(q, city, category))
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

	log.Printf("SPOT API listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
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
