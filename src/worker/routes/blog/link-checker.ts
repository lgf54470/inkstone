export interface LinkCheckResult {
  url: string
  status: number | null
  ok: boolean
  level: 'ok' | 'warning' | 'broken' | 'skipped'
  durationMs: number
  error?: string
  finalUrl?: string
}

import { isAllowedOutboundUrl } from '../../lib/outbound-url'

const TIMEOUT_MS = 8000
const MAX_REDIRECTS = 4
const USER_AGENT = 'Mozilla/5.0 (compatible; InkstoneLinkChecker/1.0; +https://github.com/shuaiplus/inkstone)'

function classifyLevel(status: number | null, error?: string): LinkCheckResult['level'] {
  if (error || status === null) return 'broken'
  if (status >= 200 && status < 400) return 'ok'
  if (status >= 400 && status < 500) return 'warning'
  return 'broken'
}

// Every hop is re-validated, so a public URL cannot redirect the checker
// into private or reserved networks; relative redirects resolve against the
// current hop. The caller receives the first non-redirect response.
async function fetchWithMethod(rawUrl: string, method: 'HEAD' | 'GET'): Promise<{ res: Response; finalUrl: string }> {
  let current = new URL(rawUrl)
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    if (!isAllowedOutboundUrl(current, { allowHttp: true })) {
      throw new Error('Blocked outbound URL (private or reserved network)')
    }
    const res = await fetch(current, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    const isRedirect = res.status >= 300 && res.status < 400 && res.headers.get('location')
    if (!isRedirect) {
      await releaseBody(method, res)
      return { res, finalUrl: current.toString() }
    }
    await releaseBody(method, res)
    current = new URL(isRedirect, current)
  }
  throw new Error('Too many redirects')
}

async function releaseBody(method: 'HEAD' | 'GET', res: Response): Promise<void> {
  if (method !== 'GET' || !res.body) return
  await cancelBodyQuietly(res.body)
}

async function cancelBodyQuietly(body: ReadableStream): Promise<void> {
  try {
    await body.cancel()
  } catch {
    // Best-effort body release; a failed cancel does not change the verdict.
  }
}

async function probeUrl(url: string): Promise<{ res: Response; finalUrl: string }> {
  try {
    const head = await fetchWithMethod(url, 'HEAD')
    if (head.res.status === 405 || head.res.status === 403) {
      return await fetchWithMethod(url, 'GET')
    }
    return head
  } catch {
    return await fetchWithMethod(url, 'GET')
  }
}

function formatCheckError(err: unknown, url: string, durationMs: number): LinkCheckResult {
  const e = err as Error
  let errorMsg = e.message || 'Unknown network error'
  if (e.name === 'TimeoutError' || e.name === 'AbortError') {
    errorMsg = `Timeout (${TIMEOUT_MS / 1000}s)`
  }
  return { url, status: null, ok: false, level: 'broken', durationMs, error: errorMsg }
}

export async function checkSingleUrl(url: string): Promise<LinkCheckResult> {
  const start = Date.now()
  if (!/^https?:\/\//i.test(url)) {
    return { url, status: null, ok: false, level: 'skipped', durationMs: 0, error: 'Invalid HTTP(S) URL' }
  }

  try {
    const { res, finalUrl } = await probeUrl(url)
    const durationMs = Date.now() - start
    const status = res.status
    const level = classifyLevel(status)
    return { url, status, ok: level === 'ok', level, durationMs, finalUrl: finalUrl !== url ? finalUrl : undefined }
  } catch (err: unknown) {
    return formatCheckError(err, url, Date.now() - start)
  }
}

export async function checkUrlsBatch(urls: string[]): Promise<LinkCheckResult[]> {
  const batch = urls.slice(0, 15)
  const settled = await Promise.allSettled(batch.map((u) => checkSingleUrl(u)))
  return settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value
    return {
      url: batch[i],
      status: null,
      ok: false,
      level: 'broken' as const,
      durationMs: 0,
      error: (s.reason as Error)?.message || 'Check failed',
    }
  })
}
