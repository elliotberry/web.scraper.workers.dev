// Rate limiting uses the Workers Rate Limiting binding (`RATE_LIMITER`, see
// wrangler.toml). Requests carrying the optional `API_KEY` secret in the
// `x-api-key` header are not rate limited. Both are optional: without the
// binding no limit is applied.
const encoder = new TextEncoder()

export async function hasValidKey(request, env) {
  const provided = request.headers.get('x-api-key')
  const expected = env?.API_KEY

  if (!provided || !expected) return false

  const a = encoder.encode(provided)
  const b = encoder.encode(expected)
  if (a.byteLength !== b.byteLength) return false

  return crypto.subtle.timingSafeEqual(a, b)
}

// Returns true when the request may proceed.
export async function checkRateLimit(request, env) {
  if (!env?.RATE_LIMITER) return true

  if (await hasValidKey(request, env)) return true

  const key = request.headers.get('cf-connecting-ip') || 'anonymous'
  const { success } = await env.RATE_LIMITER.limit({ key })

  return success
}
