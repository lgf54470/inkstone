import { t } from '../../i18n'
import type { ExcalidrawVendor, ExcalidrawVendorLoader } from './types'

declare global {
  interface Window {
    /** Where the library looks for the fonts it draws with (see ./loader). */
    EXCALIDRAW_ASSET_PATH?: string
  }
}

/** One `url(...)` entry of a font face's source list, with its format hint dropped. */
function sourceUrl(entry: string): string | null {
  return /url\(\s*['"]?([^'")]+)/i.exec(entry)?.[1] ?? null
}

/** Every source a face may load from, minus the ones a self-hosted app does not serve. */
function localSources(source: string | BufferSource): string | BufferSource {
  if (typeof source !== 'string') return source
  const kept = source.split(/,\s*(?=url\()/i).filter((entry) => {
    const url = sourceUrl(entry)
    if (url === null || url.startsWith('data:')) return true
    try {
      return new URL(url, window.location.href).origin === window.location.origin
    }
    catch {
      return false
    }
  })
  return kept.length > 0 ? kept.join(', ') : source
}

/**
 * The library resolves the fonts it draws with at runtime, and its own answers are a CDN
 * (`https://esm.sh/@excalidraw/...`) plus, for every face it builds, that CDN kept as a
 * fallback source. A self-hosted notebook draws with its own copies instead: our CSP
 * blocks the CDN, and a browser fetches *every* source a face lists — so the fallback
 * would only ever show up as a blocked request per font, on every board.
 *
 * Both answers are therefore settled here, before the library's module is evaluated
 * (which is when it builds those faces, not when a board mounts): the app's own base,
 * and a face wrapper that drops the foreign sources. Vite serves the package's font
 * files from public/fonts in dev and copies them into the build (see vite.config.ts),
 * which is exactly the path the library then asks for.
 */
function prepareExcalidrawFonts(): void {
  window.EXCALIDRAW_ASSET_PATH = import.meta.env.BASE_URL
  const OriginalFontFace = window.FontFace
  window.FontFace = class SameOriginFontFace extends OriginalFontFace {
    constructor(family: string, source: string | BufferSource, descriptors?: FontFaceDescriptors) {
      super(family, localSources(source), descriptors)
    }
  }
}

const VENDOR_LOAD_TIMEOUT_MS = 20000

let vendorPromise: Promise<ExcalidrawVendor> | null = null

/**
 * Loads Excalidraw on demand. The import graph behind ./vendor holds the library, its
 * stylesheet and its fonts, so the first whiteboard block pays for them and a note
 * without one never does; a failure clears the memoized promise so the retry button on
 * the block can try again.
 */
export const loadExcalidrawVendor: ExcalidrawVendorLoader = () => {
  if (!vendorPromise) {
    prepareExcalidrawFonts()
    const loading = withTimeout(
      import('./vendor').then((mod) => mod.createExcalidrawVendor()),
      VENDOR_LOAD_TIMEOUT_MS,
      t('preview.excalidraw_render_failed'),
    )
    vendorPromise = loading
    void loading.catch((err) => {
      if (vendorPromise === loading) vendorPromise = null
      console.warn('[inkstone] whiteboard renderer failed to load', err)
    })
  }
  return vendorPromise
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then((value) => {
      window.clearTimeout(timer)
      resolve(value)
    }, (err) => {
      window.clearTimeout(timer)
      reject(err)
    })
  })
}
