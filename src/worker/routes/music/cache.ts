// A cached public response outlives the switch that turned it off: unpublishing the library, or
// revoking a playlist link, is checked in the request handler and never reaches into a cache. So
// these windows are the revocation window of the public music surfaces, and they are stated once
// here rather than guessed at each call site — the listing re-derives its publish state within a
// minute, playback within five, and artwork within the hour. The app's own surfaces stay
// `private`: they are answers to one signed-in account, not to whoever asks.
export const MUSIC_PUBLIC_CACHE = {
  listing: 'public, max-age=15, s-maxage=60, stale-while-revalidate=60',
  stream: 'public, max-age=60, s-maxage=300',
  cover: 'public, max-age=600, s-maxage=3600',
} as const
