# Backend

Go backend that embeds the web build output and serves it statically.

## Local

```bash
pnpm nx run @vyft/backend:dev
```

## Live Reload

Install Air once:

```bash
go install github.com/air-verse/air@latest
```

Then run:

```bash
air -c .air.toml
```

## Docker

```bash
docker build -f apps/backend/Dockerfile -t vyft-backend .
docker run --rm -p 8080:8080 vyft-backend
```

The service listens on `:8080` by default. Set `ADDR` to override it.
