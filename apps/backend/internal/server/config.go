package server

import (
	"os"
	"time"
)

type Config struct {
	Addr            string
	ShutdownTimeout time.Duration
	BasicAuthUser   string
	BasicAuthPass   string
	DatabaseURL     string
	// KubeconfigPath, when set, points the runtime at a kubeconfig file.
	// Empty = try in-cluster config; failure to find either falls back to
	// the StubRuntime (dev mode).
	KubeconfigPath string
}

func LoadConfig() Config {
	return Config{
		Addr:            env("ADDR", ":8080"),
		ShutdownTimeout: 10 * time.Second,
		BasicAuthUser:   env("BASIC_AUTH_USER", "admin"),
		BasicAuthPass:   env("BASIC_AUTH_PASS", "admin"),
		DatabaseURL: env(
			"DATABASE_URL",
			"postgres://postgres:postgres@localhost:5432/vyft?sslmode=disable",
		),
		KubeconfigPath: os.Getenv("KUBECONFIG"),
	}
}

func env(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}

	return value
}
