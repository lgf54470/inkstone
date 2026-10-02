import { dismissBootScreen } from './boot'

export const PRELOAD_RELOAD_KEY = 'inkstone:preload-reload'
export const RELOAD_COOLDOWN_MS = 15000

function safeSessionStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

export function getPreloadReloadTimestamp(storage: Storage | null = safeSessionStorage()): number {
  if (!storage) return 0
  try {
    return Number(storage.getItem(PRELOAD_RELOAD_KEY) || 0)
  } catch {
    return 0
  }
}

export function setPreloadReloadTimestamp(
  value: number,
  storage: Storage | null = safeSessionStorage(),
): void {
  if (!storage) return
  try {
    if (value === 0) {
      storage.removeItem(PRELOAD_RELOAD_KEY)
    } else {
      storage.setItem(PRELOAD_RELOAD_KEY, String(value))
    }
  } catch {
    return
  }
}

export function handlePreloadError(
  event: Event,
  deps: {
    now?: () => number
    reload?: () => void
    storage?: Storage | null
    onDismissBoot?: () => void
  } = {},
): boolean {
  const now = deps.now ? deps.now() : Date.now()
  const reload = deps.reload ?? (() => window.location.reload())
  const storage = deps.storage !== undefined ? deps.storage : safeSessionStorage()
  const onDismissBoot = deps.onDismissBoot ?? dismissBootScreen

  const lastReload = getPreloadReloadTimestamp(storage)
  if (now - lastReload > RELOAD_COOLDOWN_MS) {
    setPreloadReloadTimestamp(now, storage)
    reload()
    return true
  }

  console.error('Dynamic module preload failed after reload', event)
  onDismissBoot()
  return false
}

export function initPreloadGuard(): () => void {
  const listener = (event: Event) => {
    handlePreloadError(event)
  }
  window.addEventListener('vite:preloadError', listener)
  return () => window.removeEventListener('vite:preloadError', listener)
}
