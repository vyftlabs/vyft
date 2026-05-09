// Package apierr is the cross-layer error currency. Services and handlers
// return *APIError; the strict-mode ErrorHandlerFunc translates to HTTP.
package apierr

import (
	"errors"
	"net/http"
)

type ErrorCode string

const (
	CodeBadRequest   ErrorCode = "BAD_REQUEST"
	CodeUnauthorized ErrorCode = "UNAUTHORIZED"
	CodeForbidden    ErrorCode = "FORBIDDEN"
	CodeNotFound     ErrorCode = "NOT_FOUND"
	CodeConflict     ErrorCode = "CONFLICT"
	CodeInternal     ErrorCode = "INTERNAL"
)

type APIError struct {
	Status  int       `json:"-"`
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	cause   error     // unwrapped via Unwrap; never JSON-encoded
}

func (e *APIError) Error() string {
	if e.cause != nil {
		return string(e.Code) + ": " + e.Message + ": " + e.cause.Error()
	}
	return string(e.Code) + ": " + e.Message
}

func (e *APIError) Unwrap() error { return e.cause }

func BadRequest(msg string) *APIError {
	return &APIError{Status: http.StatusBadRequest, Code: CodeBadRequest, Message: msg}
}

func NotFound(msg string) *APIError {
	return &APIError{Status: http.StatusNotFound, Code: CodeNotFound, Message: msg}
}

func Conflict(msg string) *APIError {
	return &APIError{Status: http.StatusConflict, Code: CodeConflict, Message: msg}
}

// Internal takes an error so the wrap chain survives. Logs the cause; client
// sees a generic message.
func Internal(cause error) *APIError {
	return &APIError{
		Status:  http.StatusInternalServerError,
		Code:    CodeInternal,
		Message: "internal error",
		cause:   cause,
	}
}

func NotImplementedErr() *APIError {
	return &APIError{Status: http.StatusNotImplemented, Code: CodeInternal, Message: "not implemented"}
}

// Wrap is idempotent: if err is already an *APIError, returns it unchanged.
// Otherwise wraps in Internal. Use at service boundaries where err might be
// raw pg or might already be apierr-typed from a helper.
func Wrap(err error) error {
	if err == nil {
		return nil
	}
	var ae *APIError
	if errors.As(err, &ae) {
		return err
	}
	return Internal(err)
}
