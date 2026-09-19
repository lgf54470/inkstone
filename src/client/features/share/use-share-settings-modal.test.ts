import { describe, expect, it } from 'vitest'
import { parseCleanDays } from './use-share-settings-modal'

describe('parseCleanDays', () => {
  it('accepts positive integer retention days', () => {
    expect(parseCleanDays('30')).toBe(30)
    expect(parseCleanDays('1')).toBe(1)
  })

  it('rejects Keep Forever (0) so older_than cleanup cannot wipe every log', () => {
    expect(parseCleanDays('0')).toBeNull()
  })

  it('rejects negative and unparseable values', () => {
    expect(parseCleanDays('-5')).toBeNull()
    expect(parseCleanDays('abc')).toBeNull()
    expect(parseCleanDays('')).toBeNull()
  })
})
