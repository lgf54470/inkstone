import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type {
  BentoDoc,
  ChartDatum,
  ChartElement,
  CodeElement,
  ImageElement,
  ShapeElement,
  ShapeType,
  Slide,
  SlideElement,
  SlidesTheme,
  TableElement,
  TextElement,
} from '../types'
import { useSlidesHistory } from '../history'
import { SlidesCanvas } from './slides-canvas'
import { SlidesTopbar } from './slides-topbar'
import { SlidesSidebar } from './slides-sidebar'
import { SlidesInspector } from './slides-inspector'
import { SlidesPresenter } from './slides-presenter'
import { VIRTUAL_CANVAS_WIDTH, VIRTUAL_CANVAS_HEIGHT } from './canvas-helpers'
import { t } from '../../../i18n'

interface SlidesRootProps {
  initialData: BentoDoc
  isFullscreen?: boolean
  onUpdateData: (data: BentoDoc) => void
  onToggleFullscreen?: () => void
}

export const SlidesRoot = memo(function SlidesRoot({
  initialData,
  isFullscreen = false,
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
          if (w > 0) setInlineScale(Math.min(w / VIRTUAL_CANVAS_WIDTH, 1))
        }
      })
      observer.observe(inlineContainerRef.current)
      return () => observer.disconnect()
    }
  }, [isFullscreen])

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
    const newText: TextElement = {
      id: `text-${Date.now()}`,
      type: 'text',
      html: 'Click to edit text',
      fontSize: 28,
      fontWeight: 400,
      x: 200,
      y: 200,
      w: 400,
      h: 80,
    }
    handleUpdateSlide({ elements: [...activeSlide.elements, newText] })
    setActiveElementId(newText.id)
  }, [activeSlide, handleUpdateSlide])

  const handleAddShape = useCallback(
    (shape: ShapeType) => {
      if (!activeSlide) return
      const newShape: ShapeElement = {
        id: `shape-${Date.now()}`,
        type: 'shape',
        shape,
        fill: data.theme.accent || 'var(--accent)',
        x: 300,
        y: 250,
        w: 240,
        h: 160,
        radius: 12,
      }
      handleUpdateSlide({ elements: [...activeSlide.elements, newShape] })
      setActiveElementId(newShape.id)
    },
    [activeSlide, data.theme.accent, handleUpdateSlide],
  )

  const handleAddImage = useCallback(() => {
    if (!activeSlide) return
    const newImg: ImageElement = {
      id: `img-${Date.now()}`,
      type: 'image',
      src: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800',
      fit: 'cover',
      x: 240,
      y: 160,
      w: 480,
      h: 320,
      radius: 8,
    }
    handleUpdateSlide({ elements: [...activeSlide.elements, newImg] })
    setActiveElementId(newImg.id)
  }, [activeSlide, handleUpdateSlide])

  const handleAddTable = useCallback(() => {
    if (!activeSlide) return
    const newTable: TableElement = {
      id: `table-${Date.now()}`,
      type: 'table',
      x: 200,
      y: 180,
      w: 600,
      h: 240,
      columns: [{ w: 1 }, { w: 1 }, { w: 1 }],
      rows: [
        { cells: [{ html: 'Metric', bold: true }, { html: 'Q1', bold: true }, { html: 'Q2', bold: true }] },
        { cells: [{ html: 'Revenue' }, { html: '$120k' }, { html: '$180k' }] },
        { cells: [{ html: 'Active Users' }, { html: '4,200' }, { html: '8,900' }] },
      ],
    }
    handleUpdateSlide({ elements: [...activeSlide.elements, newTable] })
    setActiveElementId(newTable.id)
  }, [activeSlide, handleUpdateSlide])

  const handleAddChart = useCallback(
    (preset: 'bar' | 'line' | 'pie') => {
      if (!activeSlide) return
      const chartData: ChartDatum[] = [
        { label: 'Jan', value: 35 },
        { label: 'Feb', value: 55 },
        { label: 'Mar', value: 80 },
        { label: 'Apr', value: 120 },
      ]
      const newChart: ChartElement = {
        id: `chart-${Date.now()}`,
        type: 'chart',
        preset,
        data: chartData,
        title: 'Monthly Progress',
        x: 220,
        y: 160,
        w: 520,
        h: 300,
      }
      handleUpdateSlide({ elements: [...activeSlide.elements, newChart] })
      setActiveElementId(newChart.id)
    },
    [activeSlide, handleUpdateSlide],
  )

  const handleAddCode = useCallback(() => {
    if (!activeSlide) return
    const newCode: CodeElement = {
      id: `code-${Date.now()}`,
      type: 'code',
      code: 'function hello() {\n  return "Bento Slides";\n}',
      lang: 'typescript',
      x: 240,
      y: 180,
      w: 480,
      h: 220,
    }
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
    return (
      <div className='flex flex-col w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] shadow-xs'>
        <div className='flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs'>
          <div className='flex items-center gap-2 font-medium'>
            <span className='px-1.5 py-0.5 rounded bg-[var(--accent)] text-white text-[length:var(--text-10)] font-bold'>
              {'Bento'}
            </span>
            <span className='truncate max-w-44'>{data.title}</span>
            <span className='text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
              {activeSlideIndex + 1} / {slides.length}
            </span>
          </div>

          <div className='flex items-center gap-1'>
            <button
              type='button'
              onClick={() => setActiveSlideIndex((p) => (p > 0 ? p - 1 : p))}
              disabled={activeSlideIndex === 0}
              className='flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] disabled:opacity-30'
            >
              ◀
            </button>
            <button
              type='button'
              onClick={() => setActiveSlideIndex((p) => (p < slides.length - 1 ? p + 1 : p))}
              disabled={activeSlideIndex === slides.length - 1}
              className='flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)] disabled:opacity-30'
            >
              ▶
            </button>
            <div className='h-3 w-px bg-[var(--border-subtle)] mx-1' />
            <button
              type='button'
              onClick={() => setIsPresentationMode(true)}
              className='flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--bg-hover)] text-[length:var(--text-11)]'
              title={t('slides.slideshow')}
            >
              <span>▶</span>
              <span>{t('slides.play')}</span>
            </button>
            <button
              type='button'
              onClick={onToggleFullscreen}
              className='flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]'
              title={t('preview.slides_fullscreen')}
            >
              ⤢
            </button>
          </div>
        </div>

        <div
          ref={inlineContainerRef}
          className='relative w-full flex items-center justify-center bg-black/10 overflow-hidden'
          style={{ height: `${VIRTUAL_CANVAS_HEIGHT * inlineScale}px` }}
        >
          {activeSlide && (
            <div
              style={{
                width: `${VIRTUAL_CANVAS_WIDTH * inlineScale}px`,
                height: `${VIRTUAL_CANVAS_HEIGHT * inlineScale}px`,
              }}
              className='relative'
            >
              <SlidesCanvas
                slide={activeSlide}
                theme={data.theme}
                scale={inlineScale}
                editable={false}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

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
        onPresent={() => setIsPresentationMode(true)}
        onClose={() => onToggleFullscreen?.()}
        zoom={zoom}
        onZoomChange={(delta) => setZoom((z) => Math.max(0.4, Math.min(2.0, z + delta)))}
      />

      <div className='flex flex-1 overflow-hidden'>
        <SlidesSidebar
          slides={slides}
          activeSlideId={activeSlide?.id || ''}
          theme={data.theme}
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

        <main className='flex flex-1 items-center justify-center bg-[var(--bg-inset)] overflow-auto p-6'>
          {activeSlide && (
            <div
              style={{
                width: `${VIRTUAL_CANVAS_WIDTH * zoom}px`,
                height: `${VIRTUAL_CANVAS_HEIGHT * zoom}px`,
              }}
              className='relative'
            >
              <SlidesCanvas
                slide={activeSlide}
                theme={data.theme}
                scale={zoom}
                editable={true}
                activeElementId={activeElementId}
                onSelectElement={setActiveElementId}
                onUpdateElement={handleUpdateElement}
              />
            </div>
          )}
        </main>

        {activeSlide && (
          <SlidesInspector
            slide={activeSlide}
            selectedElement={selectedElement}
            theme={data.theme}
            onUpdateSlide={handleUpdateSlide}
            onUpdateElement={handleUpdateElement}
            onDeleteElement={handleDeleteElement}
            onUpdateTheme={handleUpdateTheme}
          />
        )}
      </div>
    </div>
  )
})
