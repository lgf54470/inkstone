import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

// UI-13: a refused copy used to be answered by "nothing happened" (an inline tick that never
// appeared, or a discarded promise). The helper reports both outcomes, so a reader always learns
// that the text is — or is not — on the clipboard.

const toast = vi.fn()

beforeEach(() => {
  toast.mockReset()
})

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, 'clipboard', { value: writeText ? { writeText } : undefined, configurable: true })
}

describe('copyText', () => {
  it('copies and tells the reader it worked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    expect(await copyText('https://example.com/a', toast)).toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://example.com/a')
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }))
  })

  it("uses the caller's own success sentence when it has one", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))

    await copyText('x', toast, 'blog.link_copied')
    expect(toast).toHaveBeenCalledWith({ title: 'blog.link_copied', tone: 'success' })
  })

  it('tells the reader when the clipboard refuses', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))

    expect(await copyText('x', toast)).toBe(false)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }))
  })

  it('reports a missing clipboard API the same way', async () => {
    stubClipboard(undefined)

    expect(await copyText('x', toast)).toBe(false)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }))
  })
})
