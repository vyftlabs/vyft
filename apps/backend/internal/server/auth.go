package server

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
)

func basicAuth(user, pass string, next http.Handler) http.Handler {
	if pass == "" {
		return next
	}

	userHash := sha256.Sum256([]byte(user))
	passHash := sha256.Sum256([]byte(pass))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}

		u, p, ok := r.BasicAuth()
		if !ok {
			unauthorized(w)
			return
		}

		gotUser := sha256.Sum256([]byte(u))
		gotPass := sha256.Sum256([]byte(p))
		if subtle.ConstantTimeCompare(userHash[:], gotUser[:]) != 1 ||
			subtle.ConstantTimeCompare(passHash[:], gotPass[:]) != 1 {
			unauthorized(w)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", `Basic realm="vyft", charset="UTF-8"`)
	http.Error(w, "Unauthorized", http.StatusUnauthorized)
}
