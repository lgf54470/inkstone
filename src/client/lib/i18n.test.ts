import { afterEach, beforeAll, describe, expect, it } from 'vitest'
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
