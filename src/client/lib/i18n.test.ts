import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, setLocale, t, translateApiError, translateServiceMessage } from './i18n'

describe('API error codes', () => {
  beforeAll(async () => {
    await initI18n()
  })

  afterEach(async () => {
    await setLocale('en-US', false)
  })

  // A music failure carries its own code, so the reader gets the reason it actually hit:
  // borrowing the generic sentence for that status rewrote the story (a full playlist came
  // back as "the content is too large", a taken tag name as "refresh and try again").
  it('names the reason behind the code instead of borrowing the generic sentence', async () => {
    await setLocale('zh-CN', false)
    expect(translateApiError('playlist_full', 'This playlist is full')).toBe(t('api.error.playlist_full'))
    expect(translateApiError('playlist_full', 'This playlist is full')).not.toBe(t('api.error.payload_too_large'))
    expect(translateApiError('media_too_large', 'The media file exceeds the 64 MB limit')).toBe(t('api.error.media_too_large'))
    expect(translateApiError('storage_quota_reached', 'The music storage quota has been reached')).toBe(t('api.error.storage_quota_reached'))
    expect(translateApiError('tag_name_taken', 'A tag with this name already exists')).toBe(t('api.error.tag_name_taken'))
    expect(translateApiError('tag_name_taken', 'A tag with this name already exists')).not.toBe(t('api.error.conflict'))
  })

  // The fallback stays for codes nobody wrote copy for; what it must not do is swallow a
  // code that does have copy, which is how these music failures reached a generic sentence.
  it('leaves a code with no copy of its own to the service fallback', async () => {
    await setLocale('zh-CN', false)
    expect(translateApiError('not_found', 'Nope')).toBe(t('api.error.not_found'))
    expect(translateApiError('brand_new_code', 'Nope')).toBe(translateServiceMessage('Nope'))
  })
})

// The other locale is preloaded in the background so switching it is instant. That preload is
// best-effort: it is a dynamic import, it can reject (a chunk missing under memory pressure), and
// nobody awaits it — so a rejection it does not handle surfaces as the *run's* failure rather than
// as a page that lost a head start (SH-94).
describe('the background locale preload (SH-94)', () => {
  it('keeps a rejected preload from reaching the caller as an unhandled rejection', async () => {
    vi.resetModules()
    const probe = await import('./i18n')
    const pending = probe.getLocale() === 'en-US' ? 'zh-CN' : 'en-US'
    vi.doMock(`@shared/locales/${pending}`, () => {
      throw new Error('locale chunk unavailable')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fresh = await import('./i18n')
      await expect(fresh.initI18n()).resolves.toBeUndefined()
      expect(fresh.getLocale()).toBe(probe.getLocale())
      // The preload is floating, so its rejection is handled a microtask after init resolves — the
      // assertion waits for that turn rather than for the page to finish: the point is that the
      // failure lands in the log and nowhere else.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(warn.mock.calls.flat().join(' ')).toContain(pending)
    }
    finally {
      vi.doUnmock(`@shared/locales/${pending}`)
      vi.resetModules()
    }
  })
})
