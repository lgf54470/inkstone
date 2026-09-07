import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { Download, ImageOff, X, ZoomIn, ZoomOut } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Tooltip, useDialogFocus, useEscape, useLockScroll } from '../../components/overlay'
import { useUi } from '../../store/ui'
import { t } from '../../lib/i18n'

type ZoomState = Dispatch<SetStateAction<number>>

function clampZoom(scale: number): number {
  return Math.min(6, Math.max(0.3, scale))
}

function handleZoomWheel(setScale: ZoomState, event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  setScale((s) => clampZoom(s - event.deltaY * 0.002))
}

function useLightboxZoom(src: string | null) {
  const [scale, setScale] = useState(1)
  const [isFailed, setIsFailed] = useState(false)
  useLayoutEffect(() => {
    setScale(1)
    setIsFailed(false)
  }, [src])
  useEffect(() => {
    if (!src) return
    const onWheel = (event: WheelEvent) => handleZoomWheel(setScale, event)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [src])
  return { scale, setScale, isFailed, setIsFailed }
}

function ZoomOutButton({ scale, isFailed, onZoomOut }: { scale: number; isFailed: boolean; onZoomOut: () => void }) {
  return (
    <Tooltip label={t('common.zoom_out')} side="bottom">
      <IconButton
        label={t('common.zoom_out')}
        disabled={isFailed || scale <= 0.3}
        onClick={onZoomOut}
        className="text-white/70 hover:bg-white/10 hover:text-white"
      >
        <ZoomOut size={16} />
      </IconButton>
    </Tooltip>
  )
}

function ZoomInButton({ scale, isFailed, onZoomIn }: { scale: number; isFailed: boolean; onZoomIn: () => void }) {
  return (
    <Tooltip label={t('common.zoom_in')} side="bottom">
      <IconButton
        label={t('common.zoom_in')}
        disabled={isFailed || scale >= 6}
        onClick={onZoomIn}
        className="text-white/70 hover:bg-white/10 hover:text-white"
      >
        <ZoomIn size={16} />
      </IconButton>
    </Tooltip>
  )
}

function ZoomPercent({ scale }: { scale: number }) {
  return (
    <span aria-live="polite" className="w-11 text-center text-[length:var(--text-11\\.5)] tabular text-white/60">
      {Math.round(scale * 100)}%
    </span>
  )
}

function DownloadOriginal({ src }: { src: string }) {
  const label = t('preview.download_original_image')
  return (
    <Tooltip label={label} side="bottom">
      <a
        href={src}
        download
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        className="inline-flex size-9 items-center justify-center rounded-[var(--r-md)] text-white/70 transition-colors hover:bg-white/10 hover:text-white md:size-7"
      >
        <Download size={16} />
      </a>
    </Tooltip>
  )
}

function LightboxToolbar({
  src,
  scale,
  isFailed,
  onZoomIn,
  onZoomOut,
  onClose,
}: {
  src: string
  scale: number
  isFailed: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute top-[calc(12px+env(safe-area-inset-top))] right-2 flex items-center gap-1 md:top-4 md:right-4"
      onClick={(e) => e.stopPropagation()}
    >
      <ZoomOutButton scale={scale} isFailed={isFailed} onZoomOut={onZoomOut} />
      <ZoomPercent scale={scale} />
      <ZoomInButton scale={scale} isFailed={isFailed} onZoomIn={onZoomIn} />
      <DownloadOriginal src={src} />
      <Tooltip label={t('common.close')} combo="escape" side="bottom">
        <IconButton label={t('common.close')} onClick={onClose} className="text-white/70 hover:bg-white/10 hover:text-white">
          <X size={17} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

function ImagePane({
  src,
  alt,
  scale,
  isFailed,
  onError,
  onToggleScale,
}: {
  src: string
  alt?: string
  scale: number
  isFailed: boolean
  onError: () => void
  onToggleScale: () => void
}) {
  if (isFailed) {
    return (
      <div
        role="status"
        className="flex max-w-[80vw] flex-col items-center gap-2 rounded-[var(--r-lg)] bg-black/35 px-5 py-4 text-center text-[length:var(--text-12)] text-white/75"
      >
        <ImageOff size={24} />
        {t('preview.could_not_load_image')}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={onError}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={onToggleScale}
      style={{ transform: `scale(${scale})` }}
      className={`max-h-[86vh] max-w-[92vw] rounded-[var(--r-md)] object-contain transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)] ${
        scale === 1 ? 'cursor-zoom-in' : 'cursor-zoom-out'
      }`}
    />
  )
}

function LightboxCaption({ alt }: { alt?: string }) {
  if (!alt) return null
  return (
    <div className="absolute bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 max-w-[82vw] -translate-x-1/2 truncate rounded-full bg-black/50 px-3 py-1.5 text-[length:var(--text-12)] text-white/80 md:bottom-6 md:max-w-[70vw]">
      {alt}
    </div>
  )
}

export function Lightbox() {
  const lightbox = useUi((s) => s.lightbox)
  const setLightbox = useUi((s) => s.setLightbox)
  const panelRef = useRef<HTMLDivElement>(null)
  const { scale, setScale, isFailed, setIsFailed } = useLightboxZoom(lightbox?.src ?? null)
  const close = () => setLightbox(null)
  useEscape(Boolean(lightbox), close)
  useLockScroll(Boolean(lightbox))
  useDialogFocus(Boolean(lightbox), panelRef)
  if (!lightbox) return null
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('preview.image_preview')}
      tabIndex={-1}
      className="app-viewport-fixed anim-fade fixed z-[var(--z-pop)] flex items-center justify-center bg-[oklch(0%_0_0/78%)] outline-none"
      onClick={close}
    >
      <LightboxToolbar
        src={lightbox.src}
        scale={scale}
        isFailed={isFailed}
        onZoomOut={() => setScale((s) => clampZoom(s - 0.25))}
        onZoomIn={() => setScale((s) => clampZoom(s + 0.25))}
        onClose={close}
      />
      <ImagePane
        src={lightbox.src}
        alt={lightbox.alt}
        scale={scale}
        isFailed={isFailed}
        onError={() => setIsFailed(true)}
        onToggleScale={() => setScale((s) => (s === 1 ? 2 : 1))}
      />
      <LightboxCaption alt={lightbox.alt} />
    </div>,
    document.body,
  )
}
