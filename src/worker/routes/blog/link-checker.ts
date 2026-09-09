export interface LinkCheckResult {
  url: string
  status: number | null
  ok: boolean
  level: 'ok' | 'warning' | 'broken' | 'skipped'
  durationMs: number
  error?: string
  finalUrl?: string
}

const TIMEOUT_MS = 8000
const USER_AGENT = 'Mozilla/5.0 (compatible; InkstoneLinkChecker/1.0; +https://github.com/shuaiplus/inkstone)'

function classifyLevel(status: number | null, error?: string): LinkCheckResult['level'] {
  if (error || status === null) return 'broken'
  if (status >= 200 && status < 400) return 'ok'
  if (status >= 400 && status < 500) return 'warning'
  return 'broken'
}

async function fetchWithMethod(url: string, method: 'HEAD' | 'GET'): Promise<Response> {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })
  if (method === 'GET' && res.body) {
    try {
      await res.body.cancel()
    } catch {
      return res
    }
  }
  return res
}

async function probeUrl(url: string): Promise<Response> {
  try {
    const res = await fetchWithMethod(url, 'HEAD')
    if (res.status === 405 || res.status === 403) {
      return await fetchWithMethod(url, 'GET')
    }
    return res
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
    const res = await probeUrl(url)
    const durationMs = Date.now() - start
    const status = res.status
    const finalUrl = res.url && res.url !== url ? res.url : undefined
    const level = classifyLevel(status)
    return { url, status, ok: level === 'ok', level, durationMs, finalUrl }
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
