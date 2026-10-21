// Limits that protect the Worker (and the sites it scrapes) from abuse.
export const LIMITS = {
  // Abort the upstream request (including reading the body) after this long.
  fetchTimeoutMs: 10_000,
  // Rendering with a browser is slower.
  renderTimeoutMs: 30_000,
  // Maximum size of the upstream HTML document that will be parsed.
  maxBodyBytes: 5 * 1024 * 1024,
  maxRedirects: 5,
  maxUrlLength: 2048,
  maxSelectorLength: 1000,
  maxSelectors: 20,
  // Maximum number of fields in a structured extraction and urls in a batch.
  maxFields: 25,
  maxBatchUrls: 10,
  batchConcurrency: 3,
  maxRequestHeaders: 10,
  maxBodyJsonBytes: 65_536,
  // Maximum number of matches returned per selector.
  maxResults: 1000,
  // Maximum value of the `ttl` (cache) query param, in seconds.
  maxTtl: 86_400
}

export const USER_AGENT = 'Mozilla/5.0 (compatible; web-scraper/1.0; +https://web.scraper.workers.dev)'
