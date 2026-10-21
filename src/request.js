import { HttpError } from './errors.js'
import { assertPublicHost } from './hosts.js'
import { LIMITS } from './config.js'

// Query string flags: absent/`false`/`0`/`no`/`off` are false, anything else
// (including a bare `?pretty`) is true.
export const parseBool = value => {
  if (value === null || value === undefined) return false
  return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase())
}

// Adds `http://` when no protocol is given and rejects anything that is not
// a public http(s) URL.
export function normalizeURL(input) {
  let url = input.trim()

  if (url.length > LIMITS.maxUrlLength) {
    throw new HttpError(400, `Urls may be at most ${ LIMITS.maxUrlLength } characters long`)
  }

  if (!url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) url = 'http://' + url

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new HttpError(400, `Invalid url "${ input }"`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'Only http and https urls are supported')
  }

  assertPublicHost(parsed)

  return parsed.href
}

// Parses an integer query param, clamped to [min, max]. Invalid values fall back to `fallback`.
export function parseInteger(value, { min, max, fallback }) {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number.parseInt(value, 10)
  if (Number.isNaN(number)) return fallback
  return Math.min(max, Math.max(min, number))
}
