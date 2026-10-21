const Debounce = (fn, delay) => {
  let timeout

  return () => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(), delay)
  }
}

const form = document.querySelector('form')
const urlInput = document.getElementById('url')
const selectorInput = document.getElementById('selector')
const formatSelect = document.getElementById('format')
const openDialog = document.querySelector('[data-js-dialog-open]')
const fillExample = document.querySelector('[data-js-fill-example]')
const permalink = document.querySelector('[data-js-permalink]')
const jsonPreview = document.querySelector('[data-js-json-preview]')
const statusEl = document.querySelector('[data-js-status]')
const historyDetails = document.querySelector('[data-js-history-details]')
const historyList = document.querySelector('[data-js-history]')
const historyClear = document.querySelector('[data-js-history-clear]')

const mobileQuery = window.matchMedia('(max-width: 800px)')

const dialog = new Dialog(document.querySelector('[dialog]'))
openDialog.addEventListener('click', () => dialog.open())

// Form state -> API request

const BOOLEANS = ['pretty', 'spaced', 'all', 'absolute']

// The query string parameters the API understands for the current form state.
const buildParams = () => {
  const data = new FormData(form)
  const scrape = data.get('scrape')

  BOOLEANS.forEach(b => {
    if (data.get(b) === 'on') data.set(b, 'true')
  })

  data.delete('scrape')

  if (scrape !== 'text') data.delete('spaced')

  if (scrape === 'attr') {
    data.delete('content')
  } else {
    ['attr', 'all', 'absolute'].forEach(name => data.delete(name))
    if (scrape === 'html') data.set('content', 'innerHTML')
  }

  if (data.get('format') === 'json') data.delete('format')
  if (data.get('format') !== null || data.get('pretty') === null) data.delete('pretty')

  return new URLSearchParams(data)
}

const apiURL = params => `${ form.action }?${ params.toString() }`

const shellQuote = value => `'${ value.replace(/'/g, `'\\''`) }'`

// Examples

fillExample.addEventListener('click', () => {
  const data = {
    url: 'example.com',
    selector: 'h1'
  }

  const getFieldEl = id => form.querySelector(`#${ id }`)

  let pristine = true
  for (const property in data) {
    const fieldEl = getFieldEl(property)
    if (fieldEl && fieldEl.value !== '') pristine = false
  }

  if (pristine === false) {
    const confirmValue = confirm('Are you sure you want to replace all of the entries in the form with the example values?')
    if (!confirmValue) return
  }

  for (const property in data) {
    const fieldEl = getFieldEl(property)
    if (fieldEl) fieldEl.value = data[property]
  }

  setURLCustomValidity()
  setSelectorCustomValidity()

  update()
})

// History (saved in this browser only)

const HISTORY_KEY = 'scraper-history'
const HISTORY_LIMIT = 10

const readHistory = () => {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY))
    return Array.isArray(history) ? history : []
  } catch {
    return []
  }
}

const writeHistory = history => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  } catch {
    // Storage is unavailable; history is simply not kept
  }
}

const renderHistory = () => {
  const history = readHistory()

  historyList.textContent = ''
  historyDetails.hidden = history.length === 0

  history.forEach(entry => {
    const item = document.createElement('li')
    const button = document.createElement('button')

    button.type = 'button'
    button.className = 'History--item'
    button.textContent = `${ entry.url } · ${ entry.selector }`
    button.title = button.textContent
    button.addEventListener('click', () => restoreForm(entry))

    item.appendChild(button)
    historyList.appendChild(item)
  })
}

const rememberScrape = () => {
  const entry = Object.fromEntries(new FormData(form))
  const key = JSON.stringify(entry)

  const history = readHistory().filter(other => JSON.stringify(other) !== key)
  history.unshift(entry)

  writeHistory(history.slice(0, HISTORY_LIMIT))
  renderHistory()
}

const restoreForm = entry => {
  Array.from(form.elements).forEach(el => {
    if (!el.name) return

    if (el.type === 'checkbox') {
      el.checked = el.name in entry
    } else if (el.type === 'radio') {
      el.checked = entry[el.name] === el.value
    } else if (el.name in entry) {
      el.value = entry[el.name]
    } else {
      el.value = el.defaultValue
    }
  })

  handleVisibilityUpdate()
  setURLCustomValidity()
  setSelectorCustomValidity()
  lastPermalink = null
  update()
}

historyClear.addEventListener('click', () => {
  writeHistory([])
  renderHistory()
})

renderHistory()

// Preview

let lastPermalink = permalink.href
let lastOutput = ''
let requestId = 0

const update = () => {
  if (form.checkValidity && !form.checkValidity()) return

  const params = buildParams()
  const url = apiURL(params)

  if (url === lastPermalink) return
  lastPermalink = url

  if (params.get('url') && params.get('selector')) {
    permalink.href = url
    updatePreview(url, params)
  }
}

const setStatus = message => {
  statusEl.textContent = message
}

// The number of matched values in a result, for the "N matches" status.
const countMatches = value => {
  if (typeof value === 'string') return value === '' ? 0 : 1
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.values(value).reduce((sum, v) => sum + countMatches(v), 0)
  return 0
}

async function updatePreview(url, params) {
  const id = ++requestId
  const pretty = params.get('pretty') === 'true'
  const startedAt = performance.now()

  setStatus('Scraping…')

  try {
    const response = await fetch(url)
    const text = await response.text()

    if (id !== requestId) return // A newer request replaced this one

    const duration = Math.round(performance.now() - startedAt)

    if (params.get('format')) {
      lastOutput = text
      jsonPreview.textContent = text
      setStatus(response.ok ? `${ duration } ms` : `Error ${ response.status }`)
    } else {
      const json = JSON.parse(text)

      lastOutput = JSON.stringify(json, null, pretty ? 2 : 0)
      jsonPreview.textContent = lastOutput

      if (json.error) {
        setStatus(`Error ${ response.status }`)
      } else {
        const count = countMatches(json.result)
        setStatus(`${ count } ${ count === 1 ? 'match' : 'matches' } · ${ duration } ms`)
      }
    }

    if (response.ok) rememberScrape()
  } catch (error) {
    if (id !== requestId) return

    lastOutput = JSON.stringify({ error: error.message || 'Request failed' }, null, pretty ? 2 : 0)
    jsonPreview.textContent = lastOutput
    setStatus('Request failed')
  }
}

// Copying

const copy = async (text, label) => {
  try {
    await navigator.clipboard.writeText(text)
    setStatus(`Copied ${ label }`)
  } catch {
    setStatus('Copying is not available in this browser')
  }
}

document.querySelectorAll('[data-js-copy]').forEach(button => {
  button.addEventListener('click', () => {
    const kind = button.getAttribute('data-js-copy')
    const url = apiURL(buildParams())

    if (kind === 'curl') {
      copy(`curl -s ${ shellQuote(url) }`, 'curl command')
    } else if (kind === 'fetch') {
      const parse = buildParams().get('format') ? 'text()' : 'json()'
      copy(`const response = await fetch(${ JSON.stringify(url) })\nconst data = await response.${ parse }`, 'fetch snippet')
    } else {
      copy(lastOutput, 'output')
    }
  })
})

// Form behavior

form.addEventListener('submit', event => {
  event.preventDefault()

  if (mobileQuery.matches) {
    // There is no preview on small screens, go to the API response instead
    window.location.assign(apiURL(buildParams()))
    return
  }

  update()
})

const formInputChangeEvents = ['input', 'change']
const debouncedUpdate = Debounce(update, 100)

document.querySelectorAll('input[type="text"]').forEach(el => {
  formInputChangeEvents.forEach(eventName => {
    el.addEventListener(eventName, () => {
      if (mobileQuery.matches) return
      debouncedUpdate()
    })
  })

  const dirty = () => {
    el.removeEventListener('change', dirty)
    el.removeAttribute('is-pristine')
  }

  el.addEventListener('change', dirty)
})

const handleVisibilityUpdate = () => {
  const scrapeValue = document.querySelector('input[name="scrape"]:checked').value

  document.querySelectorAll('[show-if-scrape]').forEach(el => {
    el.toggleAttribute('is-hidden', el.getAttribute('show-if-scrape') !== scrapeValue)
  })

  document.querySelectorAll('[show-if-format]').forEach(el => {
    el.toggleAttribute('is-hidden', el.getAttribute('show-if-format') !== formatSelect.value)
  })

  jsonPreview.setAttribute('language', formatSelect.value === 'json' ? 'json' : 'text')
}

document.querySelectorAll('input[type="checkbox"], input[type="radio"], select').forEach(el => {
  el.addEventListener('change', () => {
    handleVisibilityUpdate()
    if (mobileQuery.matches) return
    update()
  })
})

handleVisibilityUpdate()

// Validation

const setURLCustomValidity = () => {
  if (urlInput.validity.valueMissing) {
    urlInput.setCustomValidity('Enter the URL you’d like to scrape.')
  } else if (urlInput.validity.patternMismatch) {
    urlInput.setCustomValidity('Enter a valid URL.')
  } else {
    urlInput.setCustomValidity('')
  }
}

formInputChangeEvents.forEach(eventName => {
  urlInput.addEventListener(eventName, () => {
    setURLCustomValidity()
  })
})

setURLCustomValidity()

const setSelectorCustomValidity = () => {
  if (selectorInput.validity.valueMissing) {
    selectorInput.setCustomValidity('Enter a CSS selector to scrape.')
  } else if (selectorInput.validity.patternMismatch) {
    selectorInput.setCustomValidity('Enter a valid CSS selector.')
  } else {
    selectorInput.setCustomValidity('')
  }
}

formInputChangeEvents.forEach(eventName => {
  selectorInput.addEventListener(eventName, () => {
    setSelectorCustomValidity()
  })
})

setSelectorCustomValidity()
