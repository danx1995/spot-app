package routing

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/danx1995/spot-app/services/api/internal/provider/twogis"
)

var ErrInvalidInput = errors.New("invalid routing input")

const (
	maxRoutePoints = 6
	maxCacheEntries = 4096
	walkingSpeedMPS = 1.3
	drivingSpeedMPS = 8.3
	bicycleSpeedMPS = 4.2
)

type Point struct {
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"lng"`
}

type Leg struct {
	DistanceMeters  int `json:"distance_meters"`
	DurationSeconds int `json:"duration_seconds"`
}

type Summary struct {
	Transport            string `json:"transport"`
	Source               string `json:"source"`
	Legs                 []Leg  `json:"legs"`
	TotalDistanceMeters  int    `json:"total_distance_meters"`
	TotalDurationSeconds int    `json:"total_duration_seconds"`
}

type Provider interface {
	Enabled() bool
	RoutePairs(context.Context, []twogis.RoutePair, string) ([]twogis.RouteLeg, error)
}

type cachedLeg struct {
	leg       Leg
	expiresAt time.Time
}

type Service struct {
	provider Provider
	mu       sync.Mutex
	cache    map[string]cachedLeg
	group    singleflight.Group
	now      func() time.Time
}

func New(provider Provider) *Service {
	return &Service{
		provider: provider,
		cache:    make(map[string]cachedLeg),
		now:      time.Now,
	}
}

func (s *Service) Build(
	ctx context.Context,
	points []Point,
	transport string,
) (Summary, error) {
	transport = strings.TrimSpace(transport)
	if transport == "" {
		transport = "walking"
	}
	if !validTransport(transport) || len(points) < 2 || len(points) > maxRoutePoints {
		return Summary{}, ErrInvalidInput
	}

	for _, point := range points {
		if !validCoordinate(point.Latitude, point.Longitude) {
			return Summary{}, ErrInvalidInput
		}
	}

	pairs := make([]twogis.RoutePair, 0, len(points)-1)
	fallback := make([]Leg, 0, len(points)-1)
	for index := 1; index < len(points); index++ {
		from := points[index-1]
		to := points[index]
		pairs = append(pairs, twogis.RoutePair{
			From: twogis.RouteCoordinate{Lat: from.Latitude, Lon: from.Longitude},
			To:   twogis.RouteCoordinate{Lat: to.Latitude, Lon: to.Longitude},
		})
		fallback = append(fallback, estimateLeg(from, to, transport))
	}

	legs := append([]Leg(nil), fallback...)
	realCount := 0

	if s.provider != nil && s.provider.Enabled() {
		now := s.now()
		missingPairs := make([]twogis.RoutePair, 0, len(pairs))
		missingIndexes := make([]int, 0, len(pairs))
		missingKeys := make([]string, 0, len(pairs))

		for index, pair := range pairs {
			key := cacheKey(pair, transport)
			if cached, ok := s.getCached(key, now); ok {
				legs[index] = cached
				realCount++
				continue
			}
			missingPairs = append(missingPairs, pair)
			missingIndexes = append(missingIndexes, index)
			missingKeys = append(missingKeys, key)
		}

		if len(missingPairs) > 0 {
			groupKey := strings.Join(missingKeys, "|")
			value, err, _ := s.group.Do(groupKey, func() (any, error) {
				return s.provider.RoutePairs(ctx, missingPairs, transport)
			})
			if err == nil {
				providerLegs, ok := value.([]twogis.RouteLeg)
				if ok && len(providerLegs) == len(missingPairs) {
					ttl := cacheTTL(transport)
					for index, providerLeg := range providerLegs {
						leg := Leg{
							DistanceMeters:  providerLeg.DistanceMeters,
							DurationSeconds: providerLeg.DurationSeconds,
						}
						targetIndex := missingIndexes[index]
						legs[targetIndex] = leg
						realCount++
						s.setCached(missingKeys[index], leg, now.Add(ttl))
					}
				}
			}
		}
	}

	source := "estimate"
	if realCount == len(legs) {
		source = "2gis"
	} else if realCount > 0 {
		source = "mixed"
	}

	summary := Summary{
		Transport: transport,
		Source:    source,
		Legs:      legs,
	}
	for _, leg := range legs {
		summary.TotalDistanceMeters += leg.DistanceMeters
		summary.TotalDurationSeconds += leg.DurationSeconds
	}
	return summary, nil
}

func (s *Service) getCached(key string, now time.Time) (Leg, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.cache[key]
	if !ok {
		return Leg{}, false
	}
	if !now.Before(item.expiresAt) {
		delete(s.cache, key)
		return Leg{}, false
	}
	return item.leg, true
}

func (s *Service) setCached(key string, leg Leg, expiresAt time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.cache) >= maxCacheEntries {
		now := s.now()
		for cacheKey, item := range s.cache {
			if !now.Before(item.expiresAt) {
				delete(s.cache, cacheKey)
			}
		}
	}
	if len(s.cache) >= maxCacheEntries {
		for cacheKey := range s.cache {
			delete(s.cache, cacheKey)
			break
		}
	}

	s.cache[key] = cachedLeg{leg: leg, expiresAt: expiresAt}
}

func validTransport(value string) bool {
	switch value {
	case "walking", "driving", "bicycle":
		return true
	default:
		return false
	}
}

func cacheTTL(transport string) time.Duration {
	if transport == "driving" {
		return 2 * time.Minute
	}
	return 15 * time.Minute
}

func cacheKey(pair twogis.RoutePair, transport string) string {
	return fmt.Sprintf(
		"%s:%.5f,%.5f>%.5f,%.5f",
		transport,
		pair.From.Lat,
		pair.From.Lon,
		pair.To.Lat,
		pair.To.Lon,
	)
}

func estimateLeg(from, to Point, transport string) Leg {
	straight := haversineMeters(from, to)
	roadFactor := 1.18
	speed := walkingSpeedMPS

	switch transport {
	case "driving":
		roadFactor = 1.28
		speed = drivingSpeedMPS
	case "bicycle":
		roadFactor = 1.2
		speed = bicycleSpeedMPS
	}

	distance := int(math.Round(straight * roadFactor))
	duration := 0
	if distance > 0 {
		duration = int(math.Round(float64(distance) / speed))
	}
	return Leg{
		DistanceMeters:  distance,
		DurationSeconds: duration,
	}
}

func haversineMeters(from, to Point) float64 {
	const earthRadius = 6_371_000.0

	lat1 := from.Latitude * math.Pi / 180
	lat2 := to.Latitude * math.Pi / 180
	deltaLat := (to.Latitude - from.Latitude) * math.Pi / 180
	deltaLng := (to.Longitude - from.Longitude) * math.Pi / 180

	a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
		math.Cos(lat1)*math.Cos(lat2)*
			math.Sin(deltaLng/2)*math.Sin(deltaLng/2)

	return 2 * earthRadius * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func validCoordinate(lat, lon float64) bool {
	return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}
