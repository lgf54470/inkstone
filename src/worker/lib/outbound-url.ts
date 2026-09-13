// Shared outbound-request guards: the hostname and IP safety checks back both
// the backup adapters (HTTPS-only) and the blog link checker (HTTP allowed),
// so private/reserved networks stay unreachable from every user-controlled
// outbound fetch.

export function isAllowedOutboundUrl(url: URL, options: { allowHttp: boolean }): boolean {
  if (url.protocol !== 'https:' && !(options.allowHttp && url.protocol === 'http:')) return false
  if (url.username || url.password) return false
  return !isUnsafeHostname(url.hostname)
}

export function isUnsafeHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!hostname || !hostname.includes('.')) {
    if (!hostname.includes(':')) return true
  }
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localdomain') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home') ||
    hostname === 'home.arpa' ||
    hostname.endsWith('.home.arpa') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.invalid') ||
    hostname.endsWith('.example') ||
    hostname === 'instance-data.ec2.internal' ||
    hostname === 'metadata.google.internal'
  ) {
    return true
  }

  const ipv4 = parseIpv4(hostname)
  if (ipv4) return isUnsafeIpv4(ipv4)
  const ipv6 = parseIpv6(hostname)
  if (ipv6) return isUnsafeIpv6(ipv6)
  return false
}

function parseIpv4(value: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return null
  const parts = value.split('.').map(Number)
  return parts.every((part) => part >= 0 && part <= 255) ? parts : null
}

function isUnsafeIpv4(parts: number[]): boolean {
  const [a, b, c] = parts as [number, number, number, number]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

function parseIpv6(value: string): number[] | null {
  if (!value.includes(':') || value.split('::').length > 2) return null
  const [leftRaw, rightRaw] = value.split('::') as [string, string | undefined]
  const left = leftRaw ? leftRaw.split(':') : []
  const right = rightRaw ? rightRaw.split(':') : []
  const parse = (part: string): number | null => {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null
    return Number.parseInt(part, 16)
  }
  const leftWords = left.map(parse)
  const rightWords = right.map(parse)
  if (leftWords.some((word) => word === null) || rightWords.some((word) => word === null)) return null
  const missing = 8 - leftWords.length - rightWords.length
  if (rightRaw === undefined ? missing !== 0 : missing < 1) return null
  return [
    ...(leftWords as number[]),
    ...Array.from({ length: missing }, () => 0),
    ...(rightWords as number[]),
  ]
}

function isUnsafeIpv6(words: number[]): boolean {
  const first = words[0]!
  if (words.every((word) => word === 0)) return true
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xffc0) === 0xfe80) return true
  if ((first & 0xff00) === 0xff00) return true
  if (first === 0x2001 && words[1] === 0x0db8) return true

  const ipv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff
  const ipv4Compatible = words.slice(0, 6).every((word) => word === 0)
  if (ipv4Mapped || ipv4Compatible) {
    return isUnsafeIpv4([
      words[6]! >> 8,
      words[6]! & 0xff,
      words[7]! >> 8,
      words[7]! & 0xff,
    ])
  }
  return false
}
