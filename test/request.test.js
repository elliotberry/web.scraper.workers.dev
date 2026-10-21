import { describe, it, expect } from 'vitest'
import { parseBool, normalizeURL } from '../src/request.js'
import { HttpError } from '../src/errors.js'

describe('parseBool', () => {
  it('treats missing and falsy-looking values as false', () => {
    for (const value of [null, undefined, 'false', 'FALSE', '0', 'no', 'off']) {
      expect(parseBool(value)).toBe(false)
    }
  })

  it('treats everything else as true', () => {
    for (const value of ['true', 'on', '1', '', 'yes']) {
      expect(parseBool(value)).toBe(true)
    }
  })
})

describe('normalizeURL', () => {
  it('prepends http:// when there is no protocol', () => {
    expect(normalizeURL('example.com')).toBe('http://example.com/')
  })

  it('keeps https and trims whitespace', () => {
    expect(normalizeURL(' https://example.com/a?b=c ')).toBe('https://example.com/a?b=c')
  })

  it('rejects other protocols and invalid urls with a 400', () => {
    for (const input of ['ftp://example.com', 'file:///etc/passwd', 'http://']) {
      try {
        normalizeURL(input)
        throw new Error('expected to throw')
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError)
        expect(error.status).toBe(400)
      }
    }
  })
})
