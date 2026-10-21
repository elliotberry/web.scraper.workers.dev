import contentTypes from './content-types.js'
import { HttpError } from './errors.js'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'x-upstream-status, x-upstream-url',
  'Access-Control-Max-Age': '86400'
}

const formatJSON = (obj, pretty) => JSON.stringify(obj, null, pretty ? 2 : 0)

const generateJSONResponse = (obj, pretty, init = {}) => {
  return new Response(formatJSON(obj, pretty), {
    status: init.status || 200,
    headers: {
      'content-type': contentTypes.json,
      ...corsHeaders,
      ...init.headers
    }
  })
}

const generateErrorJSONResponse = (error, pretty) => {
  const status = error instanceof HttpError ? error.status : 500
  const message = typeof error === 'string' ? error : error.message
  const details = error instanceof HttpError ? error.details : {}

  return generateJSONResponse({ error: message, ...details }, pretty, {
    status,
    headers: { 'cache-control': 'no-store' }
  })
}

export { generateJSONResponse, generateErrorJSONResponse }
