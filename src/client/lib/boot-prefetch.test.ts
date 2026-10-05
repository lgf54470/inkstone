import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The companion to `app-boot.test.ts`, which pins *when* the shell is prefetched. This one pins
 * *what* is fetched: a seam that counts calls would happily count a call that imports the wrong
 * module, so the fetch itself has to be observed. Counting the mock's factory works here because
 * this is the first and only resolution of `./features/shell` in the file — the reason
 * `app-boot.test.ts` cannot use the same technique is documented there.
 */
const shell = vi.hoisted(() => ({ loads: 0 }))

vi.mock('../features/shell', async () => {
  shell.loads++
  return { AppShell: () => null }
})

beforeEach(() => {
  vi.resetModules()
})

describe('the shell prefetch', () => {
  it('fetches the shell module and swallows nothing else', async () => {
    const { prefetchAppShell } = await import('./boot')
    prefetchAppShell()
    await vi.waitFor(() => expect(shell.loads).toBe(1))
  })

  it('settles even when the chunk cannot be fetched, so a failed prefetch cannot go unhandled', async () => {
    vi.doMock('../features/shell', () => Promise.reject(new Error('chunk gone')))
    const { prefetchAppShell } = await import('./boot')
    // No assertion on purpose: an unhandled rejection fails this file by itself, which is the same
    // mechanism the locale preloader relies on (see the comment in lib/i18n.ts). Reaching the next
    // macrotask without one is the result.
    prefetchAppShell()
    await new Promise(resolve => setTimeout(resolve, 10))
  })
})
