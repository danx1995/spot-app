package main

import (
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"strings"

	"github.com/danx1995/spot-app/services/api/internal/library"
)

type publicPlacePageView struct {
	Name          string
	CategoryLabel string
	CityLabel     string
	Address       string
	Description   string
	Rating        string
	ReviewCount   int
	MapURL        string
	AppURL        template.URL
}

var publicPlaceTemplate = template.Must(template.New("place").Parse(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#0B0F0C">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="СПОТ">
  <meta property="og:title" content="{{.Name}} · СПОТ">
  <meta property="og:description" content="{{if .Description}}{{.Description}}{{else}}{{.CategoryLabel}} · {{.CityLabel}}{{end}}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="{{.Name}} · СПОТ">
  <meta name="twitter:description" content="{{if .Description}}{{.Description}}{{else}}{{.CategoryLabel}} · {{.CityLabel}}{{end}}">
  <title>{{.Name}} · СПОТ</title>
  <style>
    :root{color-scheme:dark;background:#0B0F0C;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}
    body{margin:0;background:#0B0F0C;color:#fff}
    main{width:min(680px,100%);margin:0 auto;padding:28px 18px 64px}
    .brand{display:flex;align-items:center;gap:10px;color:#19C37D;font-weight:900;letter-spacing:.16em;font-size:12px}
    .mark{width:34px;height:34px;border-radius:13px;background:#19C37D;color:#0B0F0C;display:grid;place-items:center;font-size:17px;letter-spacing:0}
    .hero{margin-top:34px;min-height:210px;border-radius:32px;background:radial-gradient(circle at 50% 45%,#22583E 0,#173326 34%,#111914 72%);display:grid;place-items:center;overflow:hidden}
    .heroMark{font-size:78px;color:#19C37D;font-weight:900}
    .content{padding:26px 2px 0}
    .eyebrow{color:#19C37D;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
    h1{font-size:clamp(36px,10vw,58px);line-height:1;letter-spacing:-.045em;margin:8px 0 0}
    .meta{margin-top:12px;color:#A8B0AB;font-size:14px;line-height:1.5}
    .description{margin-top:18px;background:#151B17;border:1px solid #202823;border-radius:22px;padding:17px;color:#D7DDD9;font-size:14px;line-height:1.55}
    .stats{margin-top:17px;display:flex;gap:10px;flex-wrap:wrap}
    .stat{background:#151B17;border-radius:15px;padding:10px 12px;color:#D7DDD9;font-size:12px;font-weight:800}
    .actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:22px}
    .cta{min-height:58px;border-radius:19px;background:#19C37D;color:#0B0F0C;text-decoration:none;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900}
    .secondary{min-height:54px;border-radius:19px;background:#151B17;color:#fff;text-decoration:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800}
    .hint{margin:9px 4px 0;color:#78827C;font-size:11px;line-height:1.5}
    footer{margin-top:34px;color:#66716B;font-size:11px;line-height:1.5}
  </style>
</head>
<body>
  <main>
    <div class="brand"><span class="mark">♥</span>СПОТ</div>
    <section class="hero"><div class="heroMark">♥</div></section>
    <section class="content">
      <div class="eyebrow">{{.CategoryLabel}}{{if .CityLabel}} · {{.CityLabel}}{{end}}</div>
      <h1>{{.Name}}</h1>
      <div class="meta">{{.Address}}</div>
      <div class="stats">
        {{if .Rating}}<span class="stat">★ {{.Rating}}{{if .ReviewCount}} · {{.ReviewCount}} отзывов{{end}}</span>{{end}}
      </div>
      {{if .Description}}<div class="description">{{.Description}}</div>{{end}}
      <div class="actions">
        <a class="cta" href="{{.AppURL}}">♥ Открыть в СПОТ</a>
        <a class="secondary" href="{{.MapURL}}" target="_blank" rel="noopener noreferrer">Маршрут ↗</a>
      </div>
      <div class="hint">В СПОТ место можно сохранить, добавить в подборку и потом быстро найти на личной карте.</div>
    </section>
    <footer>Место отправлено из СПОТ — личной карты сохранённых мест.</footer>
  </main>
</body>
</html>`))

func registerPublicPlaceRoutes(mux *http.ServeMux, store library.Store) {
	mux.HandleFunc("GET /api/v1/public/places/{id}", func(w http.ResponseWriter, r *http.Request) {
		shared, err := store.GetSharedPlace(r.Context(), r.PathValue("id"))
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, shared)
	})

	mux.HandleFunc("GET /p/{id}", func(w http.ResponseWriter, r *http.Request) {
		shared, err := store.GetSharedPlace(r.Context(), r.PathValue("id"))
		if err != nil {
			if err == library.ErrNotFound {
				http.Error(w, "Ссылка на место недоступна.", http.StatusNotFound)
				return
			}
			http.Error(w, "Не удалось открыть место.", http.StatusInternalServerError)
			return
		}

		place := shared.Place
		rating := ""
		if place.Rating > 0 {
			rating = fmt.Sprintf("%.1f", place.Rating)
		}

		view := publicPlacePageView{
			Name:          place.Name,
			CategoryLabel: place.CategoryLabel,
			CityLabel:     place.CityLabel,
			Address:       place.Address,
			Description:   strings.TrimSpace(place.Description),
			Rating:        rating,
			ReviewCount:   place.ReviewCount,
			MapURL: fmt.Sprintf(
				"https://yandex.ru/maps/?pt=%.6f,%.6f&z=16&l=map",
				place.Longitude,
				place.Latitude,
			),
			AppURL: template.URL("spot://place?id=" + url.QueryEscape(shared.ShareID)),
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=60")
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		if err := publicPlaceTemplate.Execute(w, view); err != nil {
			if !strings.Contains(err.Error(), "broken pipe") {
				http.Error(w, "Не удалось отобразить место.", http.StatusInternalServerError)
			}
		}
	})
}
