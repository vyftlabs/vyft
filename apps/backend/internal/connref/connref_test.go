package connref

import "testing"

func TestRoundTrip(t *testing.T) {
	v := Value("postgres-abc123-app", "uri")
	name, key, ok := Parse(v)
	if !ok || name != "postgres-abc123-app" || key != "uri" {
		t.Fatalf("round-trip: got (%q, %q, %v)", name, key, ok)
	}
}

func TestParseNonRef(t *testing.T) {
	for _, v := range []string{"", "plain value", "postgres://host/db", "secretref:no-colon"} {
		if _, _, ok := Parse(v); ok {
			t.Fatalf("%q should not parse as a secret ref", v)
		}
	}
}
