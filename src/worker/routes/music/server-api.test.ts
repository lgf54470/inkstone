import { afterEach, describe, expect, it, vi } from 'vitest'
import { musicServerPlayTarget, probeMusicServer, registerMusicServer, searchMusicServer, type MusicServerTarget } from './server-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

// Every adapter call is a request to the reader's own server, so the recorded call is the contract:
// what the protocol needs in the URL, in the body and in the headers.
function stubFetch(answers: Array<{ status?: number; body?: unknown }>): string[] {
  const seen: string[] = []
  const calls = [...answers]
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(`${init?.method ?? 'GET'} ${String(input)}`)
    const answer = calls.shift() ?? { status: 200, body: {} }
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }))
  return seen
}

function subsonic(overrides: Partial<MusicServerTarget> = {}): MusicServerTarget {
  return { kind: 'subsonic', url: 'https://music.example.com', username: 'owner', secret: 'secret', upstreamUserId: null, ...overrides }
}

function jellyfin(overrides: Partial<MusicServerTarget> = {}): MusicServerTarget {
  return { kind: 'jellyfin', url: 'https://jelly.example.com', username: 'owner', secret: 'token', upstreamUserId: 'u-1', ...overrides }
}

const OK = { 'subsonic-response': { status: 'ok' } }

describe('subsonic registration (FB-M16)', () => {
  it('verifies a registration and keeps the password as the credential', async () => {
    const seen = stubFetch([{ body: OK }])
    const registration = await registerMusicServer({ kind: 'subsonic', url: 'https://music.example.com/', username: 'owner', password: 'secret' })
    expect(registration).toEqual({ record: { password: 'secret' }, upstreamUserId: null })
    // The trailing slash the reader typed is not doubled, and the protocol's own parameters are all
    // there — the password as hex, because that is the form this Worker can produce (see the adapter).
    // The colon the protocol writes after `enc` is percent-encoded by the query builder and decoded
    // by the server, which is the same parameter value either way.
    expect(seen[0]).toBe('GET https://music.example.com/rest/ping.view?u=owner&p=enc%3A736563726574&v=1.16.1&c=Inkstone&f=json')
  })

  it('refuses a registration the server itself rejects', async () => {
    stubFetch([{ body: { 'subsonic-response': { status: 'failed', error: { code: 40, message: 'Wrong username or password' } } } }])
    await expect(registerMusicServer({ kind: 'subsonic', url: 'https://music.example.com', username: 'owner', password: 'nope' }))
      .rejects.toMatchObject({ status: 400, code: 'bad_request' })
  })
})

describe('subsonic search and playback (FB-M16)', () => {

  it('normalizes a search answer, dropping entries without an id or a title', async () => {
    stubFetch([{
      body: {
        'subsonic-response': {
          status: 'ok',
          searchResult3: {
            song: [
              { id: '1', title: 'Nightfall', artist: 'Zoe', album: 'First Light', duration: 245 },
              { id: '', title: 'No id', duration: 10 },
              { id: '3', title: '', duration: 10 },
              { id: '4', title: 'No duration' },
            ],
          },
        },
      },
    }])
    const hits = await searchMusicServer(subsonic(), 'night')
    expect(hits).toEqual([
      { itemId: '1', title: 'Nightfall', artist: 'Zoe', album: 'First Light', durationMs: 245_000 },
      { itemId: '4', title: 'No duration', artist: '', album: '', durationMs: null },
    ])
  })

  it('builds a play address carrying the item and no headers', () => {
    const target = musicServerPlayTarget(subsonic(), '42')
    expect(target.url).toContain('/rest/stream.view?')
    expect(target.url).toContain('id=42')
    expect(target.headers).toEqual({})
    expect(target.allowHttp).toBe(false)
  })

  it('refuses a private address without asking it anything', async () => {
    const seen = stubFetch([{ body: OK }])
    await expect(probeMusicServer(subsonic({ url: 'http://192.168.1.5' }))).rejects.toMatchObject({ status: 502 })
    expect(seen).toEqual([])
  })
})

describe('jellyfin adapter (FB-M16)', () => {
  it('trades the password for a session token and keeps the user id out of the secret', async () => {
    const seen = stubFetch([{ body: { AccessToken: 'sess-1', User: { Id: 'u-9' } } }])
    const registration = await registerMusicServer({ kind: 'jellyfin', url: 'https://jelly.example.com', username: 'owner', password: 'pw' })
    expect(registration).toEqual({ record: { token: 'sess-1' }, upstreamUserId: 'u-9' })
    expect(seen[0]).toBe('POST https://jelly.example.com/Users/AuthenticateByName')
  })

  it('probes the stored token rather than the password it no longer has', async () => {
    const seen = stubFetch([{ body: { Id: 'u-9' } }])
    await probeMusicServer(jellyfin())
    expect(seen[0]).toBe('GET https://jelly.example.com/Users/Me')
  })

  it('names the user its search belongs to and maps ticks to milliseconds', async () => {
    const seen = stubFetch([{
      body: {
        Items: [
          { Id: 'a', Name: 'Nightfall', Album: 'First Light', Artists: ['Zoe', 'Ann'], RunTimeTicks: 245_000_000 },
          { Id: 'b', Name: '', RunTimeTicks: 1 },
        ],
      },
    }])
    const hits = await searchMusicServer(jellyfin(), 'night')
    expect(hits).toEqual([{ itemId: 'a', title: 'Nightfall', artist: 'Zoe, Ann', album: 'First Light', durationMs: 24_500 }])
    expect(seen[0]).toContain('userId=u-1')
    expect(seen[0]).toContain('IncludeItemTypes=Audio')
  })

  it('keeps the token in a header, never in the address', () => {
    const target = musicServerPlayTarget(jellyfin(), 'item/1')
    expect(target.url).toBe('https://jelly.example.com/Audio/item%2F1/stream?static=true')
    expect(target.url).not.toContain('token')
    expect(target.headers['X-Emby-Token']).toBe('token')
    expect(target.headers['X-Emby-Authorization']).toContain('Inkstone')
  })
})
