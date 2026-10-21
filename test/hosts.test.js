import { describe, it, expect } from 'vitest'
import { normalizeURL } from '../src/request.js'

const blocked = [
  'localhost',
  'http://foo.localhost/',
  'intranet',
  'printer.local',
  'service.internal',
  '127.0.0.1',
  'http://2130706433/', // 127.0.0.1 as an integer
  'http://0x7f.1/',
  '10.1.2.3',
  '172.16.0.1',
  '172.31.255.255',
  '192.168.1.1',
  '169.254.169.254',
  '100.64.0.1',
  '0.0.0.0',
  'http://[::1]/',
  'http://[fd00::1]/',
  'http://[fe80::1]/',
  'http://[::ffff:127.0.0.1]/',
  'http://[::ffff:10.0.0.1]/',
  'http://user:pass@example.com/'
]

const allowed = [
  'example.com',
  'https://sub.example.co.uk/path?q=1',
  '8.8.8.8',
  '172.32.0.1',
  '100.128.0.1',
  'http://[2606:4700:4700::1111]/',
  'http://[::ffff:8.8.8.8]/'
]

describe('host guard', () => {
  it.each(blocked)('blocks %s', input => {
    expect(() => normalizeURL(input)).toThrow()
    try {
      normalizeURL(input)
    } catch (error) {
      expect(error.status).toBe(400)
    }
  })

  it.each(allowed)('allows %s', input => {
    expect(() => normalizeURL(input)).not.toThrow()
  })

  it('rejects overly long urls', () => {
    expect(() => normalizeURL('example.com/' + 'a'.repeat(3000))).toThrow(/characters/)
  })
})
