import { memo } from 'react'
import { cn } from '../../lib/cn'
import { usePreview, type PreviewProps } from './use-preview'
import { NotePropertiesEditor } from './note-properties-editor'
import { WikiLinkHoverCard } from './wiki-link-hover-card'
import { FilePreviewModal } from './file-preview-modal'

export type { PreviewProps } from './use-preview'

export const Preview = memo(function Preview(props: PreviewProps) {
  const b = usePreview(props)
  const { className, onContextMenu } = props
  return (
    <div
      ref={b.scrollerRef}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu?.(event, event.target as HTMLElement)
      }}
      className={cn('h-full overflow-y-auto overscroll-contain px-4 py-3', className)}
      data-preview-scroller
    >
      <div className="ink-preview-container" data-font={b.proseFont}>
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
          className="ink-prose"
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
