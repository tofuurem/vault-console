// Command vault-console-audit serves a metadata-only, read-only view of a
// Vault file audit device log to operators allowed to manage audit devices.
package main

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type config struct {
	listen       string
	auditLog     string
	upstream     string
	caBundle     string
	maxScanBytes int64
}

func loadConfig() (config, error) {
	cfg := config{
		listen:       envOr("AUDIT_READER_LISTEN", ":8090"),
		auditLog:     envOr("VAULT_AUDIT_LOG", "/vault/audit/audit.log"),
		upstream:     strings.TrimRight(os.Getenv("VAULT_UPSTREAM"), "/"),
		caBundle:     os.Getenv("VAULT_CACERT"),
		maxScanBytes: 256 << 20,
	}
	if !strings.HasPrefix(cfg.upstream, "http://") && !strings.HasPrefix(cfg.upstream, "https://") {
		return cfg, fmt.Errorf("VAULT_UPSTREAM must be an HTTP or HTTPS origin")
	}
	if raw := os.Getenv("AUDIT_READER_MAX_SCAN_MB"); raw != "" {
		mb, err := strconv.Atoi(raw)
		if err != nil || mb < 1 {
			return cfg, fmt.Errorf("AUDIT_READER_MAX_SCAN_MB must be a positive number")
		}
		cfg.maxScanBytes = int64(mb) << 20
	}
	return cfg, nil
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func httpClient(caBundle string) (*http.Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if caBundle != "" {
		pem, err := os.ReadFile(caBundle)
		if err != nil {
			return nil, err
		}
		pool, err := x509.SystemCertPool()
		if err != nil {
			pool = x509.NewCertPool()
		}
		if !pool.AppendCertsFromPEM(pem) {
			return nil, fmt.Errorf("VAULT_CACERT contains no certificates")
		}
		transport.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	}
	return &http.Client{Transport: transport, Timeout: 10 * time.Second}, nil
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("audit reader configuration is invalid: %v", err)
	}
	client, err := httpClient(cfg.caBundle)
	if err != nil {
		log.Fatalf("audit reader TLS configuration is invalid: %v", err)
	}
	server := &Server{
		reader:     NewReader(cfg.auditLog, cfg.maxScanBytes),
		authorizer: NewAuthorizer(cfg.upstream, client, 30*time.Second),
	}
	httpServer := &http.Server{
		Addr:              cfg.listen,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      60 * time.Second,
	}
	log.Printf("audit reader listening on %s", cfg.listen)
	log.Fatal(httpServer.ListenAndServe())
}
