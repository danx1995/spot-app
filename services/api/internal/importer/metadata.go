package importer

import (
	"context"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const maxMetadataHTMLBytes = 512 << 10

type PageMetadata struct {
	Title       string
	Description string
}

type PageMetadataFetcher interface {
	Fetch(ctx context.Context, target *url.URL, platform string) (PageMetadata, error)
}

type HTTPMetadataFetcher struct {
	client *http.Client
}

var (
	metaTagPattern = regexp.MustCompile(`(?is)<meta\s+[^>]*>`)
	metaAttrPattern = regexp.MustCompile(`(?i)([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`)
	titlePattern = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	tagPattern = regexp.MustCompile(`(?is)<[^>]+>`)
)

func NewHTTPMetadataFetcher() *HTTPMetadataFetcher {
	fetcher := &HTTPMetadataFetcher{}
	fetcher.client = &http.Client{
		Timeout: 4 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 4 {
				return fmt.Errorf("too many redirects")
			}
			if len(via) == 0 {
				return nil
			}
			originalPlatform := platformForHost(via[0].URL.Hostname())
			if originalPlatform == "web" || platformForHost(req.URL.Hostname()) != originalPlatform {
				return fmt.Errorf("redirect left supported platform")
			}
			return nil
		},
	}
	return fetcher
}

func (f *HTTPMetadataFetcher) Fetch(
	ctx context.Context,
	target *url.URL,
	platform string,
) (PageMetadata, error) {
	if !metadataPlatformSupported(platform) {
		return PageMetadata{}, fmt.Errorf("metadata fetch is not supported for %s", platform)
	}
	if target == nil || platformForHost(target.Hostname()) != platform {
		return PageMetadata{}, fmt.Errorf("metadata target is not trusted")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return PageMetadata{}, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; SPOTLinkPreview/1.0; +https://spot.app)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("Accept-Language", "ru,en;q=0.8")

	res, err := f.client.Do(req)
	if err != nil {
		return PageMetadata{}, err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return PageMetadata{}, fmt.Errorf("metadata page returned %d", res.StatusCode)
	}

	contentType := strings.ToLower(res.Header.Get("Content-Type"))
	if contentType != "" && !strings.Contains(contentType, "text/html") && !strings.Contains(contentType, "application/xhtml+xml") {
		return PageMetadata{}, fmt.Errorf("metadata response is not html")
	}

	body, err := io.ReadAll(io.LimitReader(res.Body, maxMetadataHTMLBytes+1))
	if err != nil {
		return PageMetadata{}, err
	}
	if len(body) > maxMetadataHTMLBytes {
		return PageMetadata{}, fmt.Errorf("metadata page is too large")
	}

	metadata := parsePageMetadata(string(body))
	if metadata.Title == "" && metadata.Description == "" {
		return PageMetadata{}, fmt.Errorf("metadata is empty")
	}
	return metadata, nil
}

func metadataPlatformSupported(platform string) bool {
	switch platform {
	case "instagram", "tiktok", "telegram":
		return true
	default:
		return false
	}
}

func parsePageMetadata(document string) PageMetadata {
	values := map[string]string{}

	for _, tag := range metaTagPattern.FindAllString(document, -1) {
		attrs := map[string]string{}
		for _, match := range metaAttrPattern.FindAllStringSubmatch(tag, -1) {
			key := strings.ToLower(strings.TrimSpace(match[1]))
			value := ""
			for i := 2; i < len(match); i++ {
				if match[i] != "" {
					value = match[i]
					break
				}
			}
			attrs[key] = cleanMetadataValue(value)
		}

		key := strings.ToLower(strings.TrimSpace(attrs["property"]))
		if key == "" {
			key = strings.ToLower(strings.TrimSpace(attrs["name"]))
		}
		if key == "" || attrs["content"] == "" {
			continue
		}
		if _, exists := values[key]; !exists {
			values[key] = attrs["content"]
		}
	}

	title := firstNonEmpty(
		values["og:title"],
		values["twitter:title"],
	)
	if title == "" {
		if match := titlePattern.FindStringSubmatch(document); len(match) == 2 {
			title = cleanMetadataValue(tagPattern.ReplaceAllString(match[1], " "))
		}
	}

	description := firstNonEmpty(
		values["og:description"],
		values["twitter:description"],
		values["description"],
	)

	return PageMetadata{
		Title:       limitRunes(title, 180),
		Description: limitRunes(description, 500),
	}
}

func cleanMetadataValue(value string) string {
	value = html.UnescapeString(value)
	value = strings.Map(func(r rune) rune {
		if r == '\u0000' || r == '\r' || r == '\n' || r == '\t' {
			return ' '
		}
		return r
	}, value)
	return strings.Join(strings.Fields(value), " ")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func limitRunes(value string, max int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return strings.TrimSpace(string(runes[:max]))
}

func metadataSearchQuery(metadata PageMetadata, platform string) string {
	title := stripPlatformBoilerplate(metadata.Title, platform)
	description := stripPlatformBoilerplate(metadata.Description, platform)

	switch {
	case title != "" && description != "":
		if normalizeText(title) == normalizeText(description) {
			return cleanHint(title)
		}
		return cleanHint(title + " " + description)
	case description != "":
		return cleanHint(description)
	default:
		return cleanHint(title)
	}
}

func stripPlatformBoilerplate(value, platform string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	replacements := []string{}
	switch platform {
	case "instagram":
		replacements = []string{
			" • Instagram photos and videos",
			" on Instagram",
			"Instagram",
		}
	case "tiktok":
		replacements = []string{
			" | TikTok",
			" - TikTok",
			"TikTok",
		}
	case "telegram":
		replacements = []string{
			" – Telegram",
			" - Telegram",
			"Telegram",
		}
	}

	for _, suffix := range replacements {
		value = strings.ReplaceAll(value, suffix, " ")
	}
	return strings.Join(strings.Fields(value), " ")
}
