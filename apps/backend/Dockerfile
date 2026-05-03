FROM golang:alpine AS build

WORKDIR /src

COPY go.mod ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 go build -o /out/backend ./cmd/backend

FROM alpine:latest AS runtime

WORKDIR /app

COPY --from=build /out/backend /app/backend

EXPOSE 8080

CMD ["/app/backend"]
