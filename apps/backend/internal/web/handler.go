package web

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// NewStaticHandler serves the embedded SPA. If no index.html is present
// (fresh clone with only .gitkeep), every path returns 404 — backend devs
// without the frontend build don't get crashes serving /.
func NewStaticHandler() http.Handler {
	dist, err := fs.Sub(Dist, "dist")
	if err != nil {
		return http.HandlerFunc(http.NotFound)
	}
	if _, err := fs.Stat(dist, "index.html"); err != nil {
		return http.HandlerFunc(http.NotFound)
	}
	return newSPAHandler(dist)
}

func newSPAHandler(dist fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}

		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}

		file, err := dist.Open(name)
		if err == nil {
			defer file.Close()
			stat, statErr := file.Stat()
			if statErr == nil && !stat.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		if path.Ext(name) != "" {
			http.NotFound(w, r)
			return
		}

		// SPA fallback: unknown route → index.html.
		indexRequest := new(http.Request)
		*indexRequest = *r
		indexURL := *r.URL
		indexURL.Path = "/"
		indexRequest.URL = &indexURL
		fileServer.ServeHTTP(w, indexRequest)
	})
}
