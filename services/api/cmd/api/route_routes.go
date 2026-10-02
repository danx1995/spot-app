package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/danx1995/spot-app/services/api/internal/auth"
	"github.com/danx1995/spot-app/services/api/internal/routing"
)

type routeSummaryRequest struct {
	Points    []routing.Point `json:"points"`
	Transport string          `json:"transport,omitempty"`
}

func registerRouteRoutes(
	mux *http.ServeMux,
	service *routing.Service,
	tokens *auth.TokenService,
) {
	mux.HandleFunc("POST /api/v1/routes/summary", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := requireUser(w, r, tokens); !ok {
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
		var request routeSummaryRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeError(w, http.StatusBadRequest, "invalid route payload")
			return
		}

		summary, err := service.Build(r.Context(), request.Points, request.Transport)
		if errors.Is(err, routing.ErrInvalidInput) {
			writeError(w, http.StatusBadRequest, "invalid route input")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "route calculation failed")
			return
		}

		writeJSON(w, http.StatusOK, summary)
	})
}
