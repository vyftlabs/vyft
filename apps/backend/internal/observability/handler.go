// Package observability stubs the observability endpoints. Returns empty
// data until the k8s/log/metrics integrations land.
package observability

import (
	"context"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
)

type Service struct{}

func New() *Service { return &Service{} }

type Handler struct{ svc *Service }

func NewHandler(s *Service) *Handler { return &Handler{svc: s} }

func (h *Handler) ListResourceEvents(_ context.Context, _ openapi.ListResourceEventsRequestObject) (openapi.ListResourceEventsResponseObject, error) {
	return openapi.ListResourceEvents200JSONResponse{}, nil
}

func (h *Handler) ListResourceLogs(_ context.Context, _ openapi.ListResourceLogsRequestObject) (openapi.ListResourceLogsResponseObject, error) {
	return openapi.ListResourceLogs200JSONResponse{}, nil
}

func (h *Handler) GetResourceMetrics(_ context.Context, _ openapi.GetResourceMetricsRequestObject) (openapi.GetResourceMetricsResponseObject, error) {
	return openapi.GetResourceMetrics200JSONResponse{
		ReqRate: []openapi.RangePoint{},
		ErrRate: []openapi.RangePoint{},
		Cpu:     []openapi.RangePoint{},
		Memory:  []openapi.RangePoint{},
		Latency: []openapi.LatencyPoint{},
	}, nil
}
