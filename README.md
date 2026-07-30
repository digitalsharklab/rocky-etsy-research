# 💎 R.O.C.K.Y. — Etsy Research

Asystent AI i narzędzie do researchu rynku Etsy dla twórców produktów cyfrowych
(printables, szablony, planery, wall art, e-booki).

## Funkcje

- **💬 Czat** — rozmowa z Claude (pełna historia konwersacji) o niszach, cenach,
  Etsy SEO i pomysłach na produkty.
- **🔍 Research** — analiza dowolnej niszy: aplikacja pobiera aktualne wyniki
  wyszukiwania z Etsy (scraping best-effort) i przekazuje je do Claude, który
  zwraca ustrukturyzowaną analizę (kondycja rynku, konkurencja, ceny, trendy,
  okazje, rekomendacja produktu, werdykt TAK/MOŻE/NIE). Gdy Etsy zablokuje
  pobieranie danych, analiza powstaje na bazie wiedzy modelu i jest **wyraźnie
  oznaczona** jako taka — aplikacja nigdy nie zmyśla danych.
- **📊 Dashboard** — historia i statystyki analiz (zapisywane lokalnie
  w przeglądarce, `localStorage`).

## Architektura

```
├── public/index.html   # frontend (SPA, vanilla JS, bez build stepu)
├── src/
│   ├── app.js          # aplikacja Express: routing, walidacja, rate limiting
│   ├── claude.js       # klient Claude API (oficjalny SDK @anthropic-ai/sdk)
│   └── etsy.js         # scraper wyników wyszukiwania Etsy (cheerio)
├── api/index.js        # entry point dla funkcji serverless Vercel
├── server.js           # lokalny serwer deweloperski (statyki + API)
└── vercel.json         # rewrite /api/* -> funkcja serverless
```

Ten sam kod Express obsługuje środowisko lokalne i Vercel — frontend zawsze
woła względne `/api/...`, więc nie ma żadnych zahardkodowanych adresów.

## API

| Metoda | Endpoint        | Opis |
|--------|-----------------|------|
| `GET`  | `/api/health`   | Status, model, czy klucz API jest skonfigurowany |
| `POST` | `/api/chat`     | `{ messages: [{role, content}, …] }` → `{ reply, model }` |
| `POST` | `/api/research` | `{ category }` → `{ analysis, products, dataSource, … }` |

`dataSource` w odpowiedzi researchu to `"live"` (dane z Etsy) albo
`"ai_knowledge"` (fallback, gdy scraping się nie powiódł).

## Uruchomienie lokalne

```bash
npm install
cp .env.example .env       # wpisz swój ANTHROPIC_API_KEY
node --env-file=.env server.js
# otwórz http://localhost:3000
```

(Node ≥ 20 wymagany; `--env-file` to wbudowana obsługa plików .env.)

## Deploy na Vercel

1. Podepnij repozytorium w panelu Vercel (framework preset: **Other**,
   bez build command).
2. W ustawieniach projektu dodaj zmienną środowiskową `ANTHROPIC_API_KEY`
   (opcjonalnie `CLAUDE_MODEL`, `ALLOWED_ORIGIN`, `RATE_LIMIT_PER_MINUTE`).
3. Deploy — statyki serwowane są z `public/`, API z `api/index.js`.

## Konfiguracja

| Zmienna | Domyślnie | Opis |
|---------|-----------|------|
| `ANTHROPIC_API_KEY` | — (wymagane) | Klucz API Anthropic |
| `CLAUDE_MODEL` | `claude-opus-5` | Model Claude (tańsza opcja: `claude-haiku-4-5`) |
| `PORT` | `3000` | Port lokalnego serwera |
| `ALLOWED_ORIGIN` | `*` | Ogranicz CORS do jednej domeny w produkcji |
| `RATE_LIMIT_PER_MINUTE` | `20` | Limit zapytań /api na minutę na IP |

## Znane ograniczenia

- **Scraping Etsy** jest best-effort — Etsy aktywnie blokuje ruch z serwerów
  (szczególnie z IP chmurowych). Aplikacja obsługuje to gracefully: research
  działa wtedy w trybie „wiedza AI" i jest tak oznaczony w UI.
- **Rate limiter** jest in-memory (na instancję) — wystarczający dla jednej
  funkcji serverless / jednego serwera; przy większej skali użyj np. Upstash.
- **Historia analiz** żyje w `localStorage` przeglądarki (brak backendu bazy
  danych — celowo, dla prostoty wdrożenia).

## Licencja

MIT
