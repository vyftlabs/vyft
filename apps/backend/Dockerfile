FROM golang:alpine AS build

WORKDIR /src

COPY go.mod ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/backend ./cmd/backend

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

COPY --from=build /out/backend /backend

EXPOSE 8080

USER nonroot:nonroot

CMD ["/backend"]
