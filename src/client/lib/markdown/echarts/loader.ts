import { t } from '../../i18n'
import { withTimeout } from '../../async'

const VENDOR_LOAD_TIMEOUT_MS = 15000

let vendorPromise: Promise<typeof import('./vendor')> | null = null

/**
 * Loads echarts on demand. The import graph behind ./vendor holds the whole library, so the first
 * echarts block in a session pays for it and a note without one never does; a failure clears the
 * memoized promise so the block's own retry can try again.
 */
export function loadEcharts(): Promise<typeof import('./vendor')> {
  if (!vendorPromise) {
    const loading = withTimeout(import('./vendor'), VENDOR_LOAD_TIMEOUT_MS, t('markdown.echarts_render_failed'))
    vendorPromise = loading
    void loading.catch((err) => {
      if (vendorPromise === loading) vendorPromise = null
      console.warn(t('markdown.echarts_render_failed'), err)
    })
  }
  return vendorPromise
}
