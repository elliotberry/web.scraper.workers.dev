import Scraper from './scraper.js'
import { LIMITS } from './config.js'
import { HttpError } from './errors.js'
import { extract } from './extract.js'
import { generateTextResponse } from './formats.js'
import { parseRequest } from './params.js'
import { normalizeURL, parseBool } from './request.js'
import { renderPage } from './render.js'
import { checkRateLimit, hasValidKey } from './ratelimit.js'
import { recordScrape } from './observability.js'
import { openAPISpec } from './openapi.js'
import { corsHeaders, generateJSONResponse, generateErrorJSONResponse } from './responses.js'

export default {
  fetch(request, env) {
    return handleRequest(request, env)
  }
}

const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'OPTIONS']

export async function handleRequest(request, env = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (!ALLOWED_METHODS.includes(request.method)) {
    return generateJSONResponse({ error: 'Method not allowed' }, false, {
      status: 405,
      headers: { allow: ALLOWED_METHODS.join(', ') }
    })
  }

  const requestURL = new URL(request.url)

  if (requestURL.pathname === '/openapi.json' && request.method !== 'POST') {
    return generateJSONResponse(openAPISpec(requestURL.origin), true, {
      headers: { 'cache-control': 'public, max-age=3600' }
    })
  }

  let spec

  try {
    spec = await parseRequest(request)
  } catch (error) {
    return generateErrorJSONResponse(error, parseBool(requestURL.searchParams.get('pretty')))
  }

  if (spec.isSite) {
    // Not an API request: serve the UI (and its assets) from ./public
    return env.ASSETS.fetch(request)
  }

  const keyed = await hasValidKey(request, env)

  if (spec.render && !keyed) {
    return generateErrorJSONResponse(new HttpError(403, 'Rendering requires a valid x-api-key header'), spec.pretty)
  }

  if (!keyed && !await checkRateLimit(request, env)) {
    return generateJSONResponse({ error: 'Too many requests, try again in a minute' }, spec.pretty, {
      status: 429,
      headers: { 'retry-after': '60', 'cache-control': 'no-store' }
    })
  }

  return handleAPIRequest(env, spec)
}

const cacheControl = spec => spec.ttl > 0 ? `public, max-age=${ spec.ttl }` : 'no-store'

async function handleAPIRequest(env, spec) {
  if (spec.urls.length > 1) return handleBatchRequest(env, spec)

  try {
    const { body, scraper } = await scrapeURL(env, spec, spec.urls[0])

    const headers = {
      'x-upstream-status': String(scraper.status),
      'x-upstream-url': scraper.url,
      'cache-control': cacheControl(spec)
    }

    if (spec.format !== 'json') {
      return generateTextResponse(body.result, spec.format, { headers })
    }

    return generateJSONResponse(body, spec.pretty, { headers })
  } catch (error) {
    return generateErrorJSONResponse(error, spec.pretty)
  }
}

// Several urls: each is scraped independently, so one failing does not fail
// the others. Results are in the order the urls were given.
async function handleBatchRequest(env, spec) {
  const results = new Array(spec.urls.length)
  let next = 0

  const worker = async () => {
    while (next < spec.urls.length) {
      const index = next++
      const url = spec.urls[index]

      try {
        results[index] = { url, ...(await scrapeURL(env, spec, url)).body }
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500
        const details = error instanceof HttpError ? error.details : {}
        results[index] = { url, error: error.message, status, ...details }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(LIMITS.batchConcurrency, spec.urls.length) }, worker))

  return generateJSONResponse({ results }, spec.pretty, {
    headers: { 'cache-control': cacheControl(spec) }
  })
}

// Fetches one url and runs the extraction. Returns the JSON body and the scraper.
async function scrapeURL(env, spec, rawURL) {
  const startedAt = Date.now()
  const log = { host: null, status: 200, upstreamStatus: null, error: null }

  try {
    const url = normalizeURL(rawURL)
    log.host = new URL(url).hostname

    const scraper = await new Scraper().fetch(url, {
      ttl: spec.ttl,
      headers: spec.headers,
      ...(spec.render ? { fetchPage: (pageURL, options) => renderPage(pageURL, { ...options, env }) } : {})
    })

    log.upstreamStatus = scraper.status

    const body = { result: await extract(scraper, spec) }

    // Upstream errors (404, 500, ...) are scraped like any other page, so
    // report them explicitly.
    if (scraper.status >= 400) body.upstreamStatus = scraper.status
    if (scraper.truncated) body.truncated = true

    if (spec.meta) {
      body.meta = { status: scraper.status, url: scraper.url, contentType: scraper.contentType }
    }

    return { body, scraper }
  } catch (error) {
    log.status = error instanceof HttpError ? error.status : 500
    log.error = error.message
    if (error instanceof HttpError) log.upstreamStatus = error.details.upstreamStatus ?? null

    throw error
  } finally {
    recordScrape(env, { ...log, durationMs: Date.now() - startedAt })
  }
}
