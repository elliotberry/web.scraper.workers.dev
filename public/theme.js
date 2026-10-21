// Applies the saved (or system) color scheme as early as possible to avoid a flash.
(() => {
  const storageKey = 'scraper-theme'
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

  const stored = () => {
    try {
      return localStorage.getItem(storageKey)
    } catch {
      return null
    }
  }

  const apply = theme => document.documentElement.setAttribute('data-theme', theme)

  apply(stored() || (darkQuery.matches ? 'dark' : 'light'))

  darkQuery.addEventListener('change', event => {
    if (!stored()) apply(event.matches ? 'dark' : 'light')
  })

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('[data-js-theme-toggle]')
    if (!toggle) return

    toggle.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
      apply(next)

      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // Storage is unavailable (private mode); the choice only lasts for this page view
      }
    })
  })
})()
