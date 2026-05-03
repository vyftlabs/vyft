package server

import "os"

type Config struct {
	Addr string
}

func LoadConfig() Config {
	return Config{
		Addr: env("ADDR", ":8080"),
	}
}

func env(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}

	return value
}
