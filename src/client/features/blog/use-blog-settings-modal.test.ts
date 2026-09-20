import { describe, expect, it } from 'vitest'
import { parseBlogCleanDays } from './use-blog-settings-modal'

describe('parseBlogCleanDays (SH-43)', () => {
  it('accepts positive integer retention days', () => {
    expect(parseBlogCleanDays('30')).toBe(30)
    expect(parseBlogCleanDays('1')).toBe(1)
  })

  it('rejects Keep Forever (0) so older_than cleanup cannot wipe every log', () => {
    expect(parseBlogCleanDays('0')).toBeNull()
  })

  it('rejects negative and unparseable values', () => {
    expect(parseBlogCleanDays('-5')).toBeNull()
    expect(parseBlogCleanDays('abc')).toBeNull()
    expect(parseBlogCleanDays('')).toBeNull()
  })
})
