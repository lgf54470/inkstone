import { memo, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { BentoDoc, SlideElement, SlidesTheme } from '../types'
import { useSlidesHistory } from '../history'
import { SlidesStage, zoomCommand } from './slides-stage'
import { SlidesTopbar } from './slides-topbar'
import { SlidesSidebar } from './slides-sidebar'
import { SlidesInspector } from './slides-inspector'
import { SlidesPresenter } from './slides-presenter'
import { SlidesHelpDialog } from './slides-help-dialog'
import { SlidesSettingsDialog } from './slides-settings-dialog'
import { SlidesInlinePreview } from './slides-inline-preview'
import { LayoutPicker } from './layout-picker'
import { useSlidesPrint } from './slides-print'
import { SlidesContextMenu, type SlidesMenuState, type SlidesMenuTarget } from './slides-context-menu'
import { instantiateLayout, layoutById } from '../layouts'
import { duplicateSlide, placeElements, type ElementPosition } from '../edits'
import { moveSlide, reorderSlide } from '../order'
import { copySlidesLink } from './copy-link'
import { useSlidesImages } from './insert-image'
import { useSlidesEditing } from './use-slides-editing'
import { useSlidesPageEdits } from './use-slides-page-edits'
import { t } from '../../../i18n'

interface SlidesRootProps {
  initialData: BentoDoc
  isFullscreen?: boolean
  /** Whether every edit has reached the note; undefined on a surface without a save control. */
  isSaved?: boolean
  /** The note holding the deck, which owns any picture added here; null on a surface with no note. */
  noteId?: string | null
  onSave?: () => void
  onUpdateData: (data: BentoDoc) => void
  onToggleFullscreen?: () => void
}

export const SlidesRoot = memo(function SlidesRoot({
  initialData,
  isFullscreen = false,
  isSaved,
  noteId = null,
  onSave,
  onUpdateData,
  onToggleFullscreen,
}: SlidesRootProps) {
  const { data, commitData, undo, redo, canUndo, canRedo } = useSlidesHistory(
    initialData,
    onUpdateData,
  )

  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isPresentationMode, setIsPresentationMode] = useState(false)
  const [openDialog, setOpenDialog] = useState<'settings' | 'help' | 'layouts' | null>(null)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [menu, setMenu] = useState<SlidesMenuState | null>(null)
  const [zoom, setZoom] = useState(1)
  const { requestPrint, printSheet } = useSlidesPrint(data)
  const [inlineScale, setInlineScale] = useState(0.5)
  const inlineContainerRef = useRef<HTMLDivElement>(null)

  const slides = data.slides
  const activeSlide = slides[activeSlideIndex] || slides[0]
  // The last box picked is the primary one: it is what the inspector edits and where the
  // resize and rotate handles sit on a multiple selection.
  const activeElementId = selectedIds[selectedIds.length - 1] ?? null

  const selectElement = useCallback((id: string | null, additive = false) => {
    if (!id) {
      setSelectedIds([])
      return
    }
    setSelectedIds((previous) => {
      if (!additive) return previous.length === 1 && previous[0] === id ? previous : [id]
      return previous.includes(id) ? previous.filter((candidate) => candidate !== id) : [...previous, id]
    })
  }, [])

  /** One box, chosen by something other than a click on the canvas: a layer row, a menu, an insert. */
  const selectOne = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), [])

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

  const pageEdits = useSlidesPageEdits({
    doc: data,
    slideIndex: activeSlideIndex,
    commit: commitData,
    selectedId: () => activeElementId,
    select: (elementId) => setSelectedIds(elementId ? [elementId] : []),
  })

  /**
   * Adds one element to the slide it was asked for. The change resolves against the document
   * as it is now rather than as the render it came from — this request outlives that render
   * (a picture is chosen, then uploaded) and the slide may be gone by the time it lands.
   */
  const insertElementInto = useCallback(
    (slideId: string, element: SlideElement): boolean => {
      let inserted = false
      commitData((prev) => {
        if (!prev.slides.some((slide) => slide.id === slideId)) return prev
        inserted = true
        return {
          ...prev,
          slides: prev.slides.map((slide) =>
            slide.id === slideId ? { ...slide, elements: [...slide.elements, element] } : slide,
          ),
        }
      })
      return inserted
    },
    [commitData],
  )

  const { addFromPicker: handleAddImage, addFile: handlePasteImage } = useSlidesImages({
    noteId,
    targetSlideId: () => activeSlide?.id ?? null,
    insert: insertElementInto,
    select: selectOne,
  })

  const applyZoom = useCallback((command: 'in' | 'out' | 'reset') => {
    setZoom((current) => zoomCommand(current, command))
  }, [])

  /**
   * Left and right with nothing selected: the deck's own order, and nothing else. The ends
   * answer false so the arrow reaches the browser rather than being swallowed at the edge.
   */
  const stepPage = useCallback(
    (direction: 1 | -1) => {
      const next = activeSlideIndex + direction
      if (next < 0 || next >= slides.length) return false
      setActiveSlideIndex(next)
      setSelectedIds([])
      setEditingElementId(null)
      return true
    },
    [activeSlideIndex, slides.length],
  )

  /** ⌘S with no save control (the card in a note) is not this editor's key to take. */
  const saveDeck = useCallback(() => {
    if (!onSave) return false
    onSave()
    return true
  }, [onSave])

  const editing = useSlidesEditing({
    enabled: isFullscreen,
    doc: data,
    targetSlideId: () => activeSlide?.id ?? null,
    selectedIds: () => selectedIds,
    commit: commitData,
    select: (elementIds) => setSelectedIds(elementIds),
    zoom: applyZoom,
    pasteImage: (file) => void handlePasteImage(file),
    selectSlide: (slideId) => {
      const index = data.slides.findIndex((slide) => slide.id === slideId)
      if (index !== -1) setActiveSlideIndex(index)
    },
    stepPage: (direction) => stepPage(direction),
    startShow: () => {
      setIsPresentationMode(true)
      return true
    },
    saveDeck: () => saveDeck(),
    openHelp: () => {
      setOpenDialog('help')
      return true
    },
  })

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
      setSelectedIds([])
    },
    [commitData, data, slides],
  )

  const handleDuplicateSlide = useCallback(
    (id: string) => {
      const { doc, index } = duplicateSlide(data, id, t('slides.copy_suffix'))
      if (index === -1) return
      commitData(doc)
      setActiveSlideIndex(index)
    },
    [commitData, data],
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
      const moved = moveSlide(slides, id, direction)
      if (!moved) return
      commitData({ ...data, slides: moved.slides })
      setActiveSlideIndex(moved.index)
    },
    [commitData, data, slides],
  )

  const handleDropSlide = useCallback(
    (fromId: string, toId: string) => {
      const next = reorderSlide(slides, fromId, toId)
      if (!next) return
      commitData({ ...data, slides: next })
      setActiveSlideIndex(next.findIndex((slide) => slide.id === fromId))
    },
    [commitData, data, slides],
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
      setSelectedIds([elementId])
      setEditingElementId(elementId)
    },
    [activeSlide],
  )

  /**
   * Right clicking a box that is part of a selection keeps that selection, so the menu's rows act
   * on what the reader can see is selected; any other box is picked on its own the way it looks.
   */
  const handleStageContextMenu = useCallback(
    (elementId: string | null, event: ReactMouseEvent<HTMLElement>) => {
      const element = elementId ? activeSlide?.elements.find((el) => el.id === elementId) : undefined
      if (element && !selectedIds.includes(element.id)) selectOne(element.id)
      openMenuAt(event, element ? { kind: 'element', element } : { kind: 'canvas' })
    },
    [activeSlide, openMenuAt, selectOne, selectedIds],
  )

  /** Where a drag lands: every box it carried, at the position the drag computed for it. */
  const handleMoveElements = useCallback(
    (positions: ElementPosition[]) => {
      const slideId = activeSlide?.id
      if (!slideId || positions.length === 0) return
      commitData((previous) => placeElements(previous, slideId, positions))
    },
    [activeSlide?.id, commitData],
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

  return (
    <div className='flex flex-col size-full overflow-hidden bg-[var(--bg-surface)]'>
      <SlidesTopbar
        title={data.title}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onUpdateTitle={(title) => commitData({ ...data, title })}
        onAddText={pageEdits.addText}
        onAddShape={pageEdits.addShape}
        onAddImage={handleAddImage}
        onAddTable={pageEdits.addTable}
        onAddChart={pageEdits.addChart}
        onAddCode={pageEdits.addCode}
        onClose={() => onToggleFullscreen?.()}
        onExportPdf={requestPrint}
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

      {printSheet}

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
          onCopySlide: editing.copyPage,
          onPasteSlide: editing.pastePage,
          onCopyElement: (elementId) => editing.copy([elementId]),
          onCutElement: (elementId) => editing.cut([elementId]),
          onPaste: editing.pasteFromClipboard,
          onDuplicateElement: pageEdits.duplicateElement,
          onReorderElement: pageEdits.reorderElement,
          onDeleteElement: pageEdits.deleteElement,
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
              setSelectedIds([])
            }
          }}
          onAddSlide={() => setOpenDialog('layouts')}
          onDuplicateSlide={handleDuplicateSlide}
          onDeleteSlide={handleDeleteSlide}
          onMoveSlide={handleMoveSlide}
          onReorderSlide={handleDropSlide}
          onContextMenuSlide={(slideId, event) => openMenuAt(event, { kind: 'slide', slideId })}
        />

        <SlidesStage
          slide={activeSlide}
          theme={data.theme}
          page={data.size}
          zoom={zoom}
          selectedIds={selectedIds}
          editingElementId={editingElementId}
          assets={data.assets}
          onSelectElement={selectElement}
          onSelectMany={setSelectedIds}
          onUpdateElement={pageEdits.updateElement}
          onMoveElements={handleMoveElements}
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
            onSelectElement={selectOne}
            onUpdateSlide={pageEdits.updateSlide}
            onUpdateElement={pageEdits.updateElement}
            onDeleteElement={pageEdits.deleteElement}
            onDuplicateElement={pageEdits.duplicateElement}
            onReorderElement={pageEdits.reorderElement}
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
