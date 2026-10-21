# Web Scraper

Web Scraper makes it effortless to scrape websites. You provide a URL and CSS selector and it will return you JSON containing the text contents of the matching elements. You can also scrape HTML attribute values by optionally specifying an attribute name.

[Website →](https://web.scraper.workers.dev)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/adamschwartz/web.scraper.workers.dev)

## Examples

### Heading from example.com

[web.scraper.workers.dev/?url=example.com&selector=h1](https://web.scraper.workers.dev/?url=example.com&selector=h1)

```JSON
{"result":{"h1":["Example Domain"]}}
```

### Profile details from github.com profile page

[web.scraper.workers.dev/?url=github.com/adamschwartz&selector=.vcard-fullname,.d-md-block+[itemprop=worksFor],.d-md-block+[itemprop=homeLocation]&pretty=true](https://web.scraper.workers.dev/?url=https://github.com/adamschwartz&selector=.vcard-fullname,.d-md-block+[itemprop=worksFor],.d-md-block+[itemprop=homeLocation]&pretty=true)

```JSON
{
  "result": {
    ".vcard-fullname": [
      "Adam Schwartz"
    ],
    ".d-md-block [itemprop=worksFor]": [
      "@cloudflare"
    ],
    ".d-md-block [itemprop=homeLocation]": [
      "Boston, MA"
    ]
  }
}
```

### Random quote/author from quotes.net

[web.scraper.workers.dev/?url=quotes.net/random.php&selector=%23disp-quote-body,.author&pretty=true](https://web.scraper.workers.dev/?url=quotes.net/random.php&selector=%23disp-quote-body,.author&pretty=true)

```JSON
{
  "result": {
    "#disp-quote-body": [
      "We are advertis'd by our loving friends."
    ],
    ".author": [
      "William Shakespeare"
    ]
  }
}
```

## API

  - Requests are made as `GET` (query parameters) or `POST` (a JSON body) against `https://web.scraper.workers.dev`.
  - There are <strong>two required</strong> parameters, `url` and `selector` (or a `preset`, or `fields` in a `POST`).
  - Everything else is optional: `attr`, `all`, `content`, `spaced`, `trim`, `limit`, `contains`, `absolute`, `preset`, `format`, `meta`, `pretty`, `ttl`, `userAgent`, `lang`, `header` and `render`.
  - An [OpenAPI](https://spec.openapis.org/oas/latest.html) description is available at [`/openapi.json`](https://web.scraper.workers.dev/openapi.json).

<pre><code>https://web.scraper.workers.dev
  ?<strong>url</strong>=https://example.com
  &<strong>selector</strong>=p
  &<strong>attr</strong>=title
  &<strong>pretty</strong>=true
  &<strong>spaced</strong>=true
  &<strong>ttl</strong>=300</code></pre>

### How it works

If at least `url` and `selector` are set, the response value will always be JSON.

When scraping text, `result` is an object keyed by each selector in the (comma separated) `selector` list. Each value is an array of strings, one per matched node. A selector with no matches has an empty array.

If an `attr` is provided, `result` is a string matching only the first node found which has a non-empty value for that HTML attribute (or an empty string if there is none). See [`attr`](#attr-optional) for scraping several attributes or every match.

With `content=innerHTML` or `content=outerHTML` the result has the same shape as text results, but with HTML strings.

With a `preset`, `result` is structured data (see [`preset`](#preset-optional)).

If `meta=true`, the response also includes `"meta": {"status", "url", "contentType"}` describing the scraped page.

### Errors

Errors are returned as JSON in the shape `{"error": "message"}` with a matching HTTP status code:

| Status | Meaning |
| ------ | ------- |
| `400`  | Invalid `url` (unsupported protocol, credentials, or a private/internal host), or an invalid or too long `selector`. |
| `403`  | `render=true` without a valid API key. |
| `405`  | Method other than `GET`, `HEAD`, `POST` or `OPTIONS`. |
| `413`  | The target page is larger than 5 MB (or a `POST` body is larger than 64 KB). |
| `415`  | The target is not an HTML/XML document (or a `POST` body is not JSON). |
| `429`  | Rate limit exceeded (see below). |
| `501`  | `render=true` on a deployment without Browser Rendering configured. |
| `502`  | The target site could not be reached or read, or redirected somewhere that is not allowed. |
| `504`  | The target site did not respond within 10 seconds. |

Errors are never cached. HTTP errors from the *target* site (for example a `404` page) are scraped like any other page; the status is reported in an `upstreamStatus` field in the JSON (only when it is `400` or higher) and in the `X-Upstream-Status` response header. The final URL, after following redirects, is in the `X-Upstream-URL` header.

`OPTIONS` requests are answered with CORS headers so the API can be called from browsers.

### Query params

#### `url` (required)

  - Supports `https://` and `http://` protocols.
  - If a protocol isn’t found, `http://` is prepended.
    - e.g. `https://web.scraper.workers.dev/?url=example.com&selector=p`
  - Repeat the parameter to scrape up to 10 pages in one request, see [Several URLs](#several-urls).

#### `selector` (required, unless using a `preset` or `fields`)

  - Supports the same set of CSS selectors as Cloudflare Workers' [`HTMLRewriter` class](https://developers.cloudflare.com/workers/reference/apis/html-rewriter/#selectors)
    - This includes:
      - `*` – any element
      - `E` – any element of type E
      - `E:not(s)` – an E element that does not match either compound selector s
      - `E.warning` – an E element belonging to the class warning
      - `E#myid` – an E element with ID equal to myid.
      - `E[foo]` – an E element with a foo attribute
      - `E[foo="bar"]` – an E element whose foo attribute value is exactly equal to bar
      - `E[foo="bar" i]` – an E element whose foo attribute value is exactly equal to any (ASCII-range) case-permutation of bar
      - `E[foo="bar" s]` – an E element whose foo attribute value is exactly and case-sensitively equal to bar
      - `E[foo~="bar"]` – an E element whose foo attribute value is a list of whitespace-separated values, one of which is exactly equal to bar
      - `E[foo^="bar"]` – an E element whose foo attribute value begins exactly with the string bar
      - `E[foo$="bar"]` – an E element whose foo attribute value ends exactly with the string bar
      - `E[foo*="bar"]` – an E element whose foo attribute value contains the substring bar
      - `E[foo|="en"]` – an E element whose foo attribute value is a hyphen-separated list of values beginning with en
      - `E F` – an F element descendant of an E element
      - `E > F` – an F element child of an E element
  - Supports multiple selectors delimited with a comma. Commas inside parentheses, attribute brackets or quotes (e.g. `a:not(.x, .y)`) are not treated as delimiters.

#### `attr` (optional)

  - When `attr` is not set, the text contents of all matched nodes are returned.
  - When `attr` is set, that HTML attribute is scraped from the first matching node with a non-empty value for that attribute.
  - Use a comma separated list to scrape several attributes (`attr=href,title`). The result is then an object with the first non-empty value of each attribute.
  - Add `all=true` to scrape every matching node instead of only the first: a single attribute gives an array of values, several attributes give an array of objects (one per node).
  - Add `absolute=true` to resolve URL attributes (`href`, `src`, `action`, ...) against the URL of the page.

#### `content` (optional)

  - `text` (the default), `innerHTML` or `outerHTML`.
  - HTML is rebuilt from the parser events, so it is normalized (for example attributes are always double quoted), and elements that are closed implicitly (such as a `<p>` or `<li>` without an end tag) are not closed in the output.

#### `trim`, `limit` and `contains` (optional)

  - `trim` (default `true`) collapses whitespace in text results and trims HTML results. Use `trim=false` to get the text exactly as it is in the page.
  - `limit` is the maximum number of matches returned per selector.
  - `contains` only keeps matches that contain the given text (case insensitive). `HTMLRewriter` has no XPath or `:contains()` support, so this is applied after matching.

#### `preset` (optional)

  - A ready-made extraction that doesn’t need a `selector`:
    - `links` – `[{"text", "href"}]` for every `a[href]`, with absolute URLs.
    - `images` – `[{"src", "alt"}]` for every `img[src]`, with absolute URLs.
    - `headings` – `[{"level", "text"}]` for `h1`–`h6`, in document order.
    - `meta` – `{"title", "lang", "canonical", "description", "og": {}, "twitter": {}, "other": {}}`.

#### `format` (optional)

  - `json` (the default), `csv` or `text`.
  - `csv` returns a header row and a row per match (several selectors or fields become columns), and neutralizes values that a spreadsheet could interpret as formulas.
  - `text` returns one line per match (columns separated by tabs).
  - Errors are always JSON. `csv` and `text` are not available when scraping several URLs.

#### `meta` (optional)

  - When `true`, `meta` (the status, final URL and content type of the page) is added to the JSON.

#### `userAgent`, `lang` and `header` (optional)

  - `userAgent` and `lang` set the `User-Agent` and `Accept-Language` headers sent to the page.
  - `header` can be repeated to send other headers, as `Name: value` (at most 10). Headers that describe the connection or the client (`Host`, `Content-Length`, `Forwarded`, `X-Forwarded-*`, `CF-*`, `Sec-*`, ...) are rejected.

#### `render` (optional)

  - When `true`, the page is first rendered in a browser with [Cloudflare Browser Rendering](https://developers.cloudflare.com/browser-rendering/), so content created by JavaScript can be scraped.
  - It is slower and costs money, so it needs an `x-api-key` header with the deployment’s `API_KEY`, and the `CF_ACCOUNT_ID` and `BROWSER_RENDERING_TOKEN` secrets (an API token with the Browser Rendering permission) must be configured. Without them the API responds with `403` or `501`.

#### `pretty` (optional)

  - When `false` (or `0`, `no`, `off`) or not included, JSON is minified.
  - When `true` (or any other value, including a bare `?pretty`), JSON is formatted using `JSON.stringify(json, null, 2)`.

#### `ttl` (optional)

  - Number of seconds (maximum `86400`) the fetched page may be cached by Cloudflare, and the `max-age` of the response. Defaults to `0`: nothing is cached and the response is sent with `Cache-Control: no-store`.

#### `spaced` (optional)

  - When `false` (or `0`, `no`, `off`) or not included, the text nodes of children of the nodes matching `selector` will be concatenated raw.
  - When `true`, a single space character is added after the end tag of each child node found.

##### Examples

Consider the following DOM structure:

```html
<div><p>This is the first paragraph.</p><p>This is another paragraph.</p></div>
```

If the `selector` is set to match `div`, by default the resulting text will be:

```This is the first paragraph.This is another paragraph.```

This is because there is no space character between `</p>` and `<p>`.

With `spaced` set to `true`, the result is:

```This is the first paragraph. This is another paragraph.```

### Structured extraction (`POST`)

Send a JSON body to extract several named fields from one fetch of the page. Every query parameter is also a key of the body (`url` or `urls`, `selector`, `attr`, `format`, ...), `headers` is an object, and `fields` maps names to a selector or to an object with `selector` and the per-selector options (`attr`, `all`, `content`, `limit`, `contains`, `spaced`, `trim`, `absolute`).

```shell
curl -s https://web.scraper.workers.dev \
  -H 'content-type: application/json' \
  -d '{
    "url": "https://news.ycombinator.com",
    "fields": {
      "title": "title",
      "stories": { "selector": ".titleline > a", "limit": 3 },
      "links": { "selector": ".titleline > a", "attr": "href", "all": true, "absolute": true, "limit": 3 }
    }
  }'
```

```JSON
{"result":{"title":["Hacker News"],"stories":["…","…","…"],"links":["…","…","…"]}}
```

A field’s result is an array of strings for text and HTML, and a string, array or object for attributes (as for `attr`).

### Several URLs

Repeat `url` (or send `urls` in a `POST`) to scrape up to 10 pages with the same options. Pages are scraped independently, three at a time, and the response lists them in order. A page that fails has an `error` and `status` instead of a `result`:

```JSON
{"results":[
  {"url":"example.com","result":{"h1":["Example Domain"]}},
  {"url":"http://127.0.0.1","error":"Private and loopback addresses are not allowed","status":400}
]}
```

### Limits and fair use

  - At most 5 redirects are followed, and every redirect target is checked like the original `url`.
  - Only public `http(s)` hosts are allowed: localhost, private/internal addresses and hostnames, and URLs with credentials are rejected.
  - The target must respond within 10 seconds, be at most 5 MB and be HTML/XML.
  - Selectors may be at most 1000 characters and 20 comma separated selectors long. At most 1000 matches are returned per selector (`"truncated": true` is added to the response when more were found).
  - At most 25 fields and 10 URLs per request, and `POST` bodies are limited to 64 KB.
  - Requests are rate limited per client IP (120 per minute). The operator can set an `API_KEY` secret; requests sending it in an `x-api-key` header are not rate limited.
  - Requests identify as `web-scraper` in the `User-Agent` header.

## Development

Web Scraper is powered by [Cloudflare Workers](https://workers.cloudflare.com), heavily utilizing [HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/) for parsing the HTML and scraping the text.

Project layout:

  - `src/` – the Worker (`index.js` is the entry point, `scraper.js` wraps `HTMLRewriter`).
  - `public/` – the web UI, served with [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/).
  - `test/` – tests, run inside the Workers runtime with [Vitest](https://vitest.dev) and the [Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/).

To develop Web Scraper locally, pull down the repo (Node.js 20 or newer is required), and follow these steps:

```shell
npm install
npm run dev     # starts wrangler dev at http://localhost:8787
npm test        # runs the test suite
npm run lint    # runs ESLint
```

## Deploying

Web Scraper is deployed automatically when changes are pushed to master using a [GitHub Action](https://github.com/features/actions) and [Wrangler](https://developers.cloudflare.com/workers/wrangler/). The workflow needs the `CF_API_TOKEN` and `CF_ACCOUNT_ID` repository secrets. To deploy manually, run `npm run deploy`.

Optional configuration (see `wrangler.toml`): the `RATE_LIMITER` binding and `API_KEY` secret described above, and an `ANALYTICS` [Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) binding that records the host, status and duration of every scrape. Every API request is also logged as JSON (`event: "scrape"`), which is available in Workers Logs.

## Author

Web Scraper was created by [Adam Schwartz](https://adamschwartz.co).
