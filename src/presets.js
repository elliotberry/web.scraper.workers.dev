import { HttpError } from './errors.js'
import { cleanText, resolveURL } from './scraper.js'

export const PRESETS = ['meta', 'links', 'images', 'headings']

const MAX_META_ENTRIES = 100

// Ready-made extractions that don't need a selector. Every preset returns
// structured data; `links` and `images` are resolved against the page URL.
export async function runPreset(scraper, name, { limit } = {}) {
  switch (name) {
    case 'links': return limited(scraper, await links(scraper), limit)
    case 'images': return limited(scraper, await images(scraper), limit)
    case 'headings': return limited(scraper, await headings(scraper), limit)
    case 'meta': return meta(scraper)
    default: throw new HttpError(400, `Unknown preset "${ name }". Expected one of: ${ PRESETS.join(', ') }`)
  }
}

const limited = (scraper, list, limit) => scraper.applyLimit(list, limit)

async function links(scraper) {
  const items = []
  let current

  const rewriter = new HTMLRewriter().on('a[href]', {
    element(element) {
      current = { text: '', href: resolveURL(element.getAttribute('href'), scraper.url) }
      items.push(current)
    },
    text(text) {
      if (current) current.text += text.text
    }
  })

  await scraper.transform(rewriter)

  return items.map(item => ({ ...item, text: cleanText(item.text) }))
}

async function images(scraper) {
  const items = []

  const rewriter = new HTMLRewriter().on('img[src]', {
    element(element) {
      items.push({
        src: resolveURL(element.getAttribute('src'), scraper.url),
        alt: element.getAttribute('alt') || ''
      })
    }
  })

  await scraper.transform(rewriter)

  return items
}

async function headings(scraper) {
  const items = []
  let current

  const rewriter = new HTMLRewriter().on('h1, h2, h3, h4, h5, h6', {
    element(element) {
      current = { level: Number(element.tagName[1]), text: '' }
      items.push(current)
    },
    text(text) {
      if (current) current.text += text.text
    }
  })

  await scraper.transform(rewriter)

  return items
    .map(item => ({ ...item, text: cleanText(item.text) }))
    .filter(item => item.text !== '')
}

async function meta(scraper) {
  const result = { title: '', lang: '', canonical: '', description: '', og: {}, twitter: {}, other: {} }
  let count = 0

  const rewriter = new HTMLRewriter()
    .on('html', {
      element(element) {
        result.lang = element.getAttribute('lang') || ''
      }
    })
    .on('title', {
      text(text) {
        result.title += text.text
      }
    })
    .on('link[rel~="canonical"]', {
      element(element) {
        const href = element.getAttribute('href')
        if (href && !result.canonical) result.canonical = resolveURL(href, scraper.url)
      }
    })
    .on('meta', {
      element(element) {
        const content = element.getAttribute('content')
        const name = (element.getAttribute('property') || element.getAttribute('name') || '').toLowerCase()

        if (!name || content === null || ++count > MAX_META_ENTRIES) return

        if (name === 'description') result.description = content
        else if (name.startsWith('og:')) result.og[name.slice(3)] = content
        else if (name.startsWith('twitter:')) result.twitter[name.slice(8)] = content
        else result.other[name] = content
      }
    })

  await scraper.transform(rewriter)

  result.title = cleanText(result.title)

  return result
}
