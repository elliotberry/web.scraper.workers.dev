import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleRequest } from '../src/index.js'

const page = `<!doctype html><html><body>
  <h1>Hello <em>World</em></h1>
  <div class="box"><p>One</p><p>Two</p></div>
  <a href="/first" title="">First</a>
  <a href="/second" title="Second">Second</a>
</body></html>`

const env = { ASSETS: { fetch: () => new Response('<html>ui</html>', { headers: { 'content-type': 'text/html' } }) } }

const mockUpstream = (response = new Response(page, { headers: { 'content-type': 'text/html' } })) => {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const get = (path, init) => handleRequest(new Request(`https://scraper.test${ path }`, init), env)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('handleRequest', () => {
  it('serves the UI when url or selector is missing', async () => {
    expect(await (await get('/')).text()).toContain('ui')
    expect(await (await get('/?url=example.com')).text()).toContain('ui')
  })

  it('scrapes text keyed by selector', async () => {
    const fetchMock = mockUpstream()
    const response = await get('/?url=example.com&selector=h1')

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(await response.json()).toEqual({ result: { h1: ['Hello World'] } })
    expect(fetchMock.mock.calls[0][0]).toBe('http://example.com/')
  })

  it('supports multiple selectors and the spaced option', async () => {
    mockUpstream()
    const plain = await (await get('/?url=example.com&selector=.box,h1')).json()
    expect(plain.result['.box']).toEqual(['OneTwo'])
    expect(plain.result.h1).toEqual(['Hello World'])

    mockUpstream()
    const spaced = await (await get('/?url=example.com&selector=.box&spaced=true')).json()
    expect(spaced.result['.box']).toEqual(['One Two'])
  })

  it('treats pretty=false and spaced=false as false', async () => {
    mockUpstream()
    const response = await get('/?url=example.com&selector=.box&pretty=false&spaced=false')
    const text = await response.text()
    expect(text).toBe('{"result":{".box":["OneTwo"]}}')
  })

  it('pretty prints when requested', async () => {
    mockUpstream()
    const text = await (await get('/?url=example.com&selector=h1&pretty=true')).text()
    expect(text).toContain('\n  "result"')
  })

  it('returns the first non-empty attribute', async () => {
    mockUpstream()
    expect(await (await get('/?url=example.com&selector=a&attr=title')).json()).toEqual({ result: 'Second' })

    mockUpstream()
    expect(await (await get('/?url=example.com&selector=a&attr=missing')).json()).toEqual({ result: '' })
  })

  it('can be queried repeatedly via the same upstream response', async () => {
    mockUpstream()
    const first = await (await get('/?url=example.com&selector=h1,p')).json()
    expect(first.result.p).toEqual(['One', 'Two'])
  })

  it('returns 400 for an invalid url', async () => {
    const response = await get('/?url=ftp://example.com&selector=h1')
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/http/)
  })

  it('returns 400 for an invalid selector', async () => {
    mockUpstream()
    const response = await get('/?url=example.com&selector=' + encodeURIComponent('h1[['))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/selector/i)
  })

  it('returns 502 when the upstream cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    const response = await get('/?url=example.com&selector=h1')
    expect(response.status).toBe(502)
  })

  it('returns 502 for Cloudflare-originated error statuses', async () => {
    mockUpstream(new Response('nope', { status: 530, headers: { server: 'cloudflare' } }))
    const response = await get('/?url=example.com&selector=h1')
    expect(response.status).toBe(502)
    expect((await response.json()).upstreamStatus).toBe(530)
  })

  it('answers CORS preflight requests', async () => {
    const response = await get('/', { method: 'OPTIONS' })
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toContain('GET')
  })

  it('rejects other methods with 405', async () => {
    const response = await get('/?url=example.com&selector=h1', { method: 'PUT' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toContain('GET')
  })
})
