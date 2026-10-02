import { describe, expect, it, vi } from 'vitest'
import {
  handlePreloadError,
  getPreloadReloadTimestamp,
  setPreloadReloadTimestamp,
  PRELOAD_RELOAD_KEY,
  RELOAD_COOLDOWN_MS,
  initPreloadGuard,
} from './preload-guard'

describe('preload-guard', () => {
  function createMockStorage(): Storage {
    const store = new Map<string, string>()
    return {
      getItem: vi.fn((k: string) => store.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => store.set(k, v)),
      removeItem: vi.fn((k: string) => store.delete(k)),
      clear: vi.fn(() => store.clear()),
      key: vi.fn((i: number) => Array.from(store.keys())[i] ?? null),
      get length() {
        return store.size
      },
    }
  }

  it('triggers reload and records timestamp on first preload error', () => {
    const storage = createMockStorage()
    const reload = vi.fn()
    const onDismissBoot = vi.fn()
    const event = new Event('vite:preloadError')
    const now = 100000

    const reloaded = handlePreloadError(event, {
      now: () => now,
      reload,
      storage,
      onDismissBoot,
    })

    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.setItem).toHaveBeenCalledWith(PRELOAD_RELOAD_KEY, String(now))
    expect(onDismissBoot).not.toHaveBeenCalled()
  })

  it('suppresses reload and dismisses boot screen when called within cooldown window', () => {
    const storage = createMockStorage()
    const reload = vi.fn()
    const onDismissBoot = vi.fn()
    const event = new Event('vite:preloadError')
    const firstTime = 100000
    storage.setItem(PRELOAD_RELOAD_KEY, String(firstTime))

    const reloaded = handlePreloadError(event, {
      now: () => firstTime + 2000,
      reload,
      storage,
      onDismissBoot,
    })

    expect(reloaded).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(onDismissBoot).toHaveBeenCalledTimes(1)
  })

  it('allows reload again after cooldown has elapsed', () => {
    const storage = createMockStorage()
    const reload = vi.fn()
    const onDismissBoot = vi.fn()
    const event = new Event('vite:preloadError')
    const firstTime = 100000
    storage.setItem(PRELOAD_RELOAD_KEY, String(firstTime))

    const secondTime = firstTime + RELOAD_COOLDOWN_MS + 100
    const reloaded = handlePreloadError(event, {
      now: () => secondTime,
      reload,
      storage,
      onDismissBoot,
    })

    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.setItem).toHaveBeenCalledWith(PRELOAD_RELOAD_KEY, String(secondTime))
    expect(onDismissBoot).not.toHaveBeenCalled()
  })

  it('handles throwing storage gracefully without crashing', () => {
    const restrictedStorage = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError: access denied')
      }),
      setItem: vi.fn(() => {
        throw new Error('SecurityError: access denied')
      }),
      removeItem: vi.fn(() => {
        throw new Error('SecurityError: access denied')
      }),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    }
    const reload = vi.fn()
    const onDismissBoot = vi.fn()
    const event = new Event('vite:preloadError')

    expect(getPreloadReloadTimestamp(restrictedStorage)).toBe(0)
    expect(() => setPreloadReloadTimestamp(12345, restrictedStorage)).not.toThrow()

    const reloaded = handlePreloadError(event, {
      now: () => 50000,
      reload,
      storage: restrictedStorage,
      onDismissBoot,
    })

    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('removes item when setPreloadReloadTimestamp is called with 0', () => {
    const storage = createMockStorage()
    storage.setItem(PRELOAD_RELOAD_KEY, '99999')

    setPreloadReloadTimestamp(0, storage)
    expect(storage.removeItem).toHaveBeenCalledWith(PRELOAD_RELOAD_KEY)
    expect(getPreloadReloadTimestamp(storage)).toBe(0)
  })

  it('registers and unregisters window event listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const cleanup = initPreloadGuard()
    expect(addSpy).toHaveBeenCalledWith('vite:preloadError', expect.any(Function))

    cleanup()
    expect(removeSpy).toHaveBeenCalledWith('vite:preloadError', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
