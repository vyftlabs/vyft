package server

import (
	"os"
	"time"
)

type Config struct {
	Addr            string
	ShutdownTimeout time.Duration
}

func LoadConfig() Config {
	return Config{
		Addr:            env("ADDR", ":8080"),
		ShutdownTimeout: 10 * time.Second,
	}
}

func env(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}

	return value
}
