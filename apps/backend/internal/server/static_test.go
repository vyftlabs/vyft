package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestSPAHandlerServesExistingFile(t *testing.T) {
	handler := newSPAHandler(fstest.MapFS{
		"index.html":    {Data: []byte("<html></html>")},
		"assets/app.js": {Data: []byte("console.log('ok')")},
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/assets/app.js", nil)

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	if response.Body.String() != "console.log('ok')" {
		t.Fatalf("expected asset body, got %q", response.Body.String())
	}
}

func TestSPAHandlerFallsBackToIndexForClientRoute(t *testing.T) {
	handler := newSPAHandler(fstest.MapFS{
		"index.html": {Data: []byte("<html></html>")},
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/projects/example", nil)

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}

	if response.Body.String() != "<html></html>" {
		t.Fatalf("expected index body, got %q", response.Body.String())
	}
}

func TestSPAHandlerReturnsNotFoundForMissingAsset(t *testing.T) {
	handler := newSPAHandler(fstest.MapFS{
		"index.html": {Data: []byte("<html></html>")},
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/assets/missing.js", nil)

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, response.Code)
	}
}
