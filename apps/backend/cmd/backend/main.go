package main

import (
	"log/slog"
	"os"

	"github.com/vyftlabs/vyft/apps/backend/internal/server"
)

func main() {
	if err := server.Run(); err != nil {
		slog.Error("backend stopped", "error", err)
		os.Exit(1)
	}
}
