import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleRequest } from '../src/index.js'
import { LIMITS } from '../src/config.js'

const page = '<html><body><h1>Hi</h1></body></html>'
const html = (body = page, init = {}) => new Response(body, { headers: { 'content-type': 'text/html' }, ...init })
const env = { ASSETS: { fetch: () => new Response('ui') } }

const get = (path, e = env, init) => handleRequest(new Request(`https://scraper.test${ path }`, init), e)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('upstream handling', () => {
  it('sends a descriptive user agent and does not auto-follow redirects', async () => {
    const fetchMock = vi.fn(async () => html())
    vi.stubGlobal('fetch', fetchMock)

    await get('/?url=example.com&selector=h1')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['user-agent']).toMatch(/web-scraper/)
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeDefined()
  })

  it('reports upstream error statuses explicitly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html('<h1>Not found</h1>', { status: 404 })))
    const response = await get('/?url=example.com&selector=h1')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-upstream-status')).toBe('404')
    expect(await response.json()).toEqual({ result: { h1: ['Not found'] }, upstreamStatus: 404 })
  })

  it('follows redirects and exposes the final url', async () => {
    const fetchMock = vi.fn(async url => {
      if (url === 'http://example.com/') {
        return new Response(null, { status: 301, headers: { location: 'https://www.example.com/home' } })
      }
      return html()
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await get('/?url=example.com&selector=h1')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(response.headers.get('x-upstream-url')).toBe('https://www.example.com/home')
    expect((await response.json()).result.h1).toEqual(['Hi'])
  })

  it('refuses redirects to private hosts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' }
    })))

    const response = await get('/?url=example.com&selector=h1')
    expect(response.status).toBe(502)
    expect((await response.json()).error).toMatch(/Refusing to follow redirect/)
  })

  it('gives up after too many redirects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'https://example.com/again' }
    })))

    const response = await get('/?url=example.com&selector=h1')
    expect(response.status).toBe(502)
    expect((await response.json()).error).toMatch(/Too many redirects/)
  })

  it('returns 504 when the request times out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('The operation timed out', 'TimeoutError')
    }))

    const response = await get('/?url=example.com&selector=h1')
    expect(response.status).toBe(504)
  })

  it('rejects non-HTML content types with 415', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })))

    const response = await get('/?url=example.com&selector=h1')
    expect(response.status).toBe(415)
  })

  it('rejects bodies larger than the limit (content-length)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html(page, {
      headers: { 'content-type': 'text/html', 'content-length': String(LIMITS.maxBodyBytes + 1) }
    })))

    const response = await get('/?url=example.com&selector=h1')
    expect(response.status).toBe(413)
  })

  it('rejects bodies larger than the limit while streaming', async () => {
    const big = '<html><body>' + 'a'.repeat(LIMITS.maxBodyBytes + 10) + '</body></html>'
    vi.stubGlobal('fetch', vi.fn(async () => html(big)))

    const response = await get('/?url=example.com&selector=h1')
    expect(response.status).toBe(413)
  })

  it('caps the number of results and flags truncation', async () => {
    const items = Array.from({ length: LIMITS.maxResults + 5 }, (_, i) => `<li>${ i }</li>`).join('')
    vi.stubGlobal('fetch', vi.fn(async () => html(`<ul>${ items }</ul>`)))

    const body = await (await get('/?url=example.com&selector=li')).json()
    expect(body.result.li).toHaveLength(LIMITS.maxResults)
    expect(body.truncated).toBe(true)
  })
})

describe('request validation', () => {
  it('rejects private hosts before fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await get('/?url=http://127.0.0.1:8787&selector=h1')
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects overly long and too many selectors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html()))

    const long = await get('/?url=example.com&selector=' + 'a'.repeat(LIMITS.maxSelectorLength + 1))
    expect(long.status).toBe(400)

    const many = Array.from({ length: LIMITS.maxSelectors + 1 }, (_, i) => `.c${ i }`).join(',')
    const response = await get('/?url=example.com&selector=' + encodeURIComponent(many))
    expect(response.status).toBe(400)
  })
})

describe('caching', () => {
  it('passes ttl to the upstream cache and sets Cache-Control', async () => {
    const fetchMock = vi.fn(async () => html())
    vi.stubGlobal('fetch', fetchMock)

    const response = await get('/?url=example.com&selector=h1&ttl=300')

    expect(fetchMock.mock.calls[0][1].cf).toEqual({ cacheTtl: 300, cacheEverything: true })
    expect(response.headers.get('cache-control')).toBe('public, max-age=300')
  })

  it('does not cache by default, clamps ttl and never caches errors', async () => {
    const fetchMock = vi.fn(async () => html())
    vi.stubGlobal('fetch', fetchMock)

    const response = await get('/?url=example.com&selector=h1')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fetchMock.mock.calls[0][1].cf).toBeUndefined()

    await get('/?url=example.com&selector=h1&ttl=99999999')
    expect(fetchMock.mock.calls[1][1].cf.cacheTtl).toBe(LIMITS.maxTtl)

    const error = await get('/?url=ftp://example.com&selector=h1&ttl=60')
    expect(error.headers.get('cache-control')).toBe('no-store')
  })
})

describe('rate limiting', () => {
  const limited = success => ({ ...env, RATE_LIMITER: { limit: vi.fn(async () => ({ success })) } })

  it('returns 429 when the limit is exceeded', async () => {
    const e = limited(false)
    const response = await get('/?url=example.com&selector=h1', e, { headers: { 'cf-connecting-ip': '1.2.3.4' } })

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(e.RATE_LIMITER.limit).toHaveBeenCalledWith({ key: '1.2.3.4' })
  })

  it('does not rate limit the UI', async () => {
    const e = limited(false)
    expect(await (await get('/', e)).text()).toBe('ui')
    expect(e.RATE_LIMITER.limit).not.toHaveBeenCalled()
  })

  it('lets requests with a valid API key through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html()))
    const e = { ...limited(false), API_KEY: 'secret' }

    const ok = await get('/?url=example.com&selector=h1', e, { headers: { 'x-api-key': 'secret' } })
    expect(ok.status).toBe(200)

    const wrong = await get('/?url=example.com&selector=h1', e, { headers: { 'x-api-key': 'nope' } })
    expect(wrong.status).toBe(429)
  })
})

describe('observability', () => {
  it('logs a structured entry and writes an analytics data point', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => html()))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const writeDataPoint = vi.fn()

    await get('/?url=example.com&selector=h1', { ...env, ANALYTICS: { writeDataPoint } })

    const entry = JSON.parse(log.mock.calls[0][0])
    expect(entry).toMatchObject({ event: 'scrape', host: 'example.com', status: 200, upstreamStatus: 200 })
    expect(writeDataPoint).toHaveBeenCalledOnce()
  })
})
