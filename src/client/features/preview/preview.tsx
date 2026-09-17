import { memo } from 'react'
import { cn } from '../../lib/cn'
import { usePreview, type PreviewProps } from './use-preview'
import { NotePropertiesEditor } from './note-properties-editor'
import { WikiLinkHoverCard } from './wiki-link-hover-card'
import { FilePreviewModal } from './file-preview-modal'
import { MindmapFullscreen } from './mindmap-fullscreen'
import { MindmapThemeMenu } from './mindmap-theme-menu'
import { ExcalidrawFullscreen } from './excalidraw-fullscreen'
import { ExcalidrawLibraryMenu } from './excalidraw-library-menu'
import { isExcalidrawSurface } from '../../lib/markdown/excalidraw'
import { KanbanFullscreen } from '../../lib/markdown/kanban'
import { SlidesFullscreen } from '../../lib/markdown/slides'

export type { PreviewProps } from './use-preview'

export const Preview = memo(function Preview(props: PreviewProps) {
  const b = usePreview(props)
  const { className, onContextMenu } = props
  return (
    <div
      ref={b.scrollerRef}
      onContextMenu={(event) => {
        // A board answers a right-click on its own surface with the library's canvas menu,
        // and the full screen overlay is that surface too — it is portaled into this
        // subtree, so without this the note's menu opens over the one already there.
        if (isExcalidrawSurface(event.target as HTMLElement)) return
        if (Boolean(b.kanbanFullscreen) || Boolean((event.target as HTMLElement)?.closest('.kanban-fullscreen'))) return
        if (Boolean(b.slidesFullscreen) || Boolean((event.target as HTMLElement)?.closest('.bento-slides-fullscreen'))) return
        event.preventDefault()
        onContextMenu?.(event, event.target as HTMLElement)
      }}
      className={cn('h-full overflow-y-auto overscroll-contain px-4 py-3', className)}
      data-preview-scroller
    >
      <div className='ink-preview-container' data-font={b.proseFont}>
        <NotePropertiesEditor noteId={b.sourceNoteId} content={b.content} />
        <div ref={b.hostRef}
          onClick={b.onClick}
          onDoubleClick={b.onDoubleClick}
          onKeyDown={b.onKeyDown}
          onMouseMove={b.linkHover.handleMouseMove}
          onMouseLeave={b.onMouseLeave}
          onFocus={b.onFocus}
          onBlur={b.onBlur}
          data-font={b.proseFont}
          data-preview-content
          className='ink-prose'
          dangerouslySetInnerHTML={b.htmlObj}
        />
      </div>
      <PreviewOverlays b={b} />
    </div>
  )
})

function PreviewOverlays({ b }: { b: ReturnType<typeof usePreview> }) {
  return (
    <>
      {b.hoverCard && (
        <WikiLinkHoverCard
          card={b.hoverCard}
          path={b.hoverCard.noteId ? [b.hoverCard.noteId] : []}
          depth={1}
          dark={b.theme === 'dark'}
          onClose={b.linkHover.hideNow}
          onEnter={b.linkHover.clearPendingHide}
          onLeave={b.linkHover.armHide}
          onPin={b.handlePin}
        />
      )}
      {b.mindmapFullscreen && (
        <MindmapFullscreen session={b.mindmapFullscreen.session} onClose={b.closeMindmapFullscreen} />
      )}
      {b.mindmapThemeMenu && (
        <MindmapThemeMenu state={b.mindmapThemeMenu} onClose={b.closeMindmapThemeMenu} />
      )}
      {b.excalidrawFullscreen && (
        <ExcalidrawFullscreen session={b.excalidrawFullscreen.session} onClose={b.closeExcalidrawFullscreen} onOpenLibrary={b.openExcalidrawLibraryMenu} />
      )}
      {b.excalidrawLibraryMenu && (
        <ExcalidrawLibraryMenu node={b.excalidrawLibraryMenu.node} onClose={b.closeExcalidrawLibraryMenu} />
      )}
      {b.kanbanFullscreen && (
        <KanbanFullscreen session={b.kanbanFullscreen.session} onClose={b.closeKanbanFullscreen} />
      )}
      {b.slidesFullscreen && (
        <SlidesFullscreen session={b.slidesFullscreen.session} onClose={b.closeSlidesFullscreen} />
      )}
      {b.previewFile && (
        <FilePreviewModal
          open={Boolean(b.previewFile)}
          onClose={() => b.setPreviewFile(null)}
          url={b.previewFile.url}
          filename={b.previewFile.filename}
        />
      )}
    </>
  )
}
