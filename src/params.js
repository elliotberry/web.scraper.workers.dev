import { HttpError } from './errors.js'
import { LIMITS } from './config.js'
import { parseBool, parseInteger } from './request.js'
import { PRESETS } from './presets.js'

export const FORMATS = ['json', 'text', 'csv']
export const CONTENT_MODES = { text: 'text', innerhtml: 'innerHTML', outerhtml: 'outerHTML' }

const MAX_ATTRIBUTES = 10
const MAX_CONTAINS_LENGTH = 200
const ATTRIBUTE_NAME = /^[^\s"'<>/=,]{1,100}$/
const HEADER_NAME = /^[a-z0-9-]{1,100}$/
const FORBIDDEN_HEADER = /^(host|content-length|content-type|connection|keep-alive|transfer-encoding|upgrade|te|trailer|expect|origin|forwarded|via|x-forwarded-.*|x-real-ip|true-client-ip|proxy-.*|sec-.*|cf-.*)$/

const scalar = (value, name) => {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) return value.join(',')
  throw new HttpError(400, `Invalid value for "${ name }"`)
}

// Both query strings and JSON bodies are read through the same interface.
const sourceFromParams = params => ({
  get: name => params.get(name),
  getAll: name => params.getAll(name)
})

const sourceFromObject = object => ({
  get: name => scalar(object[name], name),
  getAll: name => {
    const value = object[name]
    if (value === undefined || value === null) return []
    return (Array.isArray(value) ? value : [value]).map(v => scalar(v, name))
  }
})

const parseBoolDefault = (value, fallback) => value === null || value === undefined ? fallback : parseBool(value)

function parseAttributes(value) {
  if (!value) return []

  const attributes = [...new Set(value.split(',').map(a => a.trim()).filter(Boolean))]

  if (attributes.length > MAX_ATTRIBUTES) {
    throw new HttpError(400, `At most ${ MAX_ATTRIBUTES } attributes are supported`)
  }

  for (const attribute of attributes) {
    if (!ATTRIBUTE_NAME.test(attribute)) throw new HttpError(400, `Invalid attribute name "${ attribute }"`)
  }

  return attributes
}

function parseContent(value) {
  if (!value) return 'text'

  const content = CONTENT_MODES[value.trim().toLowerCase()]
  if (!content) throw new HttpError(400, 'content must be one of: text, innerHTML, outerHTML')

  return content
}

// The options that describe how a single selector is extracted.
export function parseField(source, defaults = {}) {
  const selector = source.get('selector') || ''

  if (selector.length > LIMITS.maxSelectorLength) {
    throw new HttpError(400, `Selectors may be at most ${ LIMITS.maxSelectorLength } characters long`)
  }

  const contains = source.get('contains') || ''

  if (contains.length > MAX_CONTAINS_LENGTH) {
    throw new HttpError(400, `contains may be at most ${ MAX_CONTAINS_LENGTH } characters long`)
  }

  // Fields of a structured extraction inherit these from the request
  const inherit = name => source.get(name) ?? defaults[name] ?? null

  return {
    selector,
    attr: parseAttributes(source.get('attr')),
    all: parseBool(source.get('all')),
    content: parseContent(source.get('content')),
    spaced: parseBool(inherit('spaced')),
    trim: parseBoolDefault(inherit('trim'), true),
    absolute: parseBool(inherit('absolute')),
    limit: parseInteger(source.get('limit'), { min: 1, max: LIMITS.maxResults, fallback: undefined }),
    contains
  }
}

function parseFields(object, defaults) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    throw new HttpError(400, '"fields" must be an object of named selectors')
  }

  const entries = Object.entries(object)

  if (entries.length === 0 || entries.length > LIMITS.maxFields) {
    throw new HttpError(400, `"fields" must contain between 1 and ${ LIMITS.maxFields } fields`)
  }

  const fields = {}

  for (const [name, definition] of entries) {
    const source = typeof definition === 'string'
      ? sourceFromObject({ selector: definition })
      : sourceFromObject(definition && typeof definition === 'object' && !Array.isArray(definition) ? definition : {})

    const field = parseField(source, defaults)

    if (!field.selector) throw new HttpError(400, `Field "${ name }" needs a selector`)

    fields[name] = field
  }

  return fields
}

// Builds the headers sent to the target site from the `userAgent`, `lang` and
// `header` options ("Name: value" strings).
function parseRequestHeaders(source, headerList) {
  const headers = {}

  const userAgent = source.get('userAgent')
  if (userAgent) headers['user-agent'] = userAgent.slice(0, 500)

  const lang = source.get('lang')
  if (lang) headers['accept-language'] = lang.slice(0, 200)

  if (headerList.length > LIMITS.maxRequestHeaders) {
    throw new HttpError(400, `At most ${ LIMITS.maxRequestHeaders } custom headers are supported`)
  }

  for (const header of headerList) {
    const index = header.indexOf(':')
    const name = (index === -1 ? header : header.slice(0, index)).trim().toLowerCase()
    const value = index === -1 ? '' : header.slice(index + 1).trim()

    if (!HEADER_NAME.test(name) || FORBIDDEN_HEADER.test(name)) {
      throw new HttpError(400, `The header "${ name }" is not allowed`)
    }

    if (value.length > 1000 || /[\r\n\0]/.test(value)) {
      throw new HttpError(400, `Invalid value for the header "${ name }"`)
    }

    headers[name] = value
  }

  return headers
}

async function readJSONBody(request) {
  const contentType = request.headers.get('content-type') || ''

  if (!contentType.toLowerCase().includes('json')) {
    throw new HttpError(415, 'POST requests must have a JSON body (content-type: application/json)')
  }

  if (Number(request.headers.get('content-length')) > LIMITS.maxBodyJsonBytes) {
    throw new HttpError(413, 'The request body is too large')
  }

  const text = await request.text()

  if (new TextEncoder().encode(text).byteLength > LIMITS.maxBodyJsonBytes) {
    throw new HttpError(413, 'The request body is too large')
  }

  let body

  try {
    body = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON')
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'The request body must be a JSON object')
  }

  return body
}

/**
 * Turns a request (a GET query string or a POST JSON body) into a spec:
 *
 *   { urls, field, fields, preset, pretty, ttl, format, meta, render, headers, isSite }
 *
 * `isSite` is true for GET requests that don't describe a scrape (the UI is
 * served instead).
 */
export async function parseRequest(request) {
  const isPost = request.method === 'POST'

  let source
  let urls
  let headerList
  let rawFields = null

  if (isPost) {
    const body = await readJSONBody(request)
    source = sourceFromObject(body)
    urls = [...sourceFromObject(body).getAll('urls'), ...sourceFromObject(body).getAll('url')]
    headerList = body.headers && typeof body.headers === 'object' && !Array.isArray(body.headers)
      ? Object.entries(body.headers).map(([name, value]) => `${ name }: ${ scalar(value, 'headers') ?? '' }`)
      : sourceFromObject(body).getAll('header')
    rawFields = body.fields ?? null
  } else {
    const params = new URL(request.url).searchParams
    source = sourceFromParams(params)
    urls = params.getAll('url')
    headerList = params.getAll('header')
  }

  urls = [...new Set(urls.map(url => url.trim()).filter(Boolean))]

  const field = parseField(source)
  const preset = source.get('preset') || null

  if (preset && !PRESETS.includes(preset)) {
    throw new HttpError(400, `Unknown preset "${ preset }". Expected one of: ${ PRESETS.join(', ') }`)
  }

  const fields = rawFields === null ? null : parseFields(rawFields, field)

  const format = (source.get('format') || 'json').toLowerCase()

  if (!FORMATS.includes(format)) {
    throw new HttpError(400, `format must be one of: ${ FORMATS.join(', ') }`)
  }

  const hasExtraction = Boolean(field.selector || preset || fields)

  if (!isPost && (urls.length === 0 || !hasExtraction)) {
    return { isSite: true }
  }

  if (urls.length === 0) throw new HttpError(400, 'A url is required')
  if (!hasExtraction) throw new HttpError(400, 'A selector, preset or fields object is required')

  if (urls.length > LIMITS.maxBatchUrls) {
    throw new HttpError(400, `At most ${ LIMITS.maxBatchUrls } urls can be scraped in one request`)
  }

  if (urls.length > 1 && format !== 'json') {
    throw new HttpError(400, `format=${ format } is not supported with multiple urls`)
  }

  return {
    isSite: false,
    urls,
    field,
    fields,
    preset,
    format,
    pretty: parseBool(source.get('pretty')),
    meta: parseBool(source.get('meta')),
    render: parseBool(source.get('render')),
    ttl: parseInteger(source.get('ttl'), { min: 0, max: LIMITS.maxTtl, fallback: 0 }),
    headers: parseRequestHeaders(source, headerList)
  }
}
