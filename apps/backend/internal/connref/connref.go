// Package connref encodes a reference to a Kubernetes Secret key inside a
// variable's plain value, so a resource can expose connection details (e.g. a
// CloudNativePG-managed Postgres) as importable variables WITHOUT copying the
// underlying secret into our store. The seeding side (resource create) writes
// Value(...) into an owned variable; the deploy side (runtime/k8s) calls
// Parse(...) and renders the env entry as a secretKeyRef to that secret.
package connref

import "strings"

const prefix = "secretref:"

// Value encodes "<secretName>:<secretKey>" behind the sentinel prefix.
func Value(secretName, secretKey string) string {
	return prefix + secretName + ":" + secretKey
}

// Parse splits a sentinel value back into (secretName, secretKey). ok is false
// for any value that isn't a secret ref — i.e. an ordinary variable value.
func Parse(v string) (secretName, secretKey string, ok bool) {
	if !strings.HasPrefix(v, prefix) {
		return "", "", false
	}
	rest := v[len(prefix):]
	i := strings.Index(rest, ":")
	if i < 0 {
		return "", "", false
	}
	return rest[:i], rest[i+1:], true
}
