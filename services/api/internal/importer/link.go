package importer

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
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
	metadata PageMetadataFetcher
}

type DetectedPlace struct {
	Query      string          `json:"query"`
	Candidates []catalog.Place `json:"candidates,omitempty"`
}

type Result struct {
	Status         string          `json:"status"`
	Platform       string          `json:"platform"`
	SourceURL      string          `json:"source_url"`
	SourceTitle    string          `json:"source_title,omitempty"`
	SourceExcerpt  string          `json:"source_excerpt,omitempty"`
	Message        string          `json:"message,omitempty"`
	SuggestedQuery string          `json:"suggested_query,omitempty"`
	SuggestedCity  string          `json:"suggested_city,omitempty"`
	Place          *catalog.Place  `json:"place,omitempty"`
	Candidates     []catalog.Place `json:"candidates,omitempty"`
	Detected       []DetectedPlace `json:"detected,omitempty"`
}

var (
	firmPattern      = regexp.MustCompile(`/firm/([0-9A-Za-z_-]+)`)
	yandexOrgPattern = regexp.MustCompile(`/org/([^/]+)`)
	urlPattern       = regexp.MustCompile(`https?://\S+`)
	listNumberPattern = regexp.MustCompile(`(?m)(^|\s)(?:\d{1,2}[.)])\s+`)
)

func New(twoGIS TwoGISLookup, searcher PlaceSearcher) *Resolver {
	return NewWithMetadata(twoGIS, searcher, NewHTTPMetadataFetcher())
}

func NewWithMetadata(
	twoGIS TwoGISLookup,
	searcher PlaceSearcher,
	metadata PageMetadataFetcher,
) *Resolver {
	return &Resolver{
		twoGIS:   twoGIS,
		searcher: searcher,
		metadata: metadata,
	}
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
			lookupCity := city
			if linkCity := twoGISCityFromPath(parsed.Path); linkCity != "" {
				lookupCity = linkCity
			}

			place, lookupErr := r.twoGIS.LookupByID(ctx, match[1], lookupCity)
			if lookupErr == nil {
				result.Status = "resolved"
				result.Place = &place
				if lookupCity != city {
					result.SuggestedCity = lookupCity
				}
				result.Message = "Место найдено по ссылке 2ГИС."
				return result, nil
			}
		}
	}

	query := suggestedQuery(parsed, platform, hint)
	sourceText := hint
	cleanedHint := cleanHint(hint)
	if cleanedHint != "" {
		result.SourceExcerpt = limitRunes(cleanedHint, 280)
	}
	metadataUsed := false
	if query == "" && r.metadata != nil && metadataPlatformSupported(platform) {
		pageMetadata, metadataErr := r.metadata.Fetch(ctx, parsed, platform)
		if metadataErr == nil {
			result.SourceTitle = limitRunes(stripPlatformBoilerplate(pageMetadata.Title, platform), 180)
			result.SourceExcerpt = limitRunes(stripPlatformBoilerplate(pageMetadata.Description, platform), 500)
			sourceText = strings.TrimSpace(pageMetadata.Title + "\n" + pageMetadata.Description)
			query = metadataSearchQuery(pageMetadata, platform)
			metadataUsed = query != ""
		}
	}

	if r.searcher != nil {
		queries := placeQueriesFromText(sourceText)
		if len(queries) >= 2 {
			detected := r.searchDetectedPlaces(ctx, queries, city)
			if len(detected) >= 2 {
				result.Detected = detected
				result.SuggestedQuery = detected[0].Query
				result.Candidates = make([]catalog.Place, 0, len(detected))

				sharedCity := ""
				sameCity := true
				for _, item := range detected {
					if len(item.Candidates) == 0 {
						continue
					}
					best := item.Candidates[0]
					result.Candidates = append(result.Candidates, best)
					if sharedCity == "" {
						sharedCity = best.City
					} else if sharedCity != best.City {
						sameCity = false
					}
				}
				if sameCity && sharedCity != "" && sharedCity != city {
					result.SuggestedCity = sharedCity
				}

				result.Message = fmt.Sprintf(
					"СПОТ распознал список и нашёл %d мест. Проверь варианты и сохрани нужные.",
					len(detected),
				)
				return result, nil
			}
		}
	}

	if query != "" {
		result.SuggestedQuery = query
		hintedCity := cityFromText(query)
		if r.searcher != nil {
			result.Candidates = r.searchCandidates(ctx, query, city, hintedCity)
			if len(result.Candidates) > 0 {
				best := result.Candidates[0]
				if best.City != city {
					score := candidateScore(query, best, city, hintedCity)
					if hintedCity == best.City || score >= 85 {
						result.SuggestedCity = best.City
					}
				}
			}
		}
	}

	switch {
	case len(result.Candidates) > 0 && result.SuggestedCity != "" && metadataUsed:
		result.Message = "СПОТ прочитал данные страницы и нашёл подходящее место в другом городе. Проверь вариант перед сохранением."
	case len(result.Candidates) > 0 && metadataUsed:
		result.Message = "СПОТ прочитал данные страницы и уже нашёл подходящие места. Выбери нужное."
	case len(result.Candidates) > 0 && result.SuggestedCity != "":
		result.Message = "СПОТ нашёл подходящее место в другом городе. Проверь вариант перед сохранением."
	case len(result.Candidates) > 0:
		result.Message = "СПОТ нашёл подходящие места по данным из ссылки. Выбери нужное."
	case query != "" && metadataUsed:
		result.Message = "СПОТ прочитал подпись страницы, но не смог уверенно сопоставить её с местом. Проверь запрос или уточни название."
	case platform == "2gis":
		result.Message = "Ссылка 2ГИС распознана, но место не удалось определить автоматически."
	default:
		result.Message = contextMessage(platform)
	}

	return result, nil
}

func (r *Resolver) searchDetectedPlaces(
	ctx context.Context,
	queries []string,
	selectedCity string,
) []DetectedPlace {
	type indexedResult struct {
		index int
		item  DetectedPlace
	}

	results := make(chan indexedResult, len(queries))
	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup

	for index, query := range queries {
		index := index
		query := query

		wg.Add(1)
		go func() {
			defer wg.Done()

			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				return
			}

			candidates := r.searchCandidates(
				ctx,
				query,
				selectedCity,
				cityFromText(query),
			)
			if len(candidates) > 3 {
				candidates = candidates[:3]
			}
			if len(candidates) == 0 {
				return
			}

			results <- indexedResult{
				index: index,
				item: DetectedPlace{
					Query:      query,
					Candidates: candidates,
				},
			}
		}()
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	ordered := make([]*DetectedPlace, len(queries))
	for result := range results {
		item := result.item
		ordered[result.index] = &item
	}

	seenBest := make(map[string]struct{})
	out := make([]DetectedPlace, 0, len(queries))
	for _, item := range ordered {
		if item == nil || len(item.Candidates) == 0 {
			continue
		}

		best := item.Candidates[0]
		key := best.ID
		if key == "" {
			key = normalizeText(best.Name) + "|" + normalizeText(best.Address) + "|" + best.City
		}
		if _, exists := seenBest[key]; exists {
			continue
		}
		seenBest[key] = struct{}{}
		out = append(out, *item)
	}

	return out
}

func placeQueriesFromText(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}

	normalized := strings.NewReplacer(
		"\r\n", "\n",
		"\r", "\n",
		"•", "\n",
		"●", "\n",
		"▪", "\n",
		"◦", "\n",
	).Replace(value)

	numbered := listNumberPattern.ReplaceAllString(normalized, "\n")
	hasStrongSeparator := numbered != normalized || strings.Contains(normalized, "\n")

	if strings.Count(numbered, ";") >= 1 {
		numbered = strings.ReplaceAll(numbered, ";", "\n")
		hasStrongSeparator = true
	}
	if !hasStrongSeparator {
		return nil
	}

	parts := strings.Split(numbered, "\n")
	seen := make(map[string]struct{})
	queries := make([]string, 0, len(parts))

	for _, part := range parts {
		query := cleanHint(part)
		if query == "" {
			continue
		}

		wordCount := len(strings.Fields(query))
		if wordCount > 18 {
			continue
		}

		key := normalizeText(query)
		if key == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}

		queries = append(queries, query)
		if len(queries) == 6 {
			break
		}
	}

	if len(queries) < 2 {
		return nil
	}
	return queries
}

func (r *Resolver) searchCandidates(ctx context.Context, query, selectedCity, hintedCity string) []catalog.Place {
	cities := []string{selectedCity, otherCity(selectedCity)}
	if hintedCity != "" && hintedCity != selectedCity {
		cities[0], cities[1] = hintedCity, selectedCity
	}

	type searchResult struct {
		places []catalog.Place
	}

	results := make(chan searchResult, len(cities))
	var wg sync.WaitGroup
	for _, city := range cities {
		city := city
		wg.Add(1)
		go func() {
			defer wg.Done()
			places, err := r.searcher.Search(ctx, query, city, "")
			if err != nil {
				results <- searchResult{}
				return
			}
			results <- searchResult{places: places}
		}()
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	seen := make(map[string]struct{})
	type scoredPlace struct {
		place catalog.Place
		score int
	}
	scored := make([]scoredPlace, 0, 10)

	for result := range results {
		for _, place := range result.places {
			key := place.ID
			if key == "" {
				key = normalizeText(place.Name) + "|" + normalizeText(place.Address) + "|" + place.City
			}
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}

			score := candidateScore(query, place, selectedCity, hintedCity)
			if score <= 0 {
				continue
			}
			scored = append(scored, scoredPlace{place: place, score: score})
		}
	}

	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score == scored[j].score {
			return scored[i].place.Name < scored[j].place.Name
		}
		return scored[i].score > scored[j].score
	})

	if len(scored) > 5 {
		scored = scored[:5]
	}

	out := make([]catalog.Place, 0, len(scored))
	for _, item := range scored {
		out = append(out, item.place)
	}
	return out
}

func candidateScore(query string, place catalog.Place, selectedCity, hintedCity string) int {
	q := normalizeText(query)
	name := normalizeText(place.Name)
	address := normalizeText(place.Address)
	if q == "" || name == "" {
		return 0
	}

	score := 10
	switch {
	case q == name:
		score = 100
	case strings.Contains(q, name) && len([]rune(name)) >= 3:
		score = 94
	case strings.Contains(name, q) && len([]rune(q)) >= 3:
		score = 90
	default:
		queryTokens := tokenSet(q)
		nameTokens := tokenSet(name)
		if len(queryTokens) > 0 && len(nameTokens) > 0 {
			overlap := 0
			for token := range nameTokens {
				if _, ok := queryTokens[token]; ok {
					overlap++
				}
			}
			denominator := len(nameTokens)
			if len(queryTokens) < denominator {
				denominator = len(queryTokens)
			}
			if denominator > 0 {
				score += overlap * 70 / denominator
			}
		}
	}

	if address != "" && strings.Contains(q, address) {
		score += 8
	}
	if hintedCity != "" && place.City == hintedCity {
		score += 15
	} else if place.City == selectedCity {
		score += 5
	}

	return score
}

func tokenSet(value string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, token := range strings.Fields(value) {
		if len([]rune(token)) < 2 {
			continue
		}
		out[token] = struct{}{}
	}
	return out
}

func otherCity(city string) string {
	if city == "moscow" {
		return "spb"
	}
	return "moscow"
}

func cityFromText(value string) string {
	value = normalizeText(value)
	switch {
	case strings.Contains(value, "москва"), strings.Contains(value, "moscow"):
		return "moscow"
	case strings.Contains(value, "санкт петербург"),
		strings.Contains(value, "петербург"),
		strings.Contains(value, "спб"),
		strings.Contains(value, "питер"),
		strings.Contains(value, "saint petersburg"),
		strings.Contains(value, "st petersburg"):
		return "spb"
	default:
		return ""
	}
}

func twoGISCityFromPath(path string) string {
	path = strings.ToLower(path)
	switch {
	case strings.Contains(path, "/moscow/"):
		return "moscow"
	case strings.Contains(path, "/spb/"):
		return "spb"
	default:
		return ""
	}
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

func normalizeText(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.NewReplacer(
		"ё", "е",
		"-", " ",
		"_", " ",
		"—", " ",
		"–", " ",
		"|", " ",
		"·", " ",
		",", " ",
		".", " ",
		":", " ",
		";", " ",
		"!", " ",
		"?", " ",
		"(", " ",
		")", " ",
		"[", " ",
		"]", " ",
	).Replace(value)
	return strings.Join(strings.Fields(value), " ")
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
