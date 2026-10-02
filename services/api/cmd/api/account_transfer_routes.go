package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/danx1995/spot-app/services/api/internal/accounttransfer"
	"github.com/danx1995/spot-app/services/api/internal/auth"
)

type redeemTransferRequest struct {
	Code string `json:"code"`
}

func registerAccountTransferRoutes(
	mux *http.ServeMux,
	store accounttransfer.Store,
	tokens *auth.TokenService,
) {
	mux.HandleFunc("POST /api/v1/me/transfer-code", func(w http.ResponseWriter, r *http.Request) {
		userID, ok := requireUser(w, r, tokens)
		if !ok {
			return
		}

		code, err := store.Issue(r.Context(), userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create transfer code")
			return
		}

		writeJSON(w, http.StatusCreated, code)
	})

	mux.HandleFunc("POST /api/v1/auth/transfer", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
		var request redeemTransferRequest
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil {
			writeError(w, http.StatusBadRequest, "invalid transfer payload")
			return
		}

		userID, err := store.Redeem(r.Context(), request.Code)
		if errors.Is(err, accounttransfer.ErrInvalidCode) {
			writeError(w, http.StatusUnauthorized, "invalid or expired transfer code")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to transfer profile")
			return
		}

		token, err := tokens.Issue(userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create session")
			return
		}

		writeJSON(w, http.StatusOK, guestSessionResponse{
			UserID: userID,
			Token:  token,
		})
	})
}
