import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIMITS } from '@shared/constants'
import { capStreamBytes, fetchMusicUpstream, parseMusicUpstreamUrl } from './upstream'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// FB-S3: the address comes from the catalogue, the upstream's answer or the user's own reference
// row, so it is checked here rather than trusted. `global_fetch_strictly_public` is a backstop, not
// a policy: the policy is that this worker reaches public addresses only.
describe('the proxy only streams addresses it may reach (FB-S3)', () => {
  it('accepts a public https address', () => {
    expect(parseMusicUpstreamUrl('https://cdn.example.net/a.mp3', false).hostname).toBe('cdn.example.net')
  })

  it('accepts a public http address when the caller says the source is a direct link', () => {
    expect(parseMusicUpstreamUrl('http://files.example.net/a.mp3', true).protocol).toBe('http:')
  })

  it('refuses an https-only source served over http', () => {
    expect(() => parseMusicUpstreamUrl('http://files.example.net/a.mp3', false)).toThrow()
  })

  it('refuses the private networks a hostile catalogue could name', () => {
    for (const url of [
      'http://127.0.0.1/a.mp3',
      'http://192.168.1.10/a.mp3',
      'https://10.0.0.5/a.mp3',
      'http://localhost/a.mp3',
      'http://nas.local/a.mp3',
      'http://metadata.google.internal/x',
      'http://[::1]/a.mp3',
    ]) {
      expect(() => parseMusicUpstreamUrl(url, true)).toThrow()
    }
  })

  it('refuses an address that is not a URL at all', () => {
    expect(() => parseMusicUpstreamUrl('not a url', true)).toThrow()
  })
})

// FB-S1: what is bounded is the wait for the response head, not the transfer — a song streams for
// minutes, and a signal left armed would cut the body off mid-note. The timer is cleared the moment
// the answer arrives.
describe('the wait for the response head is bounded (FB-S1)', () => {
  it('gives up on a fetch that never answers', async () => {
    vi.useFakeTimers()
    // A real fetch rejects with an `AbortError` when its signal aborts; the stub has to do the same
    // or the test would only be proving that a promise nobody settles stays unsettled.
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const pending = fetchMusicUpstream('https://cdn.example.net/a.mp3')
    const assertion = expect(pending).rejects.toThrow(/took too long/)
    await vi.advanceTimersByTimeAsync(LIMITS.musicStreamConnectTimeoutMs + 1)
    await assertion
  })

  it('leaves nothing armed once the head has arrived', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream())))
    const response = await fetchMusicUpstream('https://cdn.example.net/a.mp3')
    expect(response.body).not.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})

// FB-S1: nothing upstream claims about its own length is trusted, so the count is kept here — a
// runaway body fails the stream instead of being forwarded whole.
describe('a runaway upstream is cut off (FB-S1)', () => {
  it('errors the stream once the cap is crossed', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600))
        controller.enqueue(new Uint8Array(600))
        controller.close()
      },
    })
    const reader = capStreamBytes(source, 1000)!.getReader()
    expect((await reader.read()).value?.byteLength).toBe(600)
    await expect(reader.read()).rejects.toThrow(/byte cap/)
  })

  it('passes a body inside the cap through untouched', async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10))
        controller.close()
      },
    })
    const reader = capStreamBytes(source, 1000)!.getReader()
    const chunks: number[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value.byteLength)
    }
    expect(chunks).toEqual([10])
  })

  it('answers a missing body with a missing body', () => {
    expect(capStreamBytes(null, 10)).toBeNull()
  })
})
