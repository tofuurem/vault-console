package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func auditLine(at time.Time, kind, operation, path, actor, failure string) string {
	return fmt.Sprintf(
		`{"time":%q,"type":%q,"error":%q,"auth":{"display_name":%q,"policies":["default"],"client_token":"hmac-sha256:abc"},"request":{"id":"r-%d","operation":%q,"path":%q,"mount_type":"kv","remote_address":"10.0.0.5","data":{"password":"hmac-sha256:secret"}},"response":{"data":{"value":"hmac-sha256:x"}}}`,
		at.Format(time.RFC3339Nano), kind, failure, actor, at.Unix(), operation, path,
	)
}

func writeLog(t *testing.T, lines []string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "audit.log")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestSearchReturnsNewestResponsesFirstWithoutBodies(t *testing.T) {
	base := time.Date(2026, 10, 25, 10, 0, 0, 0, time.UTC)
	path := writeLog(t, []string{
		auditLine(base, "request", "read", "applications/data/a", "alice", ""),
		auditLine(base, "response", "read", "applications/data/a", "alice", ""),
		auditLine(base.Add(time.Minute), "response", "update", "applications/data/b", "bob", "permission denied"),
	})

	page, err := NewReader(path, 1<<20).Search(Filter{}, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Events) != 2 || page.Events[0].Path != "applications/data/b" || page.Events[1].Actor != "alice" {
		t.Fatalf("unexpected events: %+v", page.Events)
	}
	if page.Events[0].Outcome != "error" || page.Events[1].Outcome != "ok" {
		t.Fatalf("unexpected outcomes: %+v", page.Events)
	}
	if !page.Exhausted {
		t.Fatal("expected the whole small file to be scanned")
	}
	for _, event := range page.Events {
		encoded := fmt.Sprintf("%+v", event)
		if strings.Contains(encoded, "hmac-sha256") {
			t.Fatalf("event leaked hashed body data: %s", encoded)
		}
	}
}

func TestSearchFiltersAndPaginatesAcrossChunks(t *testing.T) {
	base := time.Date(2026, 10, 25, 10, 0, 0, 0, time.UTC)
	var lines []string
	for i := 0; i < 3000; i++ {
		actor := "alice"
		if i%2 == 1 {
			actor = "bob"
		}
		lines = append(lines, auditLine(base.Add(time.Duration(i)*time.Second), "response", "read", fmt.Sprintf("applications/data/team/s%d", i), actor, ""))
	}
	reader := NewReader(writeLog(t, lines), 1<<30)

	first, err := reader.Search(Filter{Actor: "BOB"}, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Events) != 50 || first.Events[0].Path != "applications/data/team/s2999" {
		t.Fatalf("unexpected first page: %d %+v", len(first.Events), first.Events[0])
	}
	second, err := reader.Search(Filter{Actor: "bob", Before: first.NextBefore}, 50)
	if err != nil {
		t.Fatal(err)
	}
	if second.Events[0].Path != "applications/data/team/s2899" {
		t.Fatalf("second page did not continue: %+v", second.Events[0])
	}

	text, err := reader.Search(Filter{Text: "team s17"}, 5)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range text.Events {
		if !strings.Contains(event.Path, "s17") {
			t.Fatalf("text filter mismatch: %s", event.Path)
		}
	}
}

func TestSearchStopsAtScanBudgetAndReportsMissingFile(t *testing.T) {
	base := time.Date(2026, 10, 25, 10, 0, 0, 0, time.UTC)
	var lines []string
	for i := 0; i < 2000; i++ {
		lines = append(lines, auditLine(base, "response", "read", "x", "alice", ""))
	}
	page, err := NewReader(writeLog(t, lines), 64*1024).Search(Filter{Operation: "delete"}, 10)
	if err != nil {
		t.Fatal(err)
	}
	if page.Exhausted || page.ScannedBytes > 64*1024 {
		t.Fatalf("expected a bounded partial scan, got %+v", page)
	}

	missing := NewReader(filepath.Join(t.TempDir(), "absent.log"), 1<<20)
	if missing.Status().Available {
		t.Fatal("missing file reported as available")
	}
	if _, err := missing.Search(Filter{}, 1); err == nil {
		t.Fatal("expected an error for a missing file")
	}
}

func TestReadableError(t *testing.T) {
	got := readableError("2 errors occurred:\n\t* permission denied\n\t* invalid token\n\n")
	if got != "permission denied; invalid token" {
		t.Fatalf("unexpected error text: %q", got)
	}
	if readableError("") != "" || readableError("plain failure") != "plain failure" {
		t.Fatal("unexpected handling of empty or plain errors")
	}
}

func TestHideRoutineSkipsSuccessfulHousekeepingOnly(t *testing.T) {
	base := time.Date(2026, 10, 25, 10, 0, 0, 0, time.UTC)
	path := writeLog(t, []string{
		auditLine(base, "response", "update", "sys/capabilities-self", "alice", ""),
		auditLine(base, "response", "read", "sys/internal/ui/mounts/applications", "alice", ""),
		auditLine(base, "response", "read", "auth/token/lookup-self", "mallory", "permission denied"),
		auditLine(base, "response", "read", "applications/data/a", "alice", ""),
	})
	page, err := NewReader(path, 1<<20).Search(Filter{HideRoutine: true}, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Events) != 2 || page.Events[0].Path != "applications/data/a" || page.Events[1].Outcome != "error" {
		t.Fatalf("unexpected routine filtering: %+v", page.Events)
	}
}
