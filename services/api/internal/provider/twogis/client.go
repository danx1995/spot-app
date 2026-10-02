package twogis

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

const endpoint = "https://catalog.api.2gis.com/3.0/items"

var providerIDPattern = regexp.MustCompile(`^[0-9A-Za-z_-]{1,128}$`)

type Client struct {
	apiKey string
	http   *http.Client
}

func New(apiKey string) *Client {
	return &Client{
		apiKey: strings.TrimSpace(apiKey),
		http:   &http.Client{Timeout: 4 * time.Second},
	}
}

func (c *Client) Enabled() bool {
	return c.apiKey != ""
}

type point struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type rubric struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
}

type reviews struct {
	GeneralRating float64 `json:"general_rating"`
}

type item struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	AddressName string   `json:"address_name"`
	Point       *point   `json:"point"`
	Rubrics     []rubric `json:"rubrics"`
	Reviews     *reviews `json:"reviews"`
}

type response struct {
	Meta struct {
		Code int `json:"code"`
	} `json:"meta"`
	Result struct {
		Items []item `json:"items"`
	} `json:"result"`
}

func (c *Client) Search(ctx context.Context, query, city string) ([]catalog.Place, error) {
	if !c.Enabled() {
		return nil, nil
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	lon, lat, label, ok := cityCenter(city)
	if !ok {
		return nil, fmt.Errorf("unsupported city %q", city)
	}

	params := url.Values{}
	params.Set("q", query)
	params.Set("location", fmt.Sprintf("%.6f,%.6f", lon, lat))
	params.Set("type", "branch")
	params.Set("fields", "items.point,items.rubrics,items.reviews")
	params.Set("page_size", "10")
	params.Set("key", c.apiKey)

	payload, err := c.get(ctx, endpoint, params)
	if err != nil {
		return nil, err
	}

	places := make([]catalog.Place, 0, len(payload.Result.Items))
	for _, it := range payload.Result.Items {
		place, ok := normalizeItem(it, city, label)
		if ok {
			places = append(places, place)
		}
	}

	return places, nil
}

func (c *Client) LookupByID(ctx context.Context, providerID, city string) (catalog.Place, error) {
	if !c.Enabled() {
		return catalog.Place{}, fmt.Errorf("2gis provider is disabled")
	}

	providerID = strings.TrimSpace(providerID)
	if !providerIDPattern.MatchString(providerID) {
		return catalog.Place{}, fmt.Errorf("invalid 2gis object id")
	}

	_, _, label, ok := cityCenter(city)
	if !ok {
		return catalog.Place{}, fmt.Errorf("unsupported city %q", city)
	}

	params := url.Values{}
	params.Set("id", providerID)
	params.Set("fields", "items.point,items.rubrics,items.reviews")
	params.Set("key", c.apiKey)

	payload, err := c.get(ctx, endpoint+"/byid", params)
	if err != nil {
		return catalog.Place{}, err
	}
	if len(payload.Result.Items) == 0 {
		return catalog.Place{}, fmt.Errorf("2gis object not found")
	}

	place, ok := normalizeItem(payload.Result.Items[0], city, label)
	if !ok {
		return catalog.Place{}, fmt.Errorf("2gis object has no usable coordinates")
	}
	return place, nil
}

func (c *Client) get(ctx context.Context, endpointURL string, params url.Values) (response, error) {
	var payload response

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpointURL+"?"+params.Encode(), nil)
	if err != nil {
		return payload, err
	}

	res, err := c.http.Do(req)
	if err != nil {
		return payload, err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return payload, fmt.Errorf("2gis returned status %d", res.StatusCode)
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return payload, err
	}
	if payload.Meta.Code != 0 && payload.Meta.Code != 200 {
		return payload, fmt.Errorf("2gis meta code %d", payload.Meta.Code)
	}

	return payload, nil
}

func normalizeItem(it item, city, cityLabel string) (catalog.Place, bool) {
	if it.Point == nil || strings.TrimSpace(it.Name) == "" {
		return catalog.Place{}, false
	}

	category, categoryLabel := categoryFromRubrics(it.Rubrics)
	rating := 0.0
	if it.Reviews != nil && it.Reviews.GeneralRating >= 0 && it.Reviews.GeneralRating <= 5 {
		rating = it.Reviews.GeneralRating
	}

	return catalog.Place{
		ID:             publicID(it.ID),
		Name:           it.Name,
		Category:       category,
		CategoryLabel:  categoryLabel,
		City:           city,
		CityLabel:      cityLabel,
		Address:        it.AddressName,
		Latitude:       it.Point.Lat,
		Longitude:      it.Point.Lon,
		Rating:         rating,
		DistanceMeters: 0,
	}, true
}

func cityCenter(city string) (lon, lat float64, label string, ok bool) {
	switch city {
	case "spb":
		return 30.3141, 59.9386, "Санкт-Петербург", true
	case "moscow":
		return 37.6173, 55.7558, "Москва", true
	default:
		return 0, 0, "", false
	}
}

func categoryFromRubrics(rubrics []rubric) (string, string) {
	label := "Место"
	for _, r := range rubrics {
		if r.Kind == "primary" && strings.TrimSpace(r.Name) != "" {
			label = r.Name
			break
		}
	}
	name := strings.ToLower(label)

	switch {
	case strings.Contains(name, "кофе"):
		return "coffee", label
	case strings.Contains(name, "ресторан"), strings.Contains(name, "кафе"):
		return "restaurant", label
	case strings.Contains(name, "бар"), strings.Contains(name, "паб"):
		return "bar", label
	case strings.Contains(name, "отел"), strings.Contains(name, "гостиниц"):
		return "hotel", label
	case strings.Contains(name, "кино"), strings.Contains(name, "развлеч"):
		return "entertainment", label
	case strings.Contains(name, "музе"), strings.Contains(name, "галере"), strings.Contains(name, "театр"):
		return "culture", label
	case strings.Contains(name, "магазин"), strings.Contains(name, "торгов"):
		return "shop", label
	default:
		return "other", label
	}
}

func publicID(providerID string) string {
	if providerID == "" {
		panic(errors.New("provider id must not be empty"))
	}
	sum := sha256.Sum256([]byte("2gis:" + providerID))
	return "sp_" + hex.EncodeToString(sum[:6])
}
