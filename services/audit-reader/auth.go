package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"time"
)

// RequiredPath is the Vault path whose capabilities gate the audit log. Only
// operators who may manage audit devices can read what they record.
const RequiredPath = "sys/audit"

var (
	errMissingToken = errors.New("missing token")
	errForbidden    = errors.New("forbidden")
	errInvalidToken = errors.New("invalid token")
)

type cacheEntry struct {
	allowed bool
	expires time.Time
}

// Authorizer asks Vault whether a caller's token may read the audit log. It
// caches decisions by token hash so the raw token never sits in memory maps.
type Authorizer struct {
	upstream string
	client   *http.Client
	ttl      time.Duration
	now      func() time.Time

	mu    sync.Mutex
	cache map[[32]byte]cacheEntry
}

func NewAuthorizer(upstream string, client *http.Client, ttl time.Duration) *Authorizer {
	return &Authorizer{upstream: upstream, client: client, ttl: ttl, now: time.Now, cache: map[[32]byte]cacheEntry{}}
}

func (a *Authorizer) Authorize(ctx context.Context, token string) error {
	if token == "" {
		return errMissingToken
	}
	key := sha256.Sum256([]byte(token))
	if allowed, ok := a.cached(key); ok {
		if allowed {
			return nil
		}
		return errForbidden
	}
	allowed, err := a.ask(ctx, token)
	if err != nil {
		return err
	}
	a.store(key, allowed)
	if !allowed {
		return errForbidden
	}
	return nil
}

func (a *Authorizer) cached(key [32]byte) (bool, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	entry, ok := a.cache[key]
	if !ok || a.now().After(entry.expires) {
		delete(a.cache, key)
		return false, false
	}
	return entry.allowed, true
}

func (a *Authorizer) store(key [32]byte, allowed bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.cache) > 1024 {
		a.cache = map[[32]byte]cacheEntry{}
	}
	a.cache[key] = cacheEntry{allowed: allowed, expires: a.now().Add(a.ttl)}
}

func (a *Authorizer) ask(ctx context.Context, token string) (bool, error) {
	body, _ := json.Marshal(map[string][]string{"paths": {RequiredPath}})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, a.upstream+"/v1/sys/capabilities-self", bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	request.Header.Set("X-Vault-Token", token)
	request.Header.Set("X-Vault-Request", "true")
	request.Header.Set("Content-Type", "application/json")
	response, err := a.client.Do(request)
	if err != nil {
		return false, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusForbidden || response.StatusCode == http.StatusUnauthorized {
		// Vault answers 403 both for bad tokens and for tokens that may not
		// call capabilities-self; only the structured marker means sign in again.
		body, _ := io.ReadAll(io.LimitReader(response.Body, 64<<10))
		if bytes.Contains(bytes.ToLower(body), []byte("invalid token")) {
			return false, errInvalidToken
		}
		return false, nil
	}
	if response.StatusCode != http.StatusOK {
		return false, errors.New("capability check failed")
	}
	var payload map[string]json.RawMessage
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&payload); err != nil {
		return false, err
	}
	var capabilities []string
	if err := json.Unmarshal(payload[RequiredPath], &capabilities); err != nil {
		return false, err
	}
	return allowsAuditRead(capabilities), nil
}

func allowsAuditRead(capabilities []string) bool {
	has := map[string]bool{}
	for _, capability := range capabilities {
		has[capability] = true
	}
	if has["deny"] {
		return false
	}
	return has["root"] || (has["sudo"] && has["read"])
}
