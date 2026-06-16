FROM node:24-alpine@sha256:21f403ab171f2dc89bad4dd69d7721bfd15f084ccb46cdd225f31f2bc59b5c9a AS web-build

WORKDIR /src

RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec nx build web

FROM golang:1.26-alpine@sha256:f1ddd9fe14fffc091dd98cb4bfa999f32c5fc77d2f2305ea9f0e2595c5437c14 AS build

WORKDIR /src/apps/backend

COPY apps/backend/go.mod ./
RUN go mod download

COPY apps/backend ./
COPY --from=web-build /src/apps/web/dist ./internal/web/dist

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/backend ./cmd/backend

FROM gcr.io/distroless/static-debian12:nonroot@sha256:d093aa3e30dbadd3efe1310db061a14da60299baff8450a17fe0ccc514a16639 AS runtime

COPY --from=build /out/backend /backend

EXPOSE 8080

USER nonroot:nonroot

CMD ["/backend"]
