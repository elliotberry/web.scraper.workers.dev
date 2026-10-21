import contentTypes from './content-types.js'
import { corsHeaders } from './responses.js'

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const cell = value => typeof value === 'string' ? value : JSON.stringify(value) ?? ''

// Flattens a result into a table: `{ columns, rows }`.
//
//   "text"                      one value column
//   ["a", "b"]                  one value column, a row per item
//   [{ href, text }, ...]       a column per key, a row per item
//   { selectorOrField: [...] }  a column per key, a row per index
export function toTable(result) {
  if (typeof result === 'string') return { columns: ['value'], rows: [[result]] }

  if (Array.isArray(result)) {
    if (result.some(isObject)) {
      const columns = [...new Set(result.flatMap(item => isObject(item) ? Object.keys(item) : []))]
      return { columns, rows: result.map(item => columns.map(column => cell(isObject(item) ? item[column] ?? '' : item))) }
    }

    return { columns: ['value'], rows: result.map(item => [cell(item)]) }
  }

  if (isObject(result)) {
    const columns = Object.keys(result)
    const lists = columns.map(column => Array.isArray(result[column]) ? result[column] : [result[column]])
    const height = Math.max(0, ...lists.map(list => list.length))
    const rows = Array.from({ length: height }, (_, i) => lists.map(list => i < list.length ? cell(list[i]) : ''))

    return { columns, rows }
  }

  return { columns: ['value'], rows: [[cell(result)]] }
}

const csvCell = value => {
  // Prevent spreadsheet formula injection, but leave plain numbers alone
  if (/^[=+\-@\t\r]/.test(value) && !/^[-+]?[\d.,]+$/.test(value)) value = `'${ value }`
  return /[",\r\n]/.test(value) ? `"${ value.replace(/"/g, '""') }"` : value
}

export function toCSV(result) {
  const { columns, rows } = toTable(result)
  return [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

// One line per row; cells of a row are separated by tabs.
export function toPlainText(result) {
  const { rows } = toTable(result)
  return rows.map(row => row.map(value => value.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n') + '\n'
}

export function generateTextResponse(result, format, init = {}) {
  const csv = format === 'csv'

  return new Response(csv ? toCSV(result) : toPlainText(result), {
    status: init.status || 200,
    headers: {
      'content-type': csv ? contentTypes.csv : contentTypes.text,
      'content-disposition': csv ? 'inline; filename="scrape.csv"' : 'inline',
      'x-content-type-options': 'nosniff',
      ...corsHeaders,
      ...init.headers
    }
  })
}
