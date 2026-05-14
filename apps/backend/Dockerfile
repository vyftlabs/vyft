FROM node:24-alpine AS web-build

WORKDIR /src

RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec nx build web

FROM golang:alpine AS build

WORKDIR /src/apps/backend

COPY apps/backend/go.mod ./
RUN go mod download

COPY apps/backend ./
COPY --from=web-build /src/apps/web/dist ./internal/web/dist

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/backend ./cmd/backend

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

COPY --from=build /out/backend /backend

EXPOSE 8080

USER nonroot:nonroot

CMD ["/backend"]
