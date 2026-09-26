import { readResponseBytesWithinLimit, ResponseTooLargeError } from '../../backup/common'
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

// Third-party answers are read as a capped stream instead of being buffered whole:
// nothing upstream says is trusted about its own size, so a body is abandoned the
// moment it passes the cap. An over-long or malformed answer is a failed lookup,
// not a crash, hence null rather than an exception for the caller to translate.
export async function readUpstreamBytes(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  try {
    return await readResponseBytesWithinLimit(response, maxBytes)
  } catch (error) {
    if (error instanceof ResponseTooLargeError) return null
    throw error
  }
}

export async function readUpstreamJson<T>(response: Response, maxBytes: number): Promise<T | null> {
  const bytes = await readUpstreamBytes(response, maxBytes)
  if (!bytes?.byteLength) return null
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    // A body that is not JSON answers the same question as a body with no match in it.
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
