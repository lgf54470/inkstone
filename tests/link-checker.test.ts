import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { checkSingleUrl } from '../src/worker/routes/blog/link-checker'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function htmlResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers })
}

describe('link checker outbound safety (real D1)', () => {
  it('blocks private and reserved hostnames before any network call', async () => {
    for (const url of [
      'http://127.0.0.1/x',
      'http://169.254.169.254/latest/meta-data',
      'http://192.168.1.10/x',
      'https://metadata.google.internal/computeMetadata/v1/',
      'http://localhost:3000/x',
    ]) {
      const res = await checkSingleUrl(url)
      expect(res.level, url).toBe('broken')
      expect(res.error, url).toContain('Blocked outbound URL')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps plain http links checkable for friend-link scenarios', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse(200))
    const res = await checkSingleUrl('http://friend.example.com/blog')
    expect(res.level).toBe('ok')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects redirects that land on private networks', async () => {
    fetchMock
      .mockResolvedValue(htmlResponse(301, { Location: 'http://169.254.169.254/latest' }))
    const res = await checkSingleUrl('https://public.example.com/redirector')
    expect(res.level).toBe('broken')
    expect(res.error).toContain('Blocked outbound URL')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('follows public redirect chains and reports the final url', async () => {
    fetchMock
      .mockResolvedValueOnce(htmlResponse(301, { Location: 'https://cdn.example.com/final' }))
      .mockResolvedValueOnce(htmlResponse(200))
    const res = await checkSingleUrl('https://public.example.com/old')
    expect(res.level).toBe('ok')
    expect(res.finalUrl).toBe('https://cdn.example.com/final')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('still skips non-http schemes', async () => {
    const res = await checkSingleUrl('javascript:alert(1)')
    expect(res.level).toBe('skipped')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
