import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleRequest } from '../src/index.js'
import { LIMITS } from '../src/config.js'
import { toCSV, toPlainText } from '../src/formats.js'

const page = `<!doctype html>
<html lang="en"><head>
  <title> Test  Page </title>
  <meta name="description" content="A test page">
  <meta property="og:title" content="OG Title">
  <meta name="twitter:card" content="summary">
  <meta name="robots" content="noindex">
  <link rel="canonical" href="/canonical">
</head><body>
  <h1>Main <em>Title</em></h1>
  <h2>Sub</h2>
  <div class="card" id="a"><p>Alpha <b>bold</b></p><img src="/img/a.png" alt="A"><br></div>
  <div class="card" id="b" data-x="2"><p>Beta &amp; more</p></div>
  <ul><li><a href="/one" title="First">One</a></li><li><a href="https://other.test/two" title="Second">Two</a></li><li><a href="three">Three</a></li></ul>
</body></html>`

const html = (body = page, init = {}) => new Response(body, { headers: { 'content-type': 'text/html' }, ...init })
const env = { ASSETS: { fetch: () => new Response('ui') } }

const stub = (response = () => html()) => {
  const fetchMock = vi.fn(async () => response())
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const get = (path, e = env, init) => handleRequest(new Request(`https://scraper.test${ path }`, init), e)
const q = params => '/?' + new URLSearchParams({ url: 'https://example.com/dir/page', ...params }).toString()
const json = async (path, e) => (await get(path, e)).json()

const post = (body, e = env, headers = {}) => handleRequest(new Request('https://scraper.test/', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body)
}), e)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('attributes', () => {
  it('returns the first non-empty value by default', async () => {
    stub()
    expect(await json(q({ selector: 'a', attr: 'title' }))).toEqual({ result: 'First' })
  })

  it('returns every value with all=true', async () => {
    stub()
    expect((await json(q({ selector: 'a', attr: 'title', all: 'true' }))).result).toEqual(['First', 'Second'])
  })

  it('supports several attributes', async () => {
    stub()
    expect((await json(q({ selector: 'a', attr: 'href,title' }))).result).toEqual({ href: '/one', title: 'First' })

    stub()
    expect((await json(q({ selector: 'a', attr: 'href,title', all: 'true' }))).result).toEqual([
      { href: '/one', title: 'First' },
      { href: 'https://other.test/two', title: 'Second' },
      { href: 'three', title: '' }
    ])
  })

  it('resolves urls with absolute=true', async () => {
    stub()
    const { result } = await json(q({ selector: 'a', attr: 'href', all: 'true', absolute: 'true' }))
    expect(result).toEqual(['https://example.com/one', 'https://other.test/two', 'https://example.com/dir/three'])
  })

  it('supports limit and contains', async () => {
    stub()
    expect((await json(q({ selector: 'a', attr: 'href', all: 'true', limit: '2' }))).result).toHaveLength(2)

    stub()
    expect((await json(q({ selector: 'a', attr: 'href', all: 'true', contains: 'OTHER' }))).result).toEqual(['https://other.test/two'])
  })

  it('rejects invalid attribute names', async () => {
    stub()
    expect((await get(q({ selector: 'a', attr: 'a"b' }))).status).toBe(400)
  })
})

describe('content modes', () => {
  it('returns innerHTML and outerHTML', async () => {
    stub()
    expect((await json(q({ selector: '#a', content: 'innerHTML' }))).result['#a']).toEqual([
      '<p>Alpha <b>bold</b></p><img src="/img/a.png" alt="A"><br>'
    ])

    stub()
    expect((await json(q({ selector: '#b', content: 'outerHTML' }))).result['#b']).toEqual([
      '<div class="card" id="b" data-x="2"><p>Beta &amp; more</p></div>'
    ])
  })

  it('handles nested matches in document order', async () => {
    stub(() => html('<div id="o"><div id="i">x</div>y</div>'))
    const { result } = await json(q({ selector: 'div', content: 'outerHTML' }))
    expect(result.div).toEqual(['<div id="o"><div id="i">x</div>y</div>', '<div id="i">x</div>'])
  })

  it('supports trim=false, limit and contains for text', async () => {
    stub()
    expect((await json(q({ selector: '.card', limit: '1' }))).result['.card']).toHaveLength(1)

    stub()
    expect((await json(q({ selector: '.card', contains: 'beta' }))).result['.card']).toEqual(['Beta &amp; more'])

    stub(() => html('<p>  spaced   out  </p>'))
    expect((await json(q({ selector: 'p', trim: 'false' }))).result.p).toEqual(['  spaced   out  '])
  })

  it('rejects unknown content modes', async () => {
    stub()
    expect((await get(q({ selector: 'p', content: 'nope' }))).status).toBe(400)
  })
})

describe('presets', () => {
  it('links', async () => {
    stub()
    const { result } = await json(q({ preset: 'links' }))
    expect(result).toEqual([
      { text: 'One', href: 'https://example.com/one' },
      { text: 'Two', href: 'https://other.test/two' },
      { text: 'Three', href: 'https://example.com/dir/three' }
    ])
  })

  it('images and headings', async () => {
    stub()
    expect((await json(q({ preset: 'images' }))).result).toEqual([{ src: 'https://example.com/img/a.png', alt: 'A' }])

    stub()
    expect((await json(q({ preset: 'headings' }))).result).toEqual([
      { level: 1, text: 'Main Title' },
      { level: 2, text: 'Sub' }
    ])
  })

  it('meta', async () => {
    stub()
    expect((await json(q({ preset: 'meta' }))).result).toEqual({
      title: 'Test Page',
      lang: 'en',
      canonical: 'https://example.com/canonical',
      description: 'A test page',
      og: { title: 'OG Title' },
      twitter: { card: 'summary' },
      other: { robots: 'noindex' }
    })
  })

  it('rejects unknown presets', async () => {
    expect((await get(q({ preset: 'nope' }))).status).toBe(400)
  })
})

describe('formats', () => {
  it('returns plain text and csv', async () => {
    stub()
    const text = await get(q({ selector: 'a', attr: 'title', all: 'true', format: 'text' }))
    expect(text.headers.get('content-type')).toContain('text/plain')
    expect(await text.text()).toBe('First\nSecond\n')

    stub()
    const csv = await get(q({ preset: 'links', format: 'csv' }))
    expect(csv.headers.get('content-type')).toContain('text/csv')
    expect(await csv.text()).toBe('text,href\r\nOne,https://example.com/one\r\nTwo,https://other.test/two\r\nThree,https://example.com/dir/three\r\n')
  })

  it('rejects unknown formats', async () => {
    expect((await get(q({ selector: 'p', format: 'xml' }))).status).toBe(400)
  })

  it('escapes csv cells and guards against formula injection', () => {
    expect(toCSV(['a,b', 'say "hi"', '=SUM(A1)', '-5', 'x\ny'])).toBe('value\r\n"a,b"\r\n"say ""hi"""\r\n\'=SUM(A1)\r\n-5\r\n"x\ny"\r\n')
  })

  it('zips keyed results into columns', () => {
    expect(toCSV({ a: ['1', '2'], b: ['x'] })).toBe('a,b\r\n1,x\r\n2,\r\n')
    expect(toPlainText({ a: ['1', '2'], b: ['x'] })).toBe('1\tx\n2\t\n')
  })

  it('adds page metadata with meta=true', async () => {
    stub()
    const body = await json(q({ selector: 'h1', meta: 'true' }))
    expect(body.meta).toEqual({ status: 200, url: 'https://example.com/dir/page', contentType: 'text/html' })
  })
})

describe('request options', () => {
  it('sends custom headers, user agent and language', async () => {
    const fetchMock = stub()
    const params = new URLSearchParams({ url: 'example.com', selector: 'h1', userAgent: 'MyBot/1', lang: 'fr' })
    params.append('header', 'X-Token: abc')
    params.append('header', 'Referer: https://ref.test/')

    await get('/?' + params)

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'user-agent': 'MyBot/1',
      'accept-language': 'fr',
      'x-token': 'abc',
      referer: 'https://ref.test/'
    })
  })

  it('rejects forbidden headers', async () => {
    stub()
    for (const header of ['Host: evil.test', 'cf-connecting-ip: 1.1.1.1', 'X-Forwarded-For: 1.1.1.1', 'bad name: x']) {
      const params = new URLSearchParams({ url: 'example.com', selector: 'h1' })
      params.append('header', header)
      expect((await get('/?' + params)).status).toBe(400)
    }
  })
})

describe('structured extraction (POST)', () => {
  it('extracts named fields from one fetch', async () => {
    const fetchMock = stub()

    const response = await post({
      url: 'https://example.com/dir/page',
      fields: {
        title: 'h1',
        cards: { selector: '.card', limit: 1 },
        links: { selector: 'a', attr: 'href', all: true, absolute: true },
        first: { selector: 'a', attr: 'title' }
      }
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      result: {
        title: ['Main Title'],
        cards: ['Alpha bold'],
        links: ['https://example.com/one', 'https://other.test/two', 'https://example.com/dir/three'],
        first: 'First'
      }
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('supports a selector in the body and csv output', async () => {
    stub()
    const response = await post({ url: 'example.com', selector: 'a', attr: ['title'], all: true, format: 'csv' })
    expect(await response.text()).toBe('value\r\nFirst\r\nSecond\r\n')
  })

  it('validates the body', async () => {
    expect((await post('{not json')).status).toBe(400)
    expect((await post([])).status).toBe(400)
    expect((await post({ selector: 'h1' })).status).toBe(400) // no url
    expect((await post({ url: 'example.com' })).status).toBe(400) // nothing to extract
    expect((await post({ url: 'example.com', fields: { a: {} } })).status).toBe(400)
    expect((await post({ url: 'example.com', fields: [] })).status).toBe(400)
    expect((await post({ url: 'example.com', selector: 'h1' }, env, { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await post({ url: 'example.com', selector: 'x'.repeat(LIMITS.maxBodyJsonBytes) })).status).toBe(413)
  })

  it('accepts headers as an object', async () => {
    const fetchMock = stub()
    await post({ url: 'example.com', selector: 'h1', headers: { 'X-Token': 'abc' } })
    expect(fetchMock.mock.calls[0][1].headers['x-token']).toBe('abc')
  })
})

describe('batch', () => {
  it('scrapes several urls, isolating failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (String(url).includes('broken')) throw new Error('boom')
      return html(`<h1>${ new URL(url).hostname }</h1>`)
    }))

    const params = new URLSearchParams({ selector: 'h1' })
    for (const url of ['a.example.com', 'broken.example.com', 'b.example.com', '127.0.0.1']) params.append('url', url)

    const body = await json('/?' + params)

    expect(body.results).toEqual([
      { url: 'a.example.com', result: { h1: ['a.example.com'] } },
      { url: 'broken.example.com', error: expect.stringContaining('boom'), status: 502 },
      { url: 'b.example.com', result: { h1: ['b.example.com'] } },
      { url: '127.0.0.1', error: expect.any(String), status: 400 }
    ])
  })

  it('works in POST bodies and has limits', async () => {
    stub()
    const body = await (await post({ urls: ['a.example.com', 'b.example.com'], selector: 'h1' })).json()
    expect(body.results).toHaveLength(2)

    const tooMany = Array.from({ length: LIMITS.maxBatchUrls + 1 }, (_, i) => `h${ i }.example.com`)
    expect((await post({ urls: tooMany, selector: 'h1' })).status).toBe(400)
    expect((await post({ urls: ['a.example.com', 'b.example.com'], selector: 'h1', format: 'csv' })).status).toBe(400)
  })
})

describe('rendering', () => {
  const rendering = { ...env, API_KEY: 'secret', CF_ACCOUNT_ID: 'acct', BROWSER_RENDERING_TOKEN: 'tok' }
  const headers = { headers: { 'x-api-key': 'secret' } }

  it('requires an API key', async () => {
    stub()
    expect((await get(q({ selector: 'h1', render: 'true' }), rendering)).status).toBe(403)
  })

  it('is not configured by default', async () => {
    stub()
    const response = await get(q({ selector: 'h1', render: 'true' }), { ...env, API_KEY: 'secret' }, headers)
    expect(response.status).toBe(501)
  })

  it('scrapes the rendered html', async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true, result: '<h1>Rendered</h1>' }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await get(q({ selector: 'h1', render: 'true' }), rendering, headers)

    expect(await response.json()).toEqual({ result: { h1: ['Rendered'] } })
    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(endpoint).toBe('https://api.cloudflare.com/client/v4/accounts/acct/browser-rendering/content')
    expect(init.headers.authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body).url).toBe('https://example.com/dir/page')
  })

  it('reports rendering failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: false, errors: [{ message: 'nope' }] }, { status: 400 })))
    const response = await get(q({ selector: 'h1', render: 'true' }), rendering, headers)
    expect(response.status).toBe(502)
    expect((await response.json()).error).toContain('nope')
  })
})

describe('openapi', () => {
  it('serves the spec', async () => {
    const response = await get('/openapi.json')
    expect(response.status).toBe(200)
    const spec = await response.json()
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.servers[0].url).toBe('https://scraper.test')
    expect(Object.keys(spec.paths['/'])).toEqual(['get', 'post'])
  })
})
