import { memo, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type {
  BentoDoc,
  ShapeType,
  Slide,
  SlideElement,
  SlidesTheme,
} from '../types'
import { useSlidesHistory } from '../history'
import { SlidesStage } from './slides-stage'
import { SlidesTopbar } from './slides-topbar'
import { SlidesSidebar } from './slides-sidebar'
import { SlidesInspector } from './slides-inspector'
import { SlidesPresenter } from './slides-presenter'
import { SlidesHelpDialog } from './slides-help-dialog'
import { SlidesSettingsDialog } from './slides-settings-dialog'
import { SlidesInlinePreview } from './slides-inline-preview'
import { LayoutPicker } from './layout-picker'
import { SlidesContextMenu, type SlidesMenuState, type SlidesMenuTarget } from './slides-context-menu'
import { instantiateLayout, layoutById } from '../layouts'
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
  const [openDialog, setOpenDialog] = useState<'settings' | 'help' | 'layouts' | null>(null)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [menu, setMenu] = useState<SlidesMenuState | null>(null)
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

  const addSlideFromLayout = useCallback(
    (layoutId: string) => {
      const layout = layoutById(layoutId)
      if (!layout) return
      const seed = `${Date.now()}-${slides.length}`
      const newSlide = instantiateLayout(layout, data.size, {
        accent: data.theme.accent,
        message: (key) => t(key),
        seed,
      })
      commitData({ ...data, slides: [...slides, newSlide] })
      setActiveSlideIndex(slides.length)
      setActiveElementId(null)
    },
    [commitData, data, slides],
  )

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

  const openMenuAt = useCallback(
    (event: { clientX: number; clientY: number; preventDefault: () => void }, target: SlidesMenuTarget) => {
      event.preventDefault()
      setMenu({ x: event.clientX, y: event.clientY, target })
    },
    [],
  )

  /** A double click and the menu's own row are the two ways into typing; both land here. */
  const startTypingElement = useCallback(
    (elementId: string) => {
      const element = activeSlide?.elements.find((el) => el.id === elementId)
      if (element?.type !== 'text') return
      setActiveElementId(elementId)
      setEditingElementId(elementId)
    },
    [activeSlide],
  )

  const handleStageContextMenu = useCallback(
    (elementId: string | null, event: ReactMouseEvent<HTMLElement>) => {
      const element = elementId ? activeSlide?.elements.find((el) => el.id === elementId) : undefined
      if (element) setActiveElementId(element.id)
      openMenuAt(event, element ? { kind: 'element', element } : { kind: 'canvas' })
    },
    [activeSlide, openMenuAt],
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
    (elId: string, direction: 'up' | 'down' | 'front' | 'back') => {
      if (!activeSlide) return
      const idx = activeSlide.elements.findIndex((e) => e.id === elId)
      if (idx === -1) return
      const targetIdx =
        direction === 'front'
          ? activeSlide.elements.length - 1
          : direction === 'back'
            ? 0
            : direction === 'up'
              ? idx + 1
              : idx - 1
      if (targetIdx === idx) return
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

      <LayoutPicker
        open={openDialog === 'layouts'}
        theme={data.theme}
        page={data.size}
        onPick={(layoutId) => {
          addSlideFromLayout(layoutId)
          setOpenDialog(null)
        }}
        onClose={() => setOpenDialog(null)}
      />

      <SlidesContextMenu
        menu={menu}
        onClose={() => setMenu(null)}
        actions={{
          onEditText: startTypingElement,
          onDuplicateElement: handleDuplicateElement,
          onReorderElement: handleReorderElement,
          onDeleteElement: handleDeleteElement,
          onAddSlide: () => setOpenDialog('layouts'),
          onDuplicateSlide: handleDuplicateSlide,
          onMoveSlide: handleMoveSlide,
          onDeleteSlide: handleDeleteSlide,
        }}
      />

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
          onAddSlide={() => setOpenDialog('layouts')}
          onDuplicateSlide={handleDuplicateSlide}
          onDeleteSlide={handleDeleteSlide}
          onMoveSlide={handleMoveSlide}
          onContextMenuSlide={(slideId, event) => openMenuAt(event, { kind: 'slide', slideId })}
        />

        <SlidesStage
          slide={activeSlide}
          theme={data.theme}
          page={data.size}
          zoom={zoom}
          activeElementId={activeElementId}
          editingElementId={editingElementId}
          assets={data.assets}
          onSelectElement={setActiveElementId}
          onUpdateElement={handleUpdateElement}
          onZoom={setZoom}
          onStartSlideshow={() => setIsPresentationMode(true)}
          onContextMenuAt={handleStageContextMenu}
          onStartTyping={startTypingElement}
        />

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
