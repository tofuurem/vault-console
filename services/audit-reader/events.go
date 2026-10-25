package main

import (
	"encoding/json"
	"strings"
	"time"
)

// rawEntry mirrors the subset of a Vault file audit device line that the
// reader exposes. Request and response bodies are deliberately not decoded.
type rawEntry struct {
	Time  string `json:"time"`
	Type  string `json:"type"`
	Error string `json:"error"`
	Auth  struct {
		DisplayName string            `json:"display_name"`
		EntityID    string            `json:"entity_id"`
		Policies    []string          `json:"policies"`
		Metadata    map[string]string `json:"metadata"`
	} `json:"auth"`
	Request struct {
		ID            string `json:"id"`
		Operation     string `json:"operation"`
		Path          string `json:"path"`
		MountType     string `json:"mount_type"`
		MountPoint    string `json:"mount_point"`
		RemoteAddress string `json:"remote_address"`
	} `json:"request"`
}

// Event is the metadata-only view of one completed Vault request.
type Event struct {
	Time          time.Time `json:"time"`
	RequestID     string    `json:"requestId"`
	Operation     string    `json:"operation"`
	Path          string    `json:"path"`
	MountType     string    `json:"mountType,omitempty"`
	MountPoint    string    `json:"mountPoint,omitempty"`
	Actor         string    `json:"actor"`
	EntityID      string    `json:"entityId,omitempty"`
	Policies      []string  `json:"policies,omitempty"`
	RemoteAddress string    `json:"remoteAddress,omitempty"`
	Outcome       string    `json:"outcome"`
	Error         string    `json:"error,omitempty"`
}

// parseEvent turns a response audit line into an Event. Request lines are
// skipped because every completed request also produces a response line.
func parseEvent(line []byte) (Event, bool) {
	var entry rawEntry
	if err := json.Unmarshal(line, &entry); err != nil || entry.Type != "response" {
		return Event{}, false
	}
	at, err := time.Parse(time.RFC3339Nano, entry.Time)
	if err != nil {
		return Event{}, false
	}
	actor := entry.Auth.DisplayName
	if username := entry.Auth.Metadata["username"]; actor == "" && username != "" {
		actor = username
	}
	if actor == "" {
		actor = "unauthenticated"
	}
	outcome := "ok"
	if entry.Error != "" {
		outcome = "error"
	}
	message := readableError(entry.Error)
	return Event{
		Time:          at.UTC(),
		RequestID:     entry.Request.ID,
		Operation:     entry.Request.Operation,
		Path:          entry.Request.Path,
		MountType:     entry.Request.MountType,
		MountPoint:    entry.Request.MountPoint,
		Actor:         actor,
		EntityID:      entry.Auth.EntityID,
		Policies:      entry.Auth.Policies,
		RemoteAddress: entry.Request.RemoteAddress,
		Outcome:       outcome,
		Error:         message,
	}, true
}

// readableError flattens Vault's multierror text ("2 errors occurred:\n\t* a\n\t* b")
// into "a; b".
func readableError(raw string) string {
	var parts []string
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "*"))
		if line == "" || strings.HasSuffix(line, "errors occurred:") || strings.HasSuffix(line, "error occurred:") {
			continue
		}
		parts = append(parts, line)
	}
	return strings.Join(parts, "; ")
}

// routinePaths are the read-only checks consoles and SDKs make on every page
// load; hiding them keeps the log about actions people took.
var routinePaths = map[string]bool{
	"sys/capabilities-self":         true,
	"sys/internal/ui/mounts":        true,
	"sys/internal/ui/resultant-acl": true,
	"auth/token/lookup-self":        true,
	"sys/health":                    true,
	"sys/seal-status":               true,
}

func isRoutine(event Event) bool {
	if event.Outcome != "ok" {
		return false
	}
	return routinePaths[event.Path] || strings.HasPrefix(event.Path, "sys/internal/ui/mounts/")
}

// Filter narrows events; empty fields match everything.
type Filter struct {
	Before      time.Time
	Text        string
	Operation   string
	PathPrefix  string
	Actor       string
	Outcome     string
	HideRoutine bool
}

func (f Filter) matches(event Event) bool {
	if f.HideRoutine && isRoutine(event) {
		return false
	}
	if !f.Before.IsZero() && !event.Time.Before(f.Before) {
		return false
	}
	if f.Operation != "" && event.Operation != f.Operation {
		return false
	}
	if f.PathPrefix != "" && !strings.HasPrefix(event.Path, f.PathPrefix) {
		return false
	}
	if f.Actor != "" && !strings.EqualFold(event.Actor, f.Actor) {
		return false
	}
	if f.Outcome != "" && event.Outcome != f.Outcome {
		return false
	}
	if f.Text == "" {
		return true
	}
	haystack := strings.ToLower(strings.Join([]string{event.Path, event.Actor, event.Operation, event.RemoteAddress, event.Error}, " "))
	for _, term := range strings.Fields(strings.ToLower(f.Text)) {
		if !strings.Contains(haystack, term) {
			return false
		}
	}
	return true
}
