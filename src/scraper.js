import { HttpError } from './errors.js'
import { LIMITS } from './config.js'
import { fetchPage } from './fetcher.js'
import { splitSelectors } from './selectors.js'

const cleanText = s => s.trim().replace(/\s\s+/g, ' ')

// Attributes whose values are URLs and can be resolved against the page URL.
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'poster', 'cite', 'data', 'longdesc', 'formaction'])

export const resolveURL = (value, base) => {
  try {
    return new URL(value, base).href
  } catch {
    return value
  }
}

const includesText = (value, contains) => {
  return !contains || value.toLowerCase().includes(contains.toLowerCase())
}

const escapeAttribute = value => value.replace(/"/g, '&quot;')

const startTag = element => {
  let tag = `<${ element.tagName }`
  for (const [name, value] of element.attributes) tag += ` ${ name }="${ escapeAttribute(value) }"`
  return tag + '>'
}

class Scraper {
  // Fetches `url`. See `fetchPage` for the supported options. A custom
  // `options.fetchPage(url, options)` can be provided (used for rendering).
  async fetch(url, options = {}) {
    const page = await (options.fetchPage || fetchPage)(url, options)

    this.page = page
    this.url = page.url // The final URL, after redirects
    this.status = page.status
    this.contentType = page.headers.get('content-type') || ''
    this.truncated = false

    return this
  }

  querySelector(selector) {
    this.selector = selector
    return this
  }

  // Every call builds its own HTMLRewriter and runs it over the buffered
  // body, so a Scraper can be queried any number of times.
  async transform(rewriter) {
    const response = new Response(this.page.body, {
      headers: { 'content-type': this.contentType || 'text/html' }
    })

    try {
      await rewriter.transform(response).arrayBuffer()
    } catch (error) {
      throw new HttpError(502, `Unable to parse the response from ${ this.url }: ${ error.message }`)
    }
  }

  // Applies the hard result cap (and flags truncation), then the optional `limit`.
  applyLimit(list, limit) {
    if (list.length > LIMITS.maxResults) {
      this.truncated = true
      list.length = LIMITS.maxResults
    }

    if (limit && list.length > limit) list.length = limit

    return list
  }

  selectorList() {
    const selectors = splitSelectors(this.selector)

    if (selectors.length === 0) {
      throw new HttpError(400, 'No selector provided')
    }

    if (selectors.length > LIMITS.maxSelectors) {
      throw new HttpError(400, `At most ${ LIMITS.maxSelectors } selectors are supported`)
    }

    return selectors
  }

  // Text of every matched node, as an object keyed by selector.
  async getText({ spaced, trim = true, limit, contains } = {}) {
    const rewriter = new HTMLRewriter()
    const matches = {}
    const selectors = this.selectorList()

    selectors.forEach((selector) => {
      matches[selector] = []

      let nextText = ''

      onSelector(rewriter, selector, {
        element() {
          matches[selector].push(true)
          nextText = ''
        },

        text(text) {
          nextText += text.text

          if (text.lastInTextNode) {
            if (spaced) nextText += ' '
            matches[selector].push(nextText)
            nextText = ''
          }
        }
      })
    })

    await this.transform(rewriter)

    const clean = trim ? cleanText : s => s

    selectors.forEach((selector) => {
      let nodeCompleteTexts = []

      let nextText = ''

      matches[selector].forEach(text => {
        if (text === true) {
          if (nextText.trim() !== '') {
            nodeCompleteTexts.push(clean(nextText))
            nextText = ''
          }
        } else {
          nextText += text
        }
      })

      if (nextText.trim() !== '') nodeCompleteTexts.push(clean(nextText))

      nodeCompleteTexts = nodeCompleteTexts.filter(text => includesText(text, contains))

      matches[selector] = this.applyLimit(nodeCompleteTexts, limit)
    })

    return matches
  }

  // The (reconstructed) inner or outer HTML of every matched node, as an
  // object keyed by selector. Markup is rebuilt from the parser events, so it
  // is normalized (e.g. attribute quoting) and elements that are closed
  // implicitly (such as `<p>` or `<li>` without end tags) are not closed.
  async getHTML({ content = 'innerHTML', trim = true, limit, contains } = {}) {
    const rewriter = new HTMLRewriter()
    const results = {}
    const selectors = this.selectorList()
    const key = content === 'outerHTML' ? 'outer' : 'inner'

    selectors.forEach((selector) => {
      const matches = [] // In document order
      const open = []
      let isMatch = false

      onSelector(rewriter, selector, {
        element() {
          isMatch = true
        }
      })

      onSelector(rewriter, `${ selector }, ${ selector } *`, {
        element(element) {
          const tag = startTag(element)
          const tagName = element.tagName // Elements can't be used in end tag callbacks
          const matched = isMatch
          isMatch = false

          // Ancestor matches contain this element
          open.forEach(m => {
            m.inner += tag
            m.outer += tag
          })

          const match = { inner: '', outer: tag }

          if (matched) {
            matches.push(match)
            open.push(match)
          }

          try {
            element.onEndTag(() => {
              const end = `</${ tagName }>`

              if (matched) {
                open.splice(open.indexOf(match), 1)
                match.outer += end
              }

              open.forEach(m => {
                m.inner += end
                m.outer += end
              })
            })
          } catch {
            // Void elements (br, img, ...) have no end tag
            if (matched) open.splice(open.indexOf(match), 1)
          }
        },

        text(text) {
          open.forEach(m => {
            m.inner += text.text
            m.outer += text.text
          })
        },

        comments(comment) {
          const markup = `<!--${ comment.text }-->`

          open.forEach(m => {
            m.inner += markup
            m.outer += markup
          })
        }
      })

      results[selector] = matches
    })

    await this.transform(rewriter)

    selectors.forEach((selector) => {
      const values = results[selector]
        .map(match => trim ? match[key].trim() : match[key])
        .filter(value => value !== '' && includesText(value, contains))

      results[selector] = this.applyLimit(values, limit)
    })

    return results
  }

  // Attribute values of the matched nodes.
  //
  //   one attribute,  all=false: the first non-empty value, as a string
  //   one attribute,  all=true:  an array with every non-empty value
  //   many attributes, all=false: an object with the first non-empty value of each
  //   many attributes, all=true:  an array of objects, one per matching node
  async getAttributes(attributes, { all = false, absolute = false, limit, contains } = {}) {
    const attrs = Array.isArray(attributes) ? attributes : [attributes]
    const rows = []

    const rewriter = new HTMLRewriter()

    onSelector(rewriter, this.selector, {
      element: (element) => {
        const row = {}
        let hasValue = false

        for (const attr of attrs) {
          let value = element.getAttribute(attr) || ''
          if (value && absolute && URL_ATTRIBUTES.has(attr.toLowerCase())) value = resolveURL(value, this.url)
          if (value) hasValue = true
          row[attr] = value
        }

        if (!hasValue) return
        if (contains && !Object.values(row).some(value => includesText(value, contains))) return

        rows.push(row)
      }
    })

    await this.transform(rewriter)

    if (!all) {
      const first = {}
      for (const attr of attrs) first[attr] = (rows.find(row => row[attr]) || {})[attr] || ''
      return attrs.length === 1 ? first[attrs[0]] : first
    }

    this.applyLimit(rows, limit)

    return attrs.length === 1 ? rows.map(row => row[attrs[0]]) : rows
  }

  // Kept for compatibility: the first non-empty value of one attribute.
  getAttribute(attribute) {
    return this.getAttributes([attribute])
  }
}

// HTMLRewriter throws when it can't parse a selector; surface that as a 400.
export function onSelector(rewriter, selector, handlers) {
  try {
    rewriter.on(selector, handlers)
  } catch (error) {
    throw new HttpError(400, `Invalid selector "${ selector }": ${ error.message }`)
  }
}

export { cleanText }
export default Scraper
