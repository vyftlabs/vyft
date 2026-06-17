package k8sevents

import "testing"

func TestParseHash(t *testing.T) {
	const slug = "nginx-7ff29c" // slug itself contains a dash
	cases := []struct{ name, in, want string }{
		{"pod", "nginx-7ff29c-586b6c5658-92r76", "586b6c5658"},
		{"replicaset", "nginx-7ff29c-586b6c5658", "586b6c5658"},
		{"deployment (no hash)", "nginx-7ff29c", ""},
		{"other resource", "postgres-1a59da-abc123-xyz", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := ParseHash(c.in, slug); got != c.want {
				t.Fatalf("ParseHash(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
