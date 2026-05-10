package environment

// DefaultSlug is the well-known slug for the auto-bootstrapped production
// environment. Frontend-facing v1 omits the env entirely; backend resolves
// to the row matching this slug for any unspecified call.
const DefaultSlug = "production"
