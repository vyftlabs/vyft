package loki

import "net/http"

// AuthType matches the SourceAuth discriminator from the spec.
type AuthType string

const (
	AuthNone   AuthType = "none"
	AuthBasic  AuthType = "basic"
	AuthBearer AuthType = "bearer"
)

type Auth struct {
	Type     AuthType
	Username string // basic
	Password string // basic
	Token    string // bearer
}

type authRT struct {
	inner http.RoundTripper
	auth  Auth
}

func (t *authRT) RoundTrip(r *http.Request) (*http.Response, error) {
	switch t.auth.Type {
	case AuthBasic:
		r.SetBasicAuth(t.auth.Username, t.auth.Password)
	case AuthBearer:
		r.Header.Set("Authorization", "Bearer "+t.auth.Token)
	}
	return t.inner.RoundTrip(r)
}

func authRoundTripper(inner http.RoundTripper, auth Auth) http.RoundTripper {
	if auth.Type == "" || auth.Type == AuthNone {
		return inner
	}
	return &authRT{inner: inner, auth: auth}
}
