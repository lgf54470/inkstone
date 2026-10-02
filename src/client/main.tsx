import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/inter.css'
import './styles/app.css'
import { dismissBootScreen, renderBootError } from './lib/boot'
import { initPreloadGuard, setPreloadReloadTimestamp } from './lib/preload-guard'
import { LOCALE_STORAGE_KEY, UI_STORAGE_KEY } from './lib/runtime'
import { installViewportSizing } from './lib/viewport'

installViewportSizing()
initPreloadGuard()

async function start(): Promise<void> {
  try {
    if (import.meta.env.MODE === 'demo') {
      localStorage.removeItem(UI_STORAGE_KEY)
      localStorage.removeItem(LOCALE_STORAGE_KEY)
      const { installDemoRuntime } = await import('./demo/runtime')
      await installDemoRuntime()
    }

    const [{ App }, i18n] = await Promise.all([import('./app'), import('./lib/i18n')])
    await i18n.initI18n()
    const container = document.getElementById('root')
    if (!container) throw new Error(i18n.t('app.missing_root_mount_point'))
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (error) {
    console.error('Failed to initialize application', error)
    dismissBootScreen()
    const container = document.getElementById('root')
    if (container) {
      renderBootError(container, () => {
        setPreloadReloadTimestamp(0)
        window.location.reload()
      })
    }
  }
}

void start()
