import { HttpError } from './errors.js'
import { LIMITS, USER_AGENT } from './config.js'
import { normalizeURL } from './request.js'

const REDIRECT_STATUSES = [301, 302, 303, 307, 308]
const HTML_CONTENT_TYPE = /^(text\/html|text\/xml|application\/xml|application\/xhtml\+xml|[^;]+\+xml)$/

// Cloudflare-generated errors (e.g. 530 with a 1xxx error code when a domain
// can't be resolved) are failures of the request, not content of the site.
// Every other upstream status is passed through and reported by the caller.
const isCloudflareError = response => {
  const server = response.headers.get('server')
  return (
    response.status >= 520 && response.status <= 530 &&
    (server === 'cloudflare' || !server /* Workers preview editor */)
  )
}

const isTimeout = (error, signal) => (
  signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError'
)

// Reads the whole body, failing as soon as it grows past `maxBytes`.
async function readBody(response, { maxBytes, url, signal, timeoutMs }) {
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks = []
  let received = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      received += value.byteLength

      if (received > maxBytes) {
        await reader.cancel()
        throw new HttpError(413, `The response is larger than the ${ maxBytes } byte limit`)
      }

      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof HttpError) throw error

    if (isTimeout(error, signal)) {
      throw new HttpError(504, `Timed out after ${ timeoutMs }ms reading ${ url }`)
    }

    throw new HttpError(502, `Unable to read response from ${ url }: ${ error.message }`)
  }

  const body = new Uint8Array(received)
  let offset = 0

  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return body
}

/**
 * Fetches `url`, following redirects manually so that every hop is validated,
 * with a timeout, a size limit and a content type check.
 *
 * The (size limited) body is read into memory so that it can be queried any
 * number of times. Returns `{ body, headers, url, status }`.
 */
export async function fetchPage(url, options = {}) {
  const {
    timeoutMs = LIMITS.fetchTimeoutMs,
    maxBytes = LIMITS.maxBodyBytes,
    ttl = 0,
    headers = {}
  } = options

  const signal = AbortSignal.timeout(timeoutMs)

  const requestHeaders = {
    'user-agent': USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ...headers
  }

  let current = url
  let response

  for (let hops = 0; ; hops++) {
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal,
        headers: requestHeaders,
        ...(ttl > 0 ? { cf: { cacheTtl: ttl, cacheEverything: true } } : {})
      })
    } catch (error) {
      if (isTimeout(error, signal)) {
        throw new HttpError(504, `Timed out after ${ timeoutMs }ms requesting ${ current }`)
      }

      throw new HttpError(502, `Unable to request ${ current }: ${ error.message }`)
    }

    const location = response.headers.get('location')

    if (!REDIRECT_STATUSES.includes(response.status) || !location) break

    await response.body?.cancel()

    if (hops >= LIMITS.maxRedirects) {
      throw new HttpError(502, `Too many redirects requesting ${ url }`)
    }

    try {
      current = normalizeURL(new URL(location, current).href)
    } catch (error) {
      throw new HttpError(502, `Refusing to follow redirect to ${ location }: ${ error.message }`)
    }
  }

  if (isCloudflareError(response)) {
    throw new HttpError(502, `Status ${ response.status } requesting ${ current }`, {
      upstreamStatus: response.status
    })
  }

  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()

  if (contentType && !HTML_CONTENT_TYPE.test(contentType)) {
    await response.body?.cancel()
    throw new HttpError(415, `Unsupported content type "${ contentType }", expected HTML`, {
      upstreamStatus: response.status
    })
  }

  const contentLength = Number(response.headers.get('content-length'))

  if (contentLength > maxBytes) {
    await response.body?.cancel()
    throw new HttpError(413, `The response is larger than the ${ maxBytes } byte limit`)
  }

  const body = await readBody(response, { maxBytes, url: current, signal, timeoutMs })

  return {
    body,
    headers: response.headers,
    url: current,
    status: response.status
  }
}
