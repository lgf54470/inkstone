import { isAllowedOutboundUrl } from '../../lib/outbound-url'
import { cancelStreamBestEffort } from '../../lib/streams'

// The page's CSP forbids third party connections, so every catalogue request the
// library makes runs through here. The allowlist is checked on each hop because a
// redirect the Worker follows is still the Worker fetching.
const MAX_REDIRECT_HOPS = 3
const OUTBOUND_TIMEOUT_MS = 12_000

export async function fetchAllowedResource(
  rawUrl: string,
  allowedHosts: readonly string[],
  accept: string,
): Promise<Response | null> {
  let current = parseUrl(rawUrl)
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS && current; hop++) {
    if (!isAllowedOutboundUrl(current, { allowHttp: false }) || !isHostInList(current.hostname, allowedHosts)) return null
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
      headers: { Accept: accept },
    })
    if (response.status < 300 || response.status >= 400) return response
    await cancelStreamBestEffort(response.body)
    current = parseUrl(response.headers.get('location') ?? '', current)
  }
  return null
}

export function parseUrl(raw: string, base?: URL): URL | null {
  try {
    return base ? new URL(raw, base) : new URL(raw)
  } catch {
    return null
  }
}

function isHostInList(hostname: string, hosts: readonly string[]): boolean {
  const host = hostname.toLowerCase()
  for (const entry of hosts) {
    if (host === entry || host.endsWith('.' + entry)) return true
  }
  return false
}
