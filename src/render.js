import { HttpError } from './errors.js'
import { LIMITS } from './config.js'

const encoder = new TextEncoder()

// Renders `url` in a real browser using the Cloudflare Browser Rendering REST
// API, so that pages built with client side JavaScript can be scraped.
//
// Needs two (optional) secrets: `CF_ACCOUNT_ID` and a `BROWSER_RENDERING_TOKEN`
// API token with the "Browser Rendering - Edit" permission.
// Returns the same shape as `fetchPage`.
export async function renderPage(url, options = {}) {
  const { env = {}, timeoutMs = LIMITS.renderTimeoutMs, maxBytes = LIMITS.maxBodyBytes } = options

  if (!env.CF_ACCOUNT_ID || !env.BROWSER_RENDERING_TOKEN) {
    throw new HttpError(501, 'Rendering is not configured on this deployment')
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${ env.CF_ACCOUNT_ID }/browser-rendering/content`

  let response

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        authorization: `Bearer ${ env.BROWSER_RENDERING_TOKEN }`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        url,
        ...(options.headers?.['user-agent'] ? { userAgent: options.headers['user-agent'] } : {}),
        ...(options.headers && Object.keys(options.headers).length
          ? { setExtraHTTPHeaders: options.headers }
          : {})
      })
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new HttpError(504, `Timed out after ${ timeoutMs }ms rendering ${ url }`)
    }

    throw new HttpError(502, `Unable to render ${ url }: ${ error.message }`)
  }

  let payload

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok || !payload?.success || typeof payload.result !== 'string') {
    const message = payload?.errors?.[0]?.message || `status ${ response.status }`
    throw new HttpError(502, `Unable to render ${ url }: ${ message }`)
  }

  const body = encoder.encode(payload.result)

  if (body.byteLength > maxBytes) {
    throw new HttpError(413, `The rendered page is larger than the ${ maxBytes } byte limit`)
  }

  return {
    body,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    url,
    status: 200
  }
}
