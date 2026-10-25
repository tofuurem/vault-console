package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	defaultLimit = 100
	maxLimit     = 500
)

type Server struct {
	reader     *Reader
	authorizer *Authorizer
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.HandleFunc("GET /audit-api/v1/status", s.authorized(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, s.reader.Status())
	}))
	mux.HandleFunc("GET /audit-api/v1/events", s.authorized(s.events))
	return mux
}

func (s *Server) authorized(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		err := s.authorizer.Authorize(r.Context(), r.Header.Get("X-Vault-Token"))
		switch {
		case err == nil:
			next(w, r)
		case errors.Is(err, errMissingToken), errors.Is(err, errInvalidToken):
			writeError(w, http.StatusUnauthorized, "sign in again")
		case errors.Is(err, errForbidden):
			writeError(w, http.StatusForbidden, "your Vault policy does not allow reading the audit log")
		default:
			log.Printf("audit authorization unavailable: %v", err)
			writeError(w, http.StatusBadGateway, "Vault could not be reached to check permissions")
		}
	}
}

func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	filter, limit, err := parseQuery(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	page, err := s.reader.Search(filter, limit)
	if err != nil {
		log.Printf("audit log read failed: %v", err)
		writeError(w, http.StatusServiceUnavailable, "the audit log file is not readable")
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func parseQuery(r *http.Request) (Filter, int, error) {
	query := r.URL.Query()
	limit := defaultLimit
	if raw := query.Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 {
			return Filter{}, 0, errors.New("limit must be a positive number")
		}
		limit = min(parsed, maxLimit)
	}
	filter := Filter{
		Text:       strings.TrimSpace(query.Get("q")),
		Operation:  query.Get("operation"),
		PathPrefix: strings.TrimPrefix(query.Get("path"), "/"),
		Actor:      strings.TrimSpace(query.Get("actor")),
		Outcome:    query.Get("outcome"),
		// Routine checks are hidden unless the caller asks for everything.
		HideRoutine: query.Get("routine") != "show",
	}
	if raw := query.Get("before"); raw != "" {
		before, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return Filter{}, 0, errors.New("before must be an RFC 3339 timestamp")
		}
		filter.Before = before
	}
	if filter.Outcome != "" && filter.Outcome != "ok" && filter.Outcome != "error" {
		return Filter{}, 0, errors.New("outcome must be ok or error")
	}
	return filter, limit, nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
