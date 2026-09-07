import { lazy, Suspense, useEffect, useState } from 'react'
import { ConfirmHost } from './components/overlay'
import { Toaster } from './components/feedback'
import { Spinner } from './components/primitives'
import { ErrorBoundary } from './components/error-boundary'
import { LoginPage } from './features/auth'
import { dismissBootScreen } from './lib/boot'
import { t, useLocale } from './lib/i18n'
import { initializePwa, requestOfflineWarmup } from './store/pwa'
import { useSession, watchSystemTheme } from './store/session'

const AppShell = lazy(() =>
  import('./features/shell').then((module) => ({ default: module.AppShell })),
)
const SharePage = lazy(() =>
  import('./features/share/share-page').then((module) => ({ default: module.SharePage })),
)

function useShareSlug(): string | null {
  const [shareSlug] = useState(() => {
    const match = /^\/s\/([A-Za-z0-9_-]+)/.exec(location.pathname)
    return match?.[1] ?? null
  })
  return shareSlug
}

function useAppBoot(shareSlug: string | null) {
  const status = useSession((s) => s.status)
  const load = useSession((s) => s.load)

  useEffect(() => {
    if (shareSlug) return
    void load()
  }, [load, shareSlug])

  useEffect(() => watchSystemTheme(), [])

  useEffect(() => {
    initializePwa()
  }, [])

  useEffect(() => {
    if (!shareSlug && status !== 'loading') requestOfflineWarmup()
  }, [shareSlug, status])

  useEffect(() => {
    if (shareSlug || status !== 'loading') dismissBootScreen()
  }, [status, shareSlug])

  useEffect(() => {
    if (shareSlug) return
    const timer = window.setTimeout(() => dismissBootScreen(), 8000)
    return () => window.clearTimeout(timer)
  }, [shareSlug])
}

function PageFallback() {
  return (
    <div
      role='status'
      aria-label={t('common.loading')}
      className='flex h-full items-center justify-center bg-[var(--bg-base)] text-[var(--text-tertiary)]'
    >
      <Spinner size={18} />
    </div>
  )
}

function ShareRoute({ slug }: { slug: string }) {
  return (
    <>
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>
          <SharePage slug={slug} />
        </Suspense>
      </ErrorBoundary>
      <Toaster />
    </>
  )
}

function AuthedShell() {
  const status = useSession((s) => s.status)
  return (
    <ErrorBoundary>
      {status === 'loading' && <div className='h-full' />}
      {status === 'anonymous' && <LoginPage />}
      {status === 'authed' && (
        <Suspense fallback={<PageFallback />}>
          <AppShell />
        </Suspense>
      )}
    </ErrorBoundary>
  )
}

export function App() {
  useLocale()
  const shareSlug = useShareSlug()
  useAppBoot(shareSlug)

  if (shareSlug) {
    return (
      <>
        <ShareRoute slug={shareSlug} />
        <ConfirmHost />
      </>
    )
  }

  return (
    <>
      <AuthedShell />
      <Toaster />
      <ConfirmHost />
    </>
  )
}
