package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func fakeVault(t *testing.T, capabilities map[string][]string, calls *atomic.Int32) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/v1/sys/capabilities-self" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		token := r.Header.Get("X-Vault-Token")
		if token == "no-preflight" {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"errors":["1 error occurred:\n\t* permission denied\n\n"]}`))
			return
		}
		granted, ok := capabilities[token]
		if !ok {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"errors":["permission denied","invalid token"]}`))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string][]string{RequiredPath: granted})
	}))
}

func TestEventsRequireAuditCapability(t *testing.T) {
	var calls atomic.Int32
	vault := fakeVault(t, map[string][]string{
		"admin":  {"read", "sudo"},
		"reader": {"read"},
	}, &calls)
	defer vault.Close()
	base := time.Date(2026, 10, 25, 10, 0, 0, 0, time.UTC)
	server := &Server{
		reader:     NewReader(writeLog(t, []string{auditLine(base, "response", "read", "applications/data/a", "alice", "")}), 1<<20),
		authorizer: NewAuthorizer(vault.URL, vault.Client(), time.Minute),
	}
	routes := server.Routes()

	cases := map[string]int{"": 401, "unknown": 401, "no-preflight": 403, "reader": 403, "admin": 200}
	for token, want := range cases {
		request := httptest.NewRequest(http.MethodGet, "/audit-api/v1/events?limit=5", nil)
		if token != "" {
			request.Header.Set("X-Vault-Token", token)
		}
		recorder := httptest.NewRecorder()
		routes.ServeHTTP(recorder, request)
		if recorder.Code != want {
			t.Fatalf("token %q: got %d want %d (%s)", token, recorder.Code, want, recorder.Body.String())
		}
		if recorder.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("token %q: missing no-store", token)
		}
		if token == "admin" && !strings.Contains(recorder.Body.String(), `"actor":"alice"`) {
			t.Fatalf("unexpected body: %s", recorder.Body.String())
		}
	}

	before := calls.Load()
	request := httptest.NewRequest(http.MethodGet, "/audit-api/v1/status", nil)
	request.Header.Set("X-Vault-Token", "admin")
	recorder := httptest.NewRecorder()
	routes.ServeHTTP(recorder, request)
	if recorder.Code != 200 || calls.Load() != before {
		t.Fatalf("expected a cached authorization, got %d with %d new calls", recorder.Code, calls.Load()-before)
	}
}

func TestQueryValidation(t *testing.T) {
	for _, raw := range []string{"limit=0", "limit=x", "before=yesterday", "outcome=maybe"} {
		request := httptest.NewRequest(http.MethodGet, "/audit-api/v1/events?"+raw, nil)
		if _, _, err := parseQuery(request); err == nil {
			t.Fatalf("expected %q to be rejected", raw)
		}
	}
	request := httptest.NewRequest(http.MethodGet, "/audit-api/v1/events?limit=9999&path=/applications/&q=%20a%20", nil)
	filter, limit, err := parseQuery(request)
	if err != nil || limit != maxLimit || filter.PathPrefix != "applications/" || filter.Text != "a" {
		t.Fatalf("unexpected parse: %+v %d %v", filter, limit, err)
	}
}

func TestAllowsAuditRead(t *testing.T) {
	if !allowsAuditRead([]string{"root"}) || !allowsAuditRead([]string{"sudo", "read"}) {
		t.Fatal("expected root and sudo+read to be allowed")
	}
	if allowsAuditRead([]string{"read"}) || allowsAuditRead([]string{"sudo", "read", "deny"}) {
		t.Fatal("expected read alone and deny to be refused")
	}
}
