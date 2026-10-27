# Market search — how to switch on real web search

The Market is a **search**: you type anything disc golf and it returns what it
costs and which retailer sells it. There is no shop list in the app.

## The finding

Doing this over the open web needs a search API key. Every keyless route to a
search engine was tested from a server and none works:

| Route | Result |
|---|---|
| DuckDuckGo HTML endpoint | Blocks datacenter IPs outright |
| SearXNG public instances | JSON output disabled on all 12 tried |
| Bing HTML | Answers, but serves a server **junk** — "buy discraft buzzz" returned Best Buy, Zillow and a dictionary entry, and three different queries gave the identical ten links |
| Bing Shopping | Rendered in the browser; the HTML a server receives carries no prices |
| Google / Ecosia / Mojeek | Refuse without a key |

**Apple is not an option**: Apple does not sell a web-search API. Presenting
Spotlight suggestions as a product search would be dishonest.

## What is running now, with no key

A fallback that asks **16 disc golf storefronts** directly through the public
product-search endpoint their platform exposes. It returns live prices and
live stock — a search for "buzzz" gives ~75 products across 14 retailers — but
it can only ever find what those particular shops stock. The page says so
rather than implying it searched the web.

## To switch on real search

Set **one** of these in the Render dashboard (Environment → Add). No code
change, no deploy needed beyond a restart; the Market picks it up at boot.

| Variable | Service | What it gives | Free tier |
|---|---|---|---|
| `SERPAPI_KEY` | SerpApi, `google_shopping` engine | **Best fit.** Google Shopping results: title, price, the selling retailer and a thumbnail, straight from the search response. One request per search. | 250 searches/month; $25/mo for 1,000 |
| `GOOGLE_SEARCH_KEY` + `GOOGLE_SEARCH_CX` | Google Programmable Search | Web results; the app then reads each product page's own price markup | 100 queries/day |
| `BRAVE_SEARCH_KEY` | Brave Search API | Same shape as Google | ~$5 credit/month (~1,000 searches) |

Figures were read in October 2026 from third-party summaries — check the
provider's own pricing page before committing, and note Brave's terms forbid
storing results (which this app does not do anyway).

If more than one is set, the order of preference is SerpApi → Google → Brave,
and the storefront fallback always runs alongside, because it is the only
source that reports real stock.

## What is NOT verified

The three engine providers are covered by tests against fixtures, but **none
has been run against the real service**, because that needs a key. The first
real search after adding one should be eyeballed before trusting it.
