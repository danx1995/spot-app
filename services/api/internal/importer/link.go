package importer

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

type TwoGISLookup interface {
	Enabled() bool
	LookupByID(ctx context.Context, providerID, city string) (catalog.Place, error)
}

type Resolver struct {
	twoGIS TwoGISLookup
}

type Result struct {
	Status   string         `json:"status"`
	Platform string         `json:"platform"`
	SourceURL string        `json:"source_url"`
	Message  string         `json:"message,omitempty"`
	Place    *catalog.Place `json:"place,omitempty"`
}

var firmPattern = regexp.MustCompile(`/firm/([0-9A-Za-z_-]+)`)

func New(twoGIS TwoGISLookup) *Resolver {
	return &Resolver{twoGIS: twoGIS}
}

func (r *Resolver) Resolve(ctx context.Context, rawURL, city string) (Result, error) {
	parsed, err := normalizeURL(rawURL)
	if err != nil {
		return Result{}, err
	}
	if city != "spb" && city != "moscow" {
		return Result{}, fmt.Errorf("unsupported city")
	}

	platform := platformForHost(parsed.Hostname())
	result := Result{
		Status:    "needs_context",
		Platform:  platform,
		SourceURL: parsed.String(),
	}

	if platform != "2gis" {
		result.Message = contextMessage(platform)
		return result, nil
	}

	match := firmPattern.FindStringSubmatch(parsed.Path)
	if len(match) != 2 {
		result.Message = "Ссылка 2ГИС распознана, но в ней нет прямого ID карточки места."
		return result, nil
	}
	if r.twoGIS == nil || !r.twoGIS.Enabled() {
		result.Message = "Ссылка 2ГИС распознана. Для автоматического определения нужен ключ Places API."
		return result, nil
	}

	place, err := r.twoGIS.LookupByID(ctx, match[1], city)
	if err != nil {
		result.Message = "Не удалось автоматически получить карточку места. Можно найти его по названию."
		return result, nil
	}

	result.Status = "resolved"
	result.Place = &place
	result.Message = "Место найдено по ссылке 2ГИС."
	return result, nil
}

func normalizeURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("url is required")
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("invalid url")
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return nil, fmt.Errorf("unsupported url scheme")
	}
	if parsed.Hostname() == "" {
		return nil, fmt.Errorf("url host is required")
	}

	parsed.Fragment = ""
	return parsed, nil
}

func platformForHost(host string) string {
	host = strings.ToLower(strings.TrimSuffix(host, "."))

	switch {
	case host == "2gis.ru", strings.HasSuffix(host, ".2gis.ru"),
		host == "2gis.com", strings.HasSuffix(host, ".2gis.com"):
		return "2gis"
	case host == "instagram.com", strings.HasSuffix(host, ".instagram.com"):
		return "instagram"
	case host == "tiktok.com", strings.HasSuffix(host, ".tiktok.com"):
		return "tiktok"
	case host == "t.me", strings.HasSuffix(host, ".t.me"),
		host == "telegram.me", strings.HasSuffix(host, ".telegram.me"):
		return "telegram"
	case host == "yandex.ru", strings.HasSuffix(host, ".yandex.ru"),
		host == "yandex.com", strings.HasSuffix(host, ".yandex.com"):
		return "yandex_maps"
	default:
		return "web"
	}
}

func contextMessage(platform string) string {
	switch platform {
	case "instagram":
		return "Ссылка на Instagram сохранена. Добавь название места — СПОТ привяжет источник к карточке."
	case "tiktok":
		return "Ссылка на TikTok сохранена. Добавь название места — СПОТ привяжет источник к карточке."
	case "telegram":
		return "Ссылка на Telegram сохранена. Добавь название места — СПОТ привяжет источник к карточке."
	case "yandex_maps":
		return "Ссылка Яндекс Карт распознана. Пока найди место по названию, источник останется в карточке."
	default:
		return "Ссылка принята. Укажи название места, чтобы связать её со спотом."
	}
}
