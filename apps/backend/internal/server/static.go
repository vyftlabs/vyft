package server

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed static
var staticFiles embed.FS

func newStaticHandler() http.Handler {
	dist, err := fs.Sub(staticFiles, "static/dist")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.NotFound(w, r)
		})
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

		if name != "" {
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
		}

		indexRequest := new(http.Request)
		*indexRequest = *r
		indexURL := *r.URL
		indexURL.Path = "/"
		indexRequest.URL = &indexURL
		fileServer.ServeHTTP(w, indexRequest)
	})
}
