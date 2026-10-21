import { HttpError } from './errors.js'

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa', '.lan', '.intranet', '.corp']

const ipv4ToParts = host => {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  return match ? match.slice(1).map(Number) : null
}

export function isPrivateIPv4([a, b, c]) {
  return (
    a === 0 || // "this" network
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  )
}

function isPrivateIPv6(host) {
  const address = host.replace(/^\[|\]$/g, '').toLowerCase()

  if (address === '::' || address === '::1') return true

  // IPv4-mapped addresses (the URL parser normalizes them to hex, e.g. ::ffff:7f00:1)
  const mapped = address.match(/^(?:0:0:0:0:0|:):ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mapped) {
    const high = parseInt(mapped[1], 16)
    const low = parseInt(mapped[2], 16)
    return isPrivateIPv4([high >> 8, high & 255, low >> 8, low & 255])
  }

  const first = parseInt(address.split(':')[0] || '0', 16)
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 // multicast
  )
}

// Rejects URLs that point at loopback, private or otherwise non-public hosts,
// and URLs containing credentials. Expects an already parsed `URL`.
export function assertPublicHost(parsed) {
  if (parsed.username || parsed.password) {
    throw new HttpError(400, 'Credentials in urls are not supported')
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')

  if (host.startsWith('[')) {
    if (isPrivateIPv6(host)) throw new HttpError(400, 'Private and loopback addresses are not allowed')
    return
  }

  const ipv4 = ipv4ToParts(host)
  if (ipv4) {
    if (isPrivateIPv4(ipv4)) throw new HttpError(400, 'Private and loopback addresses are not allowed')
    return
  }

  const isInternalName = (
    !host.includes('.') || // single-label names such as `localhost` or `intranet`
    BLOCKED_SUFFIXES.some(suffix => host.endsWith(suffix))
  )

  if (isInternalName) {
    throw new HttpError(400, 'Private and internal hostnames are not allowed')
  }
}
