// FB2-C1: the online half of the music library used to have no browser assertion at all — M14
// recorded "needs a real third-party catalogue" as a known limitation, and that is the gap the
// payload-too-large regression lived in: the page asked for a hit, the worker refused the body, and
// nothing in CI ever pressed the button. What this replaces the catalogue with is request
// interception, not a dependency: the four endpoints the *page* talks to answer from here, so the
// render and the presses are exercised against the app's own code path.
//
// The import endpoint is deliberately NOT stubbed. That is the half the fixture has to leave real:
// the worker resolves the artwork and the words by fetching the catalogue itself, which from inside
// this sandbox cannot be reached — so the check below reads the degradation honestly (the row lands,
// without a picture) instead of pretending a third party answered.
//
// The play URL is answered with the app's own stream of the probe track: `media-src` in the CSP
// does not allow a `data:` URL, and a playable same-origin stream is what the preview is for.
export const PROVIDER_STUB_HITS = [
  { title: 'Stub Hit One', artist: 'Stub Artist', album: 'Stub Album', durationMs: 214_000, sourceId: 'stub-1' },
  // A second hit with no length, because the two rules this screen has to keep are "a reported
  // length is drawn" and "an absent one is not named".
  { title: 'Stub Hit Two', artist: 'Stub Artist', album: 'Stub Album', durationMs: null, sourceId: 'stub-2' },
]

const STUB_COVER_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

/**
 * Answers the page-facing provider endpoints from memory and hands back what was asked for, so a
 * scenario can assert the presses rather than only the pixels. `playUrl` is a same-origin stream the
 * preview can really open.
 */
export async function installMusicProviderStub(page, { playUrl }) {
  const calls = []
  await page.setRequestInterception(true)
  const onRequest = (request) => {
    const url = request.url()
    const respond = (body, contentType) => request.respond({ status: 200, contentType, body })
    if (url.includes('/api/music/provider/search')) {
      calls.push({ endpoint: 'search', url })
      return respond(JSON.stringify({
        results: PROVIDER_STUB_HITS.map((hit) => ({
          provider: 'gds', source: 'netease', sourceId: hit.sourceId, title: hit.title,
          artist: hit.artist, album: hit.album, durationMs: hit.durationMs,
          coverId: `${hit.sourceId}-cover`, lyricId: `${hit.sourceId}-lyric`,
        })),
      }), 'application/json')
    }
    if (url.includes('/api/music/provider/url')) {
      calls.push({ endpoint: 'url', url })
      return respond(JSON.stringify({ url: playUrl }), 'application/json')
    }
    if (url.includes('/api/music/provider/lyric')) {
      calls.push({ endpoint: 'lyric', url })
      return respond(JSON.stringify({ lyric: '' }), 'application/json')
    }
    if (url.includes('/api/music/provider/cover')) {
      calls.push({ endpoint: 'cover', url })
      return request.respond({ status: 200, contentType: 'image/png', body: Buffer.from(STUB_COVER_PNG, 'base64') })
    }
    // The import is left real — the worker runs it — and only *read* here: the body the page sends is
    // the regression's own evidence, and a stub that answered it would hide exactly that.
    if (url.includes('/tracks/import-provider')) {
      const postData = request.postData() ?? ''
      let shape = {}
      try {
        shape = JSON.parse(postData)
      } catch {
        shape = { unparsable: postData.slice(0, 80) }
      }
      calls.push({ endpoint: 'import', url, bytes: Buffer.byteLength(postData), shape })
    }
    return request.continue()
  }
  page.on('request', onRequest)
  return {
    calls,
    endpoints: () => calls.map((call) => call.endpoint),
    stop: async () => {
      // Interception goes first: with the listener gone and interception still on, a request arriving
      // in that window would have nothing to continue it and the page would simply wait.
      await page.setRequestInterception(false)
      page.off('request', onRequest)
    },
  }
}
