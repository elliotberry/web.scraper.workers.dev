import { LIMITS } from './config.js'
import { PRESETS } from './presets.js'

const param = (name, description, schema, extra = {}) => ({ name, in: 'query', description, schema, ...extra })

const queryParameters = [
  param('url', 'The page to scrape. `http://` is prepended when there is no protocol. Repeat the parameter to scrape several pages (at most ' + LIMITS.maxBatchUrls + ').', { type: 'string' }, { required: true }),
  param('selector', 'A CSS selector, or a comma separated list of selectors, supported by Cloudflare HTMLRewriter. Required unless `preset` is set.', { type: 'string', maxLength: LIMITS.maxSelectorLength }),
  param('attr', 'Scrape these (comma separated) attributes instead of text.', { type: 'string' }),
  param('all', 'With `attr`: return the values of every matched node instead of the first one.', { type: 'boolean', default: false }),
  param('content', 'What to extract from matched nodes.', { type: 'string', enum: ['text', 'innerHTML', 'outerHTML'], default: 'text' }),
  param('spaced', 'Add a space between the text of child nodes.', { type: 'boolean', default: false }),
  param('trim', 'Trim and collapse whitespace.', { type: 'boolean', default: true }),
  param('limit', 'Maximum number of matches (per selector).', { type: 'integer', minimum: 1, maximum: LIMITS.maxResults }),
  param('contains', 'Only keep matches containing this text (case insensitive).', { type: 'string' }),
  param('absolute', 'Resolve `href`, `src` and other URL attributes against the page URL.', { type: 'boolean', default: false }),
  param('preset', 'A ready-made extraction that needs no selector.', { type: 'string', enum: PRESETS }),
  param('format', 'The response format. `text` and `csv` are not available with several urls.', { type: 'string', enum: ['json', 'text', 'csv'], default: 'json' }),
  param('meta', 'Include `meta` (final url, status and content type of the page) in the response.', { type: 'boolean', default: false }),
  param('pretty', 'Format the JSON output.', { type: 'boolean', default: false }),
  param('ttl', 'Seconds the page may be cached.', { type: 'integer', minimum: 0, maximum: LIMITS.maxTtl, default: 0 }),
  param('userAgent', 'The User-Agent header to send to the page.', { type: 'string' }),
  param('lang', 'The Accept-Language header to send to the page.', { type: 'string' }),
  param('header', 'An extra request header, as `Name: value`. Can be repeated.', { type: 'array', items: { type: 'string' } }, { style: 'form', explode: true }),
  param('render', 'Render the page in a browser first (needs an `x-api-key` and a configured deployment).', { type: 'boolean', default: false })
]

const errorResponse = description => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
})

const scrapeResponses = {
  200: {
    description: 'The scraped data.',
    headers: {
      'X-Upstream-Status': { description: 'The HTTP status of the scraped page.', schema: { type: 'integer' } },
      'X-Upstream-URL': { description: 'The final URL of the scraped page, after redirects.', schema: { type: 'string' } }
    },
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/Result' } },
      'text/plain': { schema: { type: 'string' } },
      'text/csv': { schema: { type: 'string' } }
    }
  },
  400: errorResponse('Invalid url, selector or other parameter.'),
  403: errorResponse('`render` was requested without a valid API key.'),
  413: errorResponse('The page (or request body) is too large.'),
  415: errorResponse('The page is not HTML or XML (or the request body is not JSON).'),
  429: errorResponse('Rate limit exceeded.'),
  501: errorResponse('Rendering is not configured.'),
  502: errorResponse('The page could not be reached or read.'),
  504: errorResponse('The page did not respond in time.')
}

export function openAPISpec(origin) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Web Scraper',
      version: '1.0.0',
      description: 'Scrape websites with CSS selectors, powered by Cloudflare Workers HTMLRewriter.',
      license: { name: 'MIT' }
    },
    servers: [{ url: origin }],
    paths: {
      '/': {
        get: {
          summary: 'Scrape one or more pages',
          operationId: 'scrape',
          parameters: queryParameters,
          responses: scrapeResponses
        },
        post: {
          summary: 'Scrape with a JSON body, including structured extraction',
          description: 'Accepts the same options as the query parameters of GET (`url` or `urls`, `selector`, `attr`, ...) and additionally `fields`: an object of named selectors (a selector string, or an object with `selector`, `attr`, `all`, `content`, `limit`, `contains`, ...). Every page is fetched once and all fields are extracted from it.',
          operationId: 'scrapeJSON',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ScrapeRequest' } } }
          },
          responses: scrapeResponses
        }
      }
    },
    components: {
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
            upstreamStatus: { type: 'integer' }
          }
        },
        Result: {
          type: 'object',
          description: 'For one url: `result`. For several urls: `results`, one entry per url, each with either `result` or `error` and `status`.',
          properties: {
            result: {
              description: 'Text and HTML extractions: an object keyed by selector with arrays of strings. `attr`: a string, an array or an object. `fields`: an object keyed by field name. `preset`: structured data.'
            },
            upstreamStatus: { type: 'integer', description: 'Present when the page responded with an HTTP error (400 or higher).' },
            truncated: { type: 'boolean', description: 'Present when results were cut off at ' + LIMITS.maxResults + ' matches.' },
            meta: {
              type: 'object',
              properties: {
                status: { type: 'integer' },
                url: { type: 'string' },
                contentType: { type: 'string' }
              }
            },
            results: { type: 'array', items: { type: 'object' } }
          }
        },
        ScrapeRequest: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            urls: { type: 'array', items: { type: 'string' }, maxItems: LIMITS.maxBatchUrls },
            selector: { type: 'string' },
            fields: {
              type: 'object',
              maxProperties: LIMITS.maxFields,
              additionalProperties: {
                oneOf: [{ type: 'string' }, { type: 'object' }]
              }
            },
            headers: { type: 'object', additionalProperties: { type: 'string' } }
          },
          additionalProperties: true
        }
      }
    }
  }
}
