package main

import (
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"strings"

	"github.com/danx1995/spot-app/services/api/internal/library"
)

type publicPlaceView struct {
	Name          string
	CategoryLabel string
	CityLabel     string
	Address       string
	Rating        string
	MapURL        string
}

type publicCollectionView struct {
	Title            string
	Description      string
	ShareDescription string
	CityLabel        string
	PlaceCount       int
	AppURL           template.URL
	Places           []publicPlaceView
}

var publicCollectionTemplate = template.Must(template.New("collection").Parse(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#0B0F0C">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="СПОТ">
  <meta property="og:title" content="{{.Title}} · СПОТ">
  <meta property="og:description" content="{{.ShareDescription}}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="{{.Title}} · СПОТ">
  <meta name="twitter:description" content="{{.ShareDescription}}">
  <title>{{.Title}} · СПОТ</title>
  <style>
    :root{color-scheme:dark;background:#0B0F0C;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}
    body{margin:0;background:#0B0F0C;color:#fff}
    main{width:min(760px,100%);margin:0 auto;padding:34px 18px 64px}
    .brand{display:flex;align-items:center;gap:10px;color:#19C37D;font-weight:900;letter-spacing:.16em;font-size:12px}
    .mark{width:34px;height:34px;border-radius:13px;background:#19C37D;color:#0B0F0C;display:grid;place-items:center;font-size:17px;letter-spacing:0}
    .hero{margin-top:40px}
    .eyebrow{color:#19C37D;font-size:11px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
    h1{font-size:clamp(36px,9vw,64px);line-height:.98;letter-spacing:-.045em;margin:10px 0 0}
    .desc{margin:16px 0 0;color:#A8B0AB;font-size:16px;line-height:1.55;max-width:620px}
    .meta{margin-top:18px;display:inline-flex;gap:8px;align-items:center;background:#151B17;border-radius:16px;padding:10px 13px;color:#C9D0CC;font-size:12px;font-weight:700}
    .ctaWrap{margin-top:22px}
    .cta{display:flex;align-items:center;justify-content:center;min-height:58px;border-radius:19px;background:#19C37D;color:#0B0F0C;text-decoration:none;font-size:14px;font-weight:900}
    .ctaHint{margin:9px 4px 0;color:#7E8983;font-size:11px;line-height:1.5}
    .list{display:grid;gap:12px;margin-top:34px}
    .place{background:#151B17;border:1px solid #202823;border-radius:24px;padding:18px;text-decoration:none;color:inherit;display:block}
    .top{display:flex;gap:16px;align-items:flex-start}
    .copy{min-width:0;flex:1}
    .category{font-size:10px;letter-spacing:.12em;color:#19C37D;font-weight:900;text-transform:uppercase}
    .name{font-size:21px;line-height:1.15;font-weight:900;margin-top:5px;letter-spacing:-.02em}
    .address{font-size:13px;color:#97A09B;margin-top:7px;line-height:1.45}
    .rating{white-space:nowrap;color:#fff;font-size:13px;font-weight:800}
    .map{margin-top:15px;color:#19C37D;font-size:12px;font-weight:900}
    .empty{margin-top:34px;background:#151B17;border-radius:24px;padding:24px;color:#97A09B}
    footer{margin-top:38px;color:#66716B;font-size:11px;line-height:1.5}
  </style>
</head>
<body>
  <main>
    <div class="brand"><span class="mark">♥</span>СПОТ</div>
    <section class="hero">
      <div class="eyebrow">{{if .CityLabel}}{{.CityLabel}}{{else}}Москва · Петербург{{end}}</div>
      <h1>{{.Title}}</h1>
      {{if .Description}}<p class="desc">{{.Description}}</p>{{end}}
      <div class="meta">{{.PlaceCount}} мест · общая подборка</div>
      <div class="ctaWrap">
        <a class="cta" href="{{.AppURL}}">♥ Добавить подборку в СПОТ</a>
        <div class="ctaHint">Если СПОТ установлен, подборка откроется прямо в приложении. Перед добавлением можно проверить все места.</div>
      </div>
    </section>

    {{if .Places}}
      <section class="list">
        {{range .Places}}
          <a class="place" href="{{.MapURL}}" target="_blank" rel="noopener noreferrer">
            <div class="top">
              <div class="copy">
                <div class="category">{{.CategoryLabel}}{{if .CityLabel}} · {{.CityLabel}}{{end}}</div>
                <div class="name">{{.Name}}</div>
                <div class="address">{{.Address}}</div>
              </div>
              {{if .Rating}}<div class="rating">★ {{.Rating}}</div>{{end}}
            </div>
            <div class="map">Открыть в картах ↗</div>
          </a>
        {{end}}
      </section>
    {{else}}
      <div class="empty">В этой подборке пока нет мест.</div>
    {{end}}

    <footer>Подборка создана в СПОТ — личной карте сохранённых мест.</footer>
  </main>
</body>
</html>`))

func registerPublicCollectionRoutes(mux *http.ServeMux, store library.Store) {
	mux.HandleFunc("GET /api/v1/public/collections/{id}", func(w http.ResponseWriter, r *http.Request) {
		shared, err := store.GetSharedCollection(r.Context(), r.PathValue("id"))
		if err != nil {
			writeLibraryError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, shared)
	})

	mux.HandleFunc("GET /s/{id}", func(w http.ResponseWriter, r *http.Request) {
		shared, err := store.GetSharedCollection(r.Context(), r.PathValue("id"))
		if err != nil {
			if err == library.ErrNotFound {
				http.Error(w, "Подборка не найдена или доступ закрыт.", http.StatusNotFound)
				return
			}
			http.Error(w, "Не удалось открыть подборку.", http.StatusInternalServerError)
			return
		}

		collectionID := shared.Collection.ID
		shareDescription := strings.TrimSpace(shared.Collection.Description)
		if shareDescription == "" {
			shareDescription = fmt.Sprintf("%d мест в общей подборке СПОТ", len(shared.Places))
		}

		view := publicCollectionView{
			Title:            shared.Collection.Title,
			Description:      shared.Collection.Description,
			ShareDescription: shareDescription,
			CityLabel:        shared.Collection.CityLabel,
			PlaceCount:       len(shared.Places),
			AppURL:           template.URL("spot://collection?id=" + url.QueryEscape(collectionID)),
			Places:           make([]publicPlaceView, 0, len(shared.Places)),
		}

		for _, place := range shared.Places {
			rating := ""
			if place.Rating > 0 {
				rating = fmt.Sprintf("%.1f", place.Rating)
			}
			view.Places = append(view.Places, publicPlaceView{
				Name:          place.Name,
				CategoryLabel: place.CategoryLabel,
				CityLabel:     place.CityLabel,
				Address:       place.Address,
				Rating:        rating,
				MapURL: fmt.Sprintf(
					"https://yandex.ru/maps/?pt=%.6f,%.6f&z=16&l=map",
					place.Longitude,
					place.Latitude,
				),
			})
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=60")
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		if err := publicCollectionTemplate.Execute(w, view); err != nil {
			if !strings.Contains(err.Error(), "broken pipe") {
				http.Error(w, "Не удалось отобразить подборку.", http.StatusInternalServerError)
			}
		}
	})
}
