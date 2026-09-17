import { memo } from 'react'
import type { Slide, SlideElement, SlidesTheme, SlidesPresentSettings } from '../types'
import { InspectorLayers } from './inspector-layers'
import { InspectorSlide } from './inspector-slide'
import { InspectorTheme } from './inspector-theme'
import { InspectorElement } from './inspector-element'

interface SlidesInspectorProps {
  slide: Slide
  selectedElement: SlideElement | null
  theme: SlidesTheme
  docSize: { width: number; height: number }
  presentSettings?: SlidesPresentSettings
  onSelectElement: (id: string | null) => void
  onUpdateSlide: (patch: Partial<Slide>) => void
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void
  onDeleteElement: (id: string) => void
  onDuplicateElement?: (id: string) => void
  onReorderElement: (id: string, direction: 'up' | 'down') => void
  onUpdateTheme: (patch: Partial<SlidesTheme>) => void
  onUpdateDocSize: (size: { width: number; height: number }) => void
  onUpdatePresentSettings: (patch: Partial<SlidesPresentSettings>) => void
}

export const SlidesInspector = memo(function SlidesInspector({
  slide,
  selectedElement,
  theme,
  docSize,
  presentSettings,
  onSelectElement,
  onUpdateSlide,
  onUpdateElement,
  onDeleteElement,
  onDuplicateElement,
  onReorderElement,
  onUpdateTheme,
  onUpdateDocSize,
  onUpdatePresentSettings,
}: SlidesInspectorProps) {
  return (
    <aside className='flex w-64 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] select-none shrink-0 text-xs overflow-y-auto'>
      {selectedElement ? (
        <InspectorElement
          element={selectedElement}
          onUpdate={(patch) => onUpdateElement(selectedElement.id, patch)}
          onDelete={() => onDeleteElement(selectedElement.id)}
          onDuplicate={() => onDuplicateElement?.(selectedElement.id)}
          onReorder={(direction) => onReorderElement(selectedElement.id, direction)}
        />
      ) : (
        <>
          <InspectorLayers
            slide={slide}
            selectedElementId={null}
            onSelectElement={(id) => onSelectElement(id)}
            onReorderElement={onReorderElement}
          />
          <InspectorSlide
            slide={slide}
            docSize={docSize}
            presentSettings={presentSettings}
            onUpdateSlide={onUpdateSlide}
            onUpdateDocSize={onUpdateDocSize}
            onUpdatePresentSettings={onUpdatePresentSettings}
          />
          <InspectorTheme
            theme={theme}
            onUpdateTheme={onUpdateTheme}
          />
        </>
      )}
    </aside>
  )
})
