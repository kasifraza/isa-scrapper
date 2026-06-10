# ISA Media Scraper

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js)](https://nodejs.org)
[![Playwright](https://img.shields.io/badge/Playwright-1.60+-45ba4b?logo=playwright)](https://playwright.dev)

Scrape all media assets (Press Releases, Media Coverage, Newsletters) from the [International Solar Alliance](https://old.isa.int/medias) media center — including **infinite-scroll lazy-loaded content** across all three tabs.

## Features

- **Full data extraction**: Scrapes all 3 tabs — Press Releases, Media Coverage, Newsletters
- **Infinite scroll handling**: Automatically scrolls and loads lazily fetched items until exhaustion
- **Streaming output**: Writes each item to JSON as it is scraped (no buffering)
- **Deduplication**: URL-based dedup prevents duplicates across scroll rounds
- **Analysis & grouping**: Built-in analyzer produces grouped JSON and summary reports
- **Unparseable date tracking**: 48 items have unparseable dates (rendered as `Jan 01, 1970` by the source site's JS) — logged transparently

## Quick Start

```bash
# Clone
git clone git@github.com:your-username/isa-scrapper.git
cd isa-scrapper

# Install
npm install

# Scrape
node scrape.cjs

# Analyze
node analyze.cjs
```

## Output Files

| File | Description |
|---|---|
| `isa_media_data.json` | Raw scraped data — all items with tab, title, url, date, imgSrc |
| `grouped_data.json` | Analyzed output — breakdowns by tab, year, month, domain, region |

## Data Shape

Each scraped item:

```json
{
  "tab": "Press Releases",
  "title": "International Solar Alliance to Convene Europe & Others Region Leaders...",
  "url": "https://old.isa.int/uploads/media_pdf/1780984495_Europe_RCM_2026...pdf",
  "date": "Jun 08, 2026",
  "imgSrc": "https://old.isa.int//uploads/media_image/1780984495_...gif"
}
```

## Dataset Summary

| Tab | Items | Date Range |
|---|---|---|
| **Press Releases** | 193 | Sep 2024 – Jun 2026 |
| **Media Coverage** | 218 | Apr 2023 – Sep 2025 |
| **Newsletters** | 40 | Jan 2022 – Mar 2026 |
| **Total** | **451** | 2014 – 2026 |

### Media Coverage: Top Sources

1. `old.isa.int` — 30 articles
2. `youtube.com` — 12 articles
3. `energy.economictimes.indiatimes.com` — 10 articles
4. `livemint.com` — 5 articles
5. `saurenergy.com` — 5 articles
6. `x.com` — 4 articles
7. `aninews.in` — 4 articles
8. `hindustantimes.com` — 4 articles
9. `business-standard.com` — 4 articles

### Coverage by Region

| Region | Mentions |
|---|---|
| India | 64 |
| Global News | 15 |
| France | 13 |
| Ghana | 8 |
| Bangladesh | 7 |
| Sri Lanka | 5 |
| Azerbaijan | 5 |
| Spain | 5 |

## Use Cases

- **Policy research**: Analyze ISA's messaging and media strategy over time
- **Media monitoring**: Track which outlets cover ISA and how coverage varies by region
- **Content archive**: Build a local searchable archive of all ISA press materials
- **Trend analysis**: Map press release frequency and media mentions by month/year
- **SEO / backlink analysis**: Identify high-value domains covering ISA for outreach
- **Institutional memory**: Preserve ISA's public communications for offline analysis

## Keyword Index

`isa`, `international solar alliance`, `solar energy`, `press release`, `media monitoring`, `news scraper`, `playwright scraper`, `infinite scroll`, `web scraping`, `solar policy`, `renewable energy`, `media coverage`, `newsletters`, `unfccc`, `climate change`, `solar alliance`, `energy transition`, `public relations archive`

## How It Works

1. **`scrape.cjs`** opens `https://old.isa.int/medias` in a headless Chromium browser via Playwright.
2. It clicks each of the 3 tabs, triggering the site's AJAX load via its `media_data()` function.
3. For Press Releases and Media Coverage tabs (which have infinite scroll), it scrolls to the bottom repeatedly, triggers `loadMoreJobs()`, and extracts new items as they appear.
4. Each item is **appended to `isa_media_data.json` immediately** — no batch collection.
5. **`analyze.cjs`** reads the raw data and produces grouped JSON + a console report.

### Date handling note

48 items show `Jan 01, 1970` — this is the source site rendering `Invalid Date` when its own `new Date(job.date)` call fails on certain legacy date formats. The scraper stores dates as rendered by the page; these unparseable dates are accurately captured.

## Scraping Logic

### Tab switching
The site uses a custom `media_data(tabName)` JavaScript function. The script finds and clicks the `<a>` elements whose `onclick` matches the target tab (`press_release`, `media_coverage`, `newsletter`).

### Infinite scroll
The scroll handler checks:
```javascript
if ($(window).scrollTop() + $(window).height() >= $(document).height() - 100) {
  // loads next batch based on active tab
}
```
The scraper scrolls `window.scrollBy(0, 1200)` every 2 seconds until 3 consecutive scrolls yield no new items.

## Dependencies

- [Playwright](https://playwright.dev) v1.60+ — browser automation
- Node.js 18+ (tested on 22)

## License

MIT — see [LICENSE](LICENSE).
