package twogis

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

type routeRoundTripFunc func(*http.Request) (*http.Response, error)

func (fn routeRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestRoutePairsBuildsWalkingSummaryRequest(t *testing.T) {
	client := &Client{
		apiKey: "test-key",
		http: &http.Client{
			Transport: routeRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodPost {
					t.Fatalf("expected POST, got %s", req.Method)
				}
				if req.URL.Host != "routing.api.2gis.com" {
					t.Fatalf("unexpected host %s", req.URL.Host)
				}
				if req.URL.Query().Get("key") != "test-key" {
					t.Fatal("routing key is missing")
				}

				raw, err := io.ReadAll(req.Body)
				if err != nil {
					t.Fatal(err)
				}

				var payload routePairsRequest
				if err := json.Unmarshal(raw, &payload); err != nil {
					t.Fatal(err)
				}
				if payload.Transport != "walking" || payload.Output != "summary" {
					t.Fatalf("unexpected routing payload: %#v", payload)
				}
				if len(payload.Points) != 2 {
					t.Fatalf("expected 2 route pairs, got %d", len(payload.Points))
				}
				if payload.Points[0][0].Type != "walking" {
					t.Fatalf("walking route must use walking point type, got %q", payload.Points[0][0].Type)
				}

				body := `[
					{"distance":1200,"duration":900,"reliability":1,"status":"OK"},
					{"distance":800,"duration":600,"reliability":0.9,"status":"OK"}
				]`
				return &http.Response{
					StatusCode: http.StatusOK,
					Body: io.NopCloser(strings.NewReader(body)),
					Header: make(http.Header),
				}, nil
			}),
		},
	}

	legs, err := client.RoutePairs(context.Background(), []RoutePair{
		{
			From: RouteCoordinate{Lat: 59.9386, Lon: 30.3141},
			To: RouteCoordinate{Lat: 59.945, Lon: 30.32},
		},
		{
			From: RouteCoordinate{Lat: 59.945, Lon: 30.32},
			To: RouteCoordinate{Lat: 59.95, Lon: 30.33},
		},
	}, "walking")
	if err != nil {
		t.Fatal(err)
	}
	if len(legs) != 2 {
		t.Fatalf("expected 2 legs, got %d", len(legs))
	}
	if legs[0].DistanceMeters != 1200 || legs[0].DurationSeconds != 900 {
		t.Fatalf("unexpected first leg: %#v", legs[0])
	}
}

func TestRoutePairsRejectsUnsupportedTransport(t *testing.T) {
	client := New("key")
	_, err := client.RoutePairs(context.Background(), []RoutePair{{
		From: RouteCoordinate{Lat: 59.9386, Lon: 30.3141},
		To: RouteCoordinate{Lat: 59.945, Lon: 30.32},
	}}, "helicopter")
	if err == nil {
		t.Fatal("expected unsupported transport error")
	}
}

func TestRoutePairsRejectsInvalidCoordinates(t *testing.T) {
	client := New("key")
	_, err := client.RoutePairs(context.Background(), []RoutePair{{
		From: RouteCoordinate{Lat: 190, Lon: 30.3141},
		To: RouteCoordinate{Lat: 59.945, Lon: 30.32},
	}}, "walking")
	if err == nil {
		t.Fatal("expected invalid coordinate error")
	}
}
