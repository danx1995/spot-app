package twogis

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

const routingEndpoint = "https://routing.api.2gis.com/routing/7.0.0/global"

type RouteCoordinate struct {
	Lat float64
	Lon float64
}

type RoutePair struct {
	From RouteCoordinate
	To   RouteCoordinate
}

type RouteLeg struct {
	DistanceMeters int
	DurationSeconds int
	Reliability float64
	Status string
}

type routePoint struct {
	Type string  `json:"type"`
	Lon  float64 `json:"lon"`
	Lat  float64 `json:"lat"`
}

type routePairsRequest struct {
	Points    [][]routePoint `json:"points"`
	Transport string         `json:"transport"`
	Output    string         `json:"output"`
	Locale    string         `json:"locale"`
}

type routePairResponse struct {
	Distance    int     `json:"distance"`
	Duration    int     `json:"duration"`
	Reliability float64 `json:"reliability"`
	Status      string  `json:"status"`
}

func (c *Client) RoutePairs(
	ctx context.Context,
	pairs []RoutePair,
	transport string,
) ([]RouteLeg, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("2gis provider is disabled")
	}
	if len(pairs) == 0 {
		return []RouteLeg{}, nil
	}

	switch transport {
	case "walking", "driving", "bicycle":
	default:
		return nil, fmt.Errorf("unsupported routing transport %q", transport)
	}

	pointType := "stop"
	if transport == "walking" {
		pointType = "walking"
	}

	requestPairs := make([][]routePoint, 0, len(pairs))
	for _, pair := range pairs {
		if !validCoordinate(pair.From.Lat, pair.From.Lon) ||
			!validCoordinate(pair.To.Lat, pair.To.Lon) {
			return nil, fmt.Errorf("invalid route coordinates")
		}

		requestPairs = append(requestPairs, []routePoint{
			{Type: pointType, Lon: pair.From.Lon, Lat: pair.From.Lat},
			{Type: pointType, Lon: pair.To.Lon, Lat: pair.To.Lat},
		})
	}

	body, err := json.Marshal(routePairsRequest{
		Points:    requestPairs,
		Transport: transport,
		Output:    "summary",
		Locale:    "ru",
	})
	if err != nil {
		return nil, err
	}

	params := url.Values{}
	params.Set("key", c.apiKey)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		routingEndpoint+"?"+params.Encode(),
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("2gis routing returned status %d", res.StatusCode)
	}

	var payload []routePairResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if len(payload) != len(pairs) {
		return nil, fmt.Errorf("2gis routing returned %d legs for %d pairs", len(payload), len(pairs))
	}

	legs := make([]RouteLeg, 0, len(payload))
	for _, item := range payload {
		if item.Status != "OK" || item.Distance < 0 || item.Duration < 0 {
			return nil, fmt.Errorf("2gis routing failed for a route leg")
		}
		legs = append(legs, RouteLeg{
			DistanceMeters: item.Distance,
			DurationSeconds: item.Duration,
			Reliability: item.Reliability,
			Status: item.Status,
		})
	}

	return legs, nil
}
