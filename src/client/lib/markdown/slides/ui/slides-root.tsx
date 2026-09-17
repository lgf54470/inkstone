import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type {
  BentoDoc,
  ShapeType,
  Slide,
  SlideElement,
  SlidesTheme,
} from '../types'
import { useSlidesHistory } from '../history'
import { SlidesCanvas } from './slides-canvas'
import { SlidesTopbar } from './slides-topbar'
import { SlidesSidebar } from './slides-sidebar'
import { SlidesInspector } from './slides-inspector'
import { SlidesPresenter } from './slides-presenter'
import { SlidesHelpDialog } from './slides-help-dialog'
import { SlidesSettingsDialog } from './slides-settings-dialog'
import { SlidesInlinePreview } from './slides-inline-preview'
import { copySlidesLink } from './copy-link'
import {
  createDefaultChart,
  createDefaultCode,
  createDefaultImage,
  createDefaultShape,
  createDefaultTable,
  createDefaultText,
} from './element-factories'
import { t } from '../../../i18n'

interface SlidesRootProps {
  initialData: BentoDoc
  isFullscreen?: boolean
  /** Whether every edit has reached the note; undefined on a surface without a save control. */
  isSaved?: boolean
  onSave?: () => void
  onUpdateData: (data: BentoDoc) => void
  onToggleFullscreen?: () => void
}

export const SlidesRoot = memo(function SlidesRoot({
  initialData,
  isFullscreen = false,
  isSaved,
  onSave,
  onUpdateData,
  onToggleFullscreen,
}: SlidesRootProps) {
  const { data, commitData, undo, redo, canUndo, canRedo } = useSlidesHistory(
    initialData,
    onUpdateData,
  )

  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [activeElementId, setActiveElementId] = useState<string | null>(null)
  const [isPresentationMode, setIsPresentationMode] = useState(false)
  const [openDialog, setOpenDialog] = useState<'settings' | 'help' | null>(null)
  const [zoom, setZoom] = useState(1)
  const [inlineScale, setInlineScale] = useState(0.5)
  const inlineContainerRef = useRef<HTMLDivElement>(null)

  const slides = data.slides
  const activeSlide = slides[activeSlideIndex] || slides[0]

  useEffect(() => {
    if (!isFullscreen && inlineContainerRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width
          if (w > 0) setInlineScale(Math.min(w / data.size.width, 1))
        }
      })
      observer.observe(inlineContainerRef.current)
      return () => observer.disconnect()
    }
  }, [data.size.width, isFullscreen])

  const handleUpdateSlide = useCallback(
    (patch: Partial<Slide>) => {
      if (!activeSlide) return
      const nextSlides = slides.map((s, idx) =>
        idx === activeSlideIndex ? { ...s, ...patch } : s,
      )
      commitData({ ...data, slides: nextSlides })
    },
    [activeSlide, activeSlideIndex, commitData, data, slides],
  )

  const handleUpdateElement = useCallback(
    (elId: string, patch: Partial<SlideElement>) => {
      if (!activeSlide) return
      const nextElements = activeSlide.elements.map((el) =>
        el.id === elId ? ({ ...el, ...patch } as SlideElement) : el,
      )
      handleUpdateSlide({ elements: nextElements })
    },
    [activeSlide, handleUpdateSlide],
  )

  const handleDeleteElement = useCallback(
    (elId: string) => {
      if (!activeSlide) return
      const nextElements = activeSlide.elements.filter((el) => el.id !== elId)
      handleUpdateSlide({ elements: nextElements })
      if (activeElementId === elId) setActiveElementId(null)
    },
    [activeSlide, activeElementId, handleUpdateSlide],
  )

  const handleAddText = useCallback(() => {
    if (!activeSlide) return
    const newText = createDefaultText()
    handleUpdateSlide({ elements: [...activeSlide.elements, newText] })
    setActiveElementId(newText.id)
  }, [activeSlide, handleUpdateSlide])

  const handleAddShape = useCallback(
    (shape: ShapeType) => {
      if (!activeSlide) return
      const newShape = createDefaultShape(shape, data.theme.accent || 'var(--accent)')
      handleUpdateSlide({ elements: [...activeSlide.elements, newShape] })
      setActiveElementId(newShape.id)
    },
    [activeSlide, data.theme.accent, handleUpdateSlide],
  )

  const handleAddImage = useCallback(() => {
    if (!activeSlide) return
    const newImg = createDefaultImage()
    handleUpdateSlide({ elements: [...activeSlide.elements, newImg] })
    setActiveElementId(newImg.id)
  }, [activeSlide, handleUpdateSlide])

  const handleAddTable = useCallback(() => {
    if (!activeSlide) return
    const newTable = createDefaultTable()
    handleUpdateSlide({ elements: [...activeSlide.elements, newTable] })
    setActiveElementId(newTable.id)
  }, [activeSlide, handleUpdateSlide])

  const handleAddChart = useCallback(
    (preset: 'bar' | 'line' | 'pie' | 'scatter') => {
      if (!activeSlide) return
      const newChart = createDefaultChart(preset)
      handleUpdateSlide({ elements: [...activeSlide.elements, newChart] })
      setActiveElementId(newChart.id)
    },
    [activeSlide, handleUpdateSlide],
  )

  const handleAddCode = useCallback(() => {
    if (!activeSlide) return
    const newCode = createDefaultCode()
    handleUpdateSlide({ elements: [...activeSlide.elements, newCode] })
    setActiveElementId(newCode.id)
  }, [activeSlide, handleUpdateSlide])

  const handleAddSlide = useCallback(() => {
    const newSlide: Slide = {
      id: `slide-${Date.now()}`,
      title: `Slide ${slides.length + 1}`,
      elements: [
        {
          id: `title-${Date.now()}`,
          type: 'text',
          html: `Slide ${slides.length + 1}`,
          fontSize: 44,
          fontWeight: 700,
          align: 'left',
          valign: 'top',
          x: 96,
          y: 80,
          w: 1088,
          h: 80,
        },
      ],
    }
    commitData({ ...data, slides: [...slides, newSlide] })
    setActiveSlideIndex(slides.length)
  }, [commitData, data, slides])

  const handleDuplicateSlide = useCallback(
    (id: string) => {
      const target = slides.find((s) => s.id === id)
      if (!target) return
      const dup: Slide = {
        ...target,
        id: `slide-${Date.now()}`,
        title: `${target.title || 'Slide'} (Copy)`,
        elements: target.elements.map((el) => ({ ...el, id: `${el.id}-copy` })),
      }
      const idx = slides.findIndex((s) => s.id === id)
      const next = [...slides.slice(0, idx + 1), dup, ...slides.slice(idx + 1)]
      commitData({ ...data, slides: next })
      setActiveSlideIndex(idx + 1)
    },
    [commitData, data, slides],
  )

  const handleDeleteSlide = useCallback(
    (id: string) => {
      if (slides.length <= 1) return
      const next = slides.filter((s) => s.id !== id)
      commitData({ ...data, slides: next })
      setActiveSlideIndex((prev) => (prev >= next.length ? next.length - 1 : prev))
    },
    [commitData, data, slides],
  )

  const handleMoveSlide = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const idx = slides.findIndex((s) => s.id === id)
      if (idx === -1) return
      if (direction === 'up' && idx > 0) {
        const next = [...slides]
        const temp = next[idx - 1]!
        next[idx - 1] = next[idx]!
        next[idx] = temp
        commitData({ ...data, slides: next })
        setActiveSlideIndex(idx - 1)
      } else if (direction === 'down' && idx < slides.length - 1) {
        const next = [...slides]
        const temp = next[idx + 1]!
        next[idx + 1] = next[idx]!
        next[idx] = temp
        commitData({ ...data, slides: next })
        setActiveSlideIndex(idx + 1)
      }
    },
    [commitData, data, slides],
  )

  const handleDuplicateElement = useCallback(
    (id: string) => {
      if (!activeSlide) return
      const target = activeSlide.elements.find((el) => el.id === id)
      if (!target) return
      const dup: SlideElement = {
        ...target,
        id: `${target.type}-${Date.now()}`,
        x: target.x + 20,
        y: target.y + 20,
      }
      handleUpdateSlide({ elements: [...activeSlide.elements, dup] })
      setActiveElementId(dup.id)
    },
    [activeSlide, handleUpdateSlide],
  )

  const handleUpdateTheme = useCallback(
    (patch: Partial<SlidesTheme>) => {
      commitData({ ...data, theme: { ...data.theme, ...patch } })
    },
    [commitData, data],
  )

  const selectedElement =
    activeSlide?.elements.find((el) => el.id === activeElementId) || null

  if (isPresentationMode) {
    return (
      <SlidesPresenter
        doc={data}
        initialIndex={activeSlideIndex}
        onClose={() => setIsPresentationMode(false)}
      />
    )
  }

  if (!isFullscreen) {
    if (!activeSlide) return null
    return (
      <SlidesInlinePreview
        data={data}
        slide={activeSlide}
        slideIndex={activeSlideIndex}
        slideCount={slides.length}
        scale={inlineScale}
        stageRef={inlineContainerRef}
        onSelectSlide={(index) =>
          setActiveSlideIndex(Math.min(Math.max(index, 0), slides.length - 1))
        }
        onPlay={() => setIsPresentationMode(true)}
        onToggleFullscreen={onToggleFullscreen}
      />
    )
  }

  const handleReorderElement = useCallback(
    (elId: string, direction: 'up' | 'down') => {
      if (!activeSlide) return
      const idx = activeSlide.elements.findIndex((e) => e.id === elId)
      if (idx === -1) return
      const targetIdx = direction === 'up' ? idx + 1 : idx - 1
      if (targetIdx < 0 || targetIdx >= activeSlide.elements.length) return
      const next = [...activeSlide.elements]
      const [item] = next.splice(idx, 1)
      if (item) next.splice(targetIdx, 0, item)
      handleUpdateSlide({ elements: next })
    },
    [activeSlide, handleUpdateSlide],
  )

  return (
    <div className='flex flex-col size-full overflow-hidden bg-[var(--bg-surface)]'>
      <SlidesTopbar
        title={data.title}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onUpdateTitle={(title) => commitData({ ...data, title })}
        onAddText={handleAddText}
        onAddShape={handleAddShape}
        onAddImage={handleAddImage}
        onAddTable={handleAddTable}
        onAddChart={handleAddChart}
        onAddCode={handleAddCode}
        onClose={() => onToggleFullscreen?.()}

        onShare={() => void copySlidesLink()}
        isSaved={isSaved ?? true}
        onSave={onSave}
        onOpenSettings={() => setOpenDialog('settings')}
        onOpenHelp={() => setOpenDialog('help')}
      />

      <SlidesSettingsDialog
        open={openDialog === 'settings'}
        title={data.title}
        size={data.size}
        theme={data.theme}
        onClose={() => setOpenDialog(null)}
        onUpdateTitle={(title) => commitData({ ...data, title })}
        onUpdateSize={(size) => commitData({ ...data, size })}
        onUpdateTheme={handleUpdateTheme}
      />

      <SlidesHelpDialog open={openDialog === 'help'} onClose={() => setOpenDialog(null)} />

      <div className='flex flex-1 overflow-hidden'>
        <SlidesSidebar
          slides={slides}
          size={data.size}
          activeSlideId={activeSlide?.id || ''}
          theme={data.theme}
          assets={data.assets}
          onSelectSlide={(id) => {
            const idx = slides.findIndex((s) => s.id === id)
            if (idx !== -1) {
              setActiveSlideIndex(idx)
              setActiveElementId(null)
            }
          }}
          onAddSlide={handleAddSlide}
          onDuplicateSlide={handleDuplicateSlide}
          onDeleteSlide={handleDeleteSlide}
          onMoveSlide={handleMoveSlide}
        />

        <main className='bento-canvas-stage flex flex-1 items-center justify-center overflow-auto p-8 relative'>
          {activeSlide && (
            <div
              style={{
                width: `${data.size.width * zoom}px`,
                height: `${data.size.height * zoom}px`,
              }}
              className='relative shrink-0'
            >
              <SlidesCanvas
                slide={activeSlide}
                theme={data.theme}
                page={data.size}
                scale={zoom}
                editable={true}
                activeElementId={activeElementId}
                assets={data.assets}
                onSelectElement={setActiveElementId}
                onUpdateElement={handleUpdateElement}
              />
            </div>
          )}

          <div className='bento-corner-controls'>
            <div className='bento-zoom-cluster flex items-center bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5 shadow-md gap-1'>
              <button
                type='button'
                onClick={() => setIsPresentationMode(true)}
                className='flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors'
                title={t('slides.slideshow')}
              >
                <span className='text-[length:var(--text-10)]'>▶</span>
                <span>{t('slides.slideshow')}</span>
              </button>

              <span className='h-3.5 w-px bg-[var(--border-subtle)]' />

              <button
                type='button'
                onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(1))))}
                className='bento-zoom-btn'
                title={t('common.zoom_out')}
              >
                −
              </button>
              <button
                type='button'
                onClick={() => setZoom(1)}
                className='bento-zoom-label hover:text-[var(--text-primary)] cursor-pointer'
                title={t('slides.reset_zoom')}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type='button'
                onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(1))))}
                className='bento-zoom-btn'
                title={t('common.zoom_in')}
              >
                +
              </button>
            </div>
          </div>
        </main>

        {activeSlide && (
          <SlidesInspector
            slide={activeSlide}
            selectedElement={selectedElement}
            theme={data.theme}
            docSize={data.size}
            presentSettings={data.present}
            onSelectElement={setActiveElementId}
            onUpdateSlide={handleUpdateSlide}
            onUpdateElement={handleUpdateElement}
            onDeleteElement={handleDeleteElement}
            onDuplicateElement={handleDuplicateElement}
            onReorderElement={handleReorderElement}
            onUpdateTheme={handleUpdateTheme}
            onUpdateDocSize={(size) => commitData({ ...data, size })}
            onUpdatePresentSettings={(presentPatch) =>
              commitData({ ...data, present: { ...(data.present || {}), ...presentPatch } })
            }
          />
        )}
      </div>
    </div>
  )
})
