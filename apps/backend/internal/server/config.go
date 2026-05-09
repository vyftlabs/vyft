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
	}
}

func env(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}

	return value
}
