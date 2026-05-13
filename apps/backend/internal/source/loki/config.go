package loki

import "github.com/google/uuid"

// StoredConfig mirrors prometheus.StoredConfig shape so the resolver
// handles secret splitting identically across both kinds.
type StoredConfig struct {
	URL  string     `json:"url"`
	Auth StoredAuth `json:"auth"`
}

type StoredAuth struct {
	Type     AuthType `json:"type"`
	Username string   `json:"username,omitempty"`
}

func (c StoredConfig) Build(id uuid.UUID, name string, secret []byte) (*Loki, error) {
	auth := Auth{Type: c.Auth.Type, Username: c.Auth.Username}
	switch c.Auth.Type {
	case AuthBasic:
		auth.Password = string(secret)
	case AuthBearer:
		auth.Token = string(secret)
	}
	return New(id, name, c.URL, auth)
}
