package importer

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode"

	"github.com/danx1995/spot-app/services/api/internal/catalog"
)

type TwoGISLookup interface {
	Enabled() bool
	LookupByID(ctx context.Context, providerID, city string) (catalog.Place, error)
}

type PlaceSearcher interface {
	Search(ctx context.Context, query, city, category string) ([]catalog.Place, error)
}

type Resolver struct {
	twoGIS   TwoGISLookup
	searcher PlaceSearcher
}

type Result struct {
	Status         string          `json:"status"`
	Platform       string          `json:"platform"`
	SourceURL      string          `json:"source_url"`
	Message        string          `json:"message,omitempty"`
	SuggestedQuery string          `json:"suggested_query,omitempty"`
	Place          *catalog.Place  `json:"place,omitempty"`
	Candidates     []catalog.Place `json:"candidates,omitempty"`
}

var (
	firmPattern      = regexp.MustCompile(`/firm/([0-9A-Za-z_-]+)`)
	yandexOrgPattern = regexp.MustCompile(`/org/([^/]+)`)
	urlPattern       = regexp.MustCompile(`https?://\S+`)
)

func New(twoGIS TwoGISLookup, searcher PlaceSearcher) *Resolver {
	return &Resolver{twoGIS: twoGIS, searcher: searcher}
}

func (r *Resolver) Resolve(ctx context.Context, rawURL, city, hint string) (Result, error) {
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

	if platform == "2gis" {
		match := firmPattern.FindStringSubmatch(parsed.Path)
		if len(match) == 2 && r.twoGIS != nil && r.twoGIS.Enabled() {
			place, lookupErr := r.twoGIS.LookupByID(ctx, match[1], city)
			if lookupErr == nil {
				result.Status = "resolved"
				result.Place = &place
				result.Message = "Место найдено по ссылке 2ГИС."
				return result, nil
			}
		}
	}

	query := suggestedQuery(parsed, platform, hint)
	if query != "" {
		result.SuggestedQuery = query
		if r.searcher != nil {
			if places, searchErr := r.searcher.Search(ctx, query, city, ""); searchErr == nil {
				if len(places) > 5 {
					places = places[:5]
				}
				result.Candidates = places
			}
		}
	}

	switch {
	case len(result.Candidates) > 0:
		result.Message = "СПОТ нашёл подходящие места по данным из ссылки. Выбери нужное."
	case platform == "2gis":
		result.Message = "Ссылка 2ГИС распознана, но место не удалось определить автоматически."
	default:
		result.Message = contextMessage(platform)
	}

	return result, nil
}

func suggestedQuery(parsed *url.URL, platform, hint string) string {
	if cleaned := cleanHint(hint); cleaned != "" {
		return cleaned
	}

	if platform == "yandex_maps" {
		match := yandexOrgPattern.FindStringSubmatch(parsed.Path)
		if len(match) == 2 {
			value, err := url.PathUnescape(match[1])
			if err == nil {
				value = strings.NewReplacer("-", " ", "_", " ").Replace(value)
				return cleanHint(value)
			}
		}
	}

	return ""
}

func cleanHint(value string) string {
	value = urlPattern.ReplaceAllString(value, " ")
	value = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, value)
	value = strings.Join(strings.Fields(value), " ")
	value = strings.Trim(value, "—–-|·•:;,.!?()[]{}")
	if len([]rune(value)) < 2 {
		return ""
	}

	runes := []rune(value)
	if len(runes) > 120 {
		runes = runes[:120]
	}
	return strings.TrimSpace(string(runes))
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
		return "Ссылка Яндекс Карт распознана. Найди место по названию — источник останется в карточке."
	default:
		return "Ссылка принята. Укажи название места, чтобы связать её со спотом."
	}
}
