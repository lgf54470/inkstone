import { describe, expect, it } from 'vitest'
import { LIMITS } from '@shared/constants'
import { initI18n, t } from '../../lib/i18n'
import { isValidCustomSlugFormat } from './share-form'

describe('custom slug format rule (SH-84)', () => {
  it('accepts exactly the shared bounds and rejects either side of them', () => {
    expect(isValidCustomSlugFormat('a'.repeat(LIMITS.shareSlugMinLength))).toBe(true)
    expect(isValidCustomSlugFormat('a'.repeat(LIMITS.shareSlugMinLength - 1))).toBe(false)
    expect(isValidCustomSlugFormat('a'.repeat(LIMITS.shareSlugMaxLength))).toBe(true)
    expect(isValidCustomSlugFormat('a'.repeat(LIMITS.shareSlugMaxLength + 1))).toBe(false)
  })

  it('rejects the characters the server rejects', () => {
    expect(isValidCustomSlugFormat('my note')).toBe(false)
    expect(isValidCustomSlugFormat('my/note')).toBe(false)
    expect(isValidCustomSlugFormat('caf\u00e9-slug')).toBe(false)
    expect(isValidCustomSlugFormat('Project_2026')).toBe(true)
  })

  it('prints the bound from the shared limits, not a second copy of the numbers', async () => {
    await initI18n()
    const message = t('share.custom_slug_invalid', {
      min: LIMITS.shareSlugMinLength,
      max: LIMITS.shareSlugMaxLength,
    })

    expect(message).toContain(`${LIMITS.shareSlugMinLength}-${LIMITS.shareSlugMaxLength}`)
    expect(message).not.toContain('{min}')
    expect(message).not.toContain('{max}')
  })
})
