import { runPreset } from './presets.js'

async function extractField(scraper, field) {
  scraper.querySelector(field.selector)

  if (field.attr.length) return scraper.getAttributes(field.attr, field)
  if (field.content !== 'text') return scraper.getHTML(field)

  return scraper.getText(field)
}

// Text and HTML extractions are keyed by selector. Named fields have a single
// selector, so they are unwrapped to a plain array.
const unwrap = (value, field) => {
  const keys = field.attr.length ? [] : Object.keys(value)
  return keys.length === 1 ? value[keys[0]] : value
}

// Runs the extraction described by `spec` (see `parseRequest`) against a
// fetched page.
export async function extract(scraper, spec) {
  if (spec.preset) return runPreset(scraper, spec.preset, { limit: spec.field.limit })

  if (spec.fields) {
    const result = {}

    for (const [name, field] of Object.entries(spec.fields)) {
      result[name] = unwrap(await extractField(scraper, field), field)
    }

    return result
  }

  return extractField(scraper, spec.field)
}
