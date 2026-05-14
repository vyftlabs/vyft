package prometheus

import "github.com/google/uuid"

// StoredConfig is the jsonb shape persisted in `sources.config` for the
// prometheus kind. Secrets (password, token) are NOT carried here — they
// live in `sources.auth_encrypted` and are combined in Build.
type StoredConfig struct {
	URL  string     `json:"url"`
	Auth StoredAuth `json:"auth"`
}

type StoredAuth struct {
	Type     AuthType `json:"type"`
	Username string   `json:"username,omitempty"`
}

// Build combines the non-secret StoredConfig with the secret bytes from
// `auth_encrypted` (passthrough plaintext for v1) into a live Prometheus
// source.
func (c StoredConfig) Build(id uuid.UUID, name string, secret []byte) (*Prometheus, error) {
	auth := Auth{Type: c.Auth.Type, Username: c.Auth.Username}
	switch c.Auth.Type {
	case AuthBasic:
		auth.Password = string(secret)
	case AuthBearer:
		auth.Token = string(secret)
	}
	return New(id, name, c.URL, auth)
}
