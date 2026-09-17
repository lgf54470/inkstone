import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUi } from '../../../../store/ui'
import { t } from '../../../i18n'
import { copySlidesLink } from './copy-link'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function stubClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

beforeEach(() => {
  useUi.setState({ toasts: [] })
})

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  vi.restoreAllMocks()
})

describe('copying the deck link', () => {
  it('copies the current address and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard({ writeText })

    await expect(copySlidesLink()).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(useUi.getState().toasts.map((toast) => toast.title)).toEqual([
      t('slides.share_copied'),
    ])
  })

  it('reports a refused clipboard instead of failing silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })

    await expect(copySlidesLink()).resolves.toBe(false)
    expect(useUi.getState().toasts.map((toast) => toast.title)).toEqual([
      t('slides.share_failed'),
    ])
    expect(warn).toHaveBeenCalled()
  })

  it('reports a browser without the clipboard API', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    stubClipboard(undefined)

    await expect(copySlidesLink()).resolves.toBe(false)
    expect(useUi.getState().toasts.map((toast) => toast.title)).toEqual([
      t('slides.share_failed'),
    ])
    expect(warn).toHaveBeenCalled()
  })
})
