import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement, stubBreakpoint } from './lib/test-render'

/**
 * Until now the signed-in boot was strictly serial: `main.tsx` awaited the locale bundles, `App`
 * mounted, and only after `api.session()` resolved *and* `persistSession` had committed an
 * IndexedDB transaction did `AuthedShell` stop rendering an empty div — at which point the shell's
 * own chunk graph (919 KiB gzip measured 2026-10-05) started downloading. The two are independent:
 * nothing about fetching the shell depends on knowing who is signed in.
 *
 * The seam is spied rather than observed through the module registry because `vi.resetModules()`
 * does not re-run a mock's factory for a module already resolved in an earlier case, which made a
 * counting factory blind to the second case no matter what the code did — verified by mutation.
 */
const calls = vi.hoisted(() => ({ prefetch: 0 }))

vi.mock('./lib/boot', async (importOriginal) => {
  const real = await importOriginal<typeof import('./lib/boot')>()
  return {
    ...real,
    prefetchAppShell() {
      calls.prefetch++
    },
  }
})

// A session that never answers keeps `status === 'loading'` for the whole case.
vi.mock('./lib/api', () => ({
  api: {
    session: () => new Promise(() => {}),
    settings: { get: () => new Promise(() => {}) },
  },
}))

vi.mock('./store/pwa', () => ({
  initializePwa: () => {},
  requestOfflineWarmup: () => {},
}))

beforeEach(() => {
  vi.resetModules()
  calls.prefetch = 0
  stubBreakpoint(true)
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('signed-in boot', () => {
  it('starts fetching the shell while the session is still pending', async () => {
    const { App } = await import('./app')
    const rendered = renderElement(createElement(App))

    expect(calls.prefetch).toBe(1)
    rendered.unmount()
  })

  it('does not fetch the shell on a public share page, which never mounts it', async () => {
    window.history.replaceState({}, '', '/s/public-slug')
    const { App } = await import('./app')
    const rendered = renderElement(createElement(App))

    expect(calls.prefetch).toBe(0)
    rendered.unmount()
  })
})
