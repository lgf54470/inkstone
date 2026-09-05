import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { cn } from '../../lib/cn'
import { useDebounced } from '../../lib/hooks'
import { decodeDataValue } from '../../lib/markdown/data-attr'
import { parseWikiTarget, renderMarkdown, type Heading } from '../../lib/markdown/renderer'
import { resolveNoteEmbeds } from '../../lib/markdown/embeds'
import { useLocale } from '../../lib/i18n'
import {
  destroyChartInstances,
  enhancePreview,
  renderChartJs,
  renderPendingMermaid,
} from '../../lib/markdown/enhance'
import { useUi } from '../../store/ui'
import { findNoteByTitle } from '../../store/notes/selectors'
import { useNotes } from '../../store/notes'
import { useSession } from '../../store/session'
import { NotePropertiesEditor } from './note-properties-editor'
import { createPreviewClickHandler } from './preview-interactions'
import { moveMarkdownTabFocus } from './markdown-tabs'
import { capturePreviewInteractionState, restorePreviewInteractionState } from './preview-state'
import { WikiLinkHoverCard, type WikiLinkHoverCardState } from './wiki-link-hover-card'
import { FilePreviewModal } from './file-preview-modal'
import { useLinkHover } from './link-hover'
import { capturePreviewViewport, restorePreviewViewport, type PreviewViewport } from './viewport'
import { usePinnedWindows } from '../../store/pinned-windows'
import {
  enhanceTablesInRoot,
  startTableCellEditing,
} from './table-interactive'

export interface PreviewProps {
  content: string
  noteId?: string
  noteTitle?: string
  onHeadings?: (headings: Heading[]) => void
  scrollerRef?: RefObject<HTMLDivElement | null>
  onRendered?: () => void
  onContextMenu?: (event: React.MouseEvent, target: HTMLElement) => void
  className?: string
}

export const Preview = memo(function Preview({
  content,
  noteId,
  noteTitle,
  onHeadings,
  scrollerRef: externalScrollerRef,
  onRendered,
  onContextMenu,
  className,
}: PreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const internalScrollerRef = useRef<HTMLDivElement>(null)
  const scrollerRef = externalScrollerRef ?? internalScrollerRef
  const preview = useSession((s) => s.settings.preview)
  const proseFont = useSession((s) => s.settings.appearance.proseFont)
  const locale = useLocale()
  const setLightbox = useUi((s) => s.setLightbox)
  const openView = useUi((s) => s.openView)
  const toast = useUi((s) => s.toast)
  const openNote = useNotes((s) => s.openNote)
  const createNote = useNotes((s) => s.createNote)
  const editContent = useNotes((s) => s.editContent)
  const activeNoteId = useUi((s) => s.activeNoteId)
  const fallbackTitle = useNotes((s) => (activeNoteId ? s.notes[activeNoteId]?.title ?? '' : ''))
  const sourceNoteId = noteId ?? activeNoteId
  const currentTitle = noteTitle ?? fallbackTitle


  const debounced = useDebounced(content, 90)
  const rendered = useMemo(() => renderMarkdown(debounced, { externalImages: preview.externalImages, hideFrontMatter: true }), [debounced, locale, preview.externalImages])
  const embedContextTitle = rendered.hasEmbeds ? currentTitle : ''
  const [committedHtml, setCommittedHtml] = useState(rendered.html)
  const committedHtmlRef = useRef(committedHtml)
  const committedSourceRef = useRef(debounced)
  const preparationRef = useRef(0)
  const mermaidRevisionRef = useRef(0)
  const pendingViewportRef = useRef<PreviewViewport | null>(null)
  const copyResetTimersRef = useRef(new Map<HTMLElement, number>())
  const wikiNavigationRef = useRef(0)
  const wikiScrollCleanupRef = useRef<() => void>(() => {})
  const [mermaidEpoch, setMermaidEpoch] = useState(0)
  const [previewFile, setPreviewFile] = useState<{ url: string; filename: string } | null>(null)


  const htmlObj = useMemo(() => ({ __html: committedHtml }), [committedHtml])
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark')

  useEffect(() => {
    onHeadings?.(rendered.headings)
  }, [rendered.headings, onHeadings])


  const allTags = useNotes((s) => s.tags ?? [])
  const tagColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of allTags) {
      if (t.color) map.set(t.name, t.color)
    }
    return map
  }, [allTags])

  useEffect(() => {
    if (!hostRef.current) return
    const tagElements = hostRef.current.querySelectorAll<HTMLElement>('.inline-tag[data-tag]')
    tagElements.forEach((el) => {
      const raw = el.dataset.tag
      if (!raw) return
      const name = decodeDataValue(raw)
      const color = tagColorMap.get(name)
      if (color) {
        el.style.setProperty('--tag-color', color)
        el.style.setProperty('--tag-bg', `${color}18`)
        el.style.setProperty('--tag-bg-hover', `${color}2c`)
      } else {
        el.style.removeProperty('--tag-color')
        el.style.removeProperty('--tag-bg')
        el.style.removeProperty('--tag-bg-hover')
      }
    })
  }, [committedHtml, tagColorMap])

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const next = document.documentElement.dataset.theme ?? 'dark'
      setTheme((current) => (current === next ? current : next))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  useEffect(
    () => () => {
      wikiNavigationRef.current++
      wikiScrollCleanupRef.current()
      for (const timer of copyResetTimersRef.current.values()) window.clearTimeout(timer)
      copyResetTimersRef.current.clear()
    },
    [],
  )

  const startMermaidRender = useCallback(() => {
    const host = hostRef.current
    if (!host || !preview.mermaid) return

    const revision = ++mermaidRevisionRef.current
    void renderPendingMermaid<PreviewViewport | null>(host, theme === 'dark', {
      isCurrent: () => revision === mermaidRevisionRef.current && hostRef.current === host,
      beforeUpdate: () => {
        const scroller = scrollerRef.current
        return scroller ? capturePreviewViewport(scroller, host) : null
      },
      afterUpdate: (snapshot) => {
        const scroller = scrollerRef.current
        if (snapshot && scroller && hostRef.current === host) {
          restorePreviewViewport(scroller, host, snapshot)
        }
        onRendered?.()
      },
    })
  }, [onRendered, scrollerRef, preview.mermaid, theme])


  useEffect(() => {
    const revision = ++preparationRef.current
    let isCancelled = false

    const staging = document.createElement('div')
    staging.innerHTML = rendered.html

    const prepare = async () => {
      if (rendered.hasEmbeds) {
        await resolveNoteEmbeds(staging, {
          currentContent: debounced,
          currentTitle: embedContextTitle,
          isCurrent: () => !isCancelled && revision === preparationRef.current,
        })
      }
      await enhancePreview(staging, {
        math: preview.math,
        mermaid: preview.mermaid,
        dark: theme === 'dark',
        codeBlockCollapseLines: preview.codeBlockCollapse
          ? preview.codeBlockCollapseLines
          : 0,
      })
      enhanceTablesInRoot(staging)
      if (isCancelled || revision !== preparationRef.current) return

      restorePreviewInteractionState(staging, capturePreviewInteractionState(hostRef.current))

      const nextHtml = staging.innerHTML
      committedSourceRef.current = debounced
      if (nextHtml !== committedHtmlRef.current) {
        const scroller = scrollerRef.current
        const host = hostRef.current
        pendingViewportRef.current =
          scroller && host ? capturePreviewViewport(scroller, host) : null
        committedHtmlRef.current = nextHtml
        setCommittedHtml(nextHtml)
      }
      setMermaidEpoch((current) => current + 1)
    }
    void prepare()

    return () => {
      isCancelled = true
    }
  }, [
    debounced,
    embedContextTitle,
    rendered.hasEmbeds,
    rendered.html,
    scrollerRef,
    preview.math,
    preview.mermaid,
    preview.codeBlockCollapse,
    preview.codeBlockCollapseLines,
    theme,
  ])


  useEffect(() => {
    if (!mermaidEpoch || !preview.mermaid) return
    const timer = window.setTimeout(startMermaidRender, 60)
    return () => {
      window.clearTimeout(timer)
      mermaidRevisionRef.current++
    }
  }, [mermaidEpoch, preview.mermaid, startMermaidRender])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    void renderChartJs(host, theme === 'dark')
    return () => {
      destroyChartInstances(host)
    }
  }, [committedHtml, theme])

  useLayoutEffect(() => {
    const snapshot = pendingViewportRef.current
    pendingViewportRef.current = null
    const scroller = scrollerRef.current
    const host = hostRef.current
    if (snapshot && scroller && host) restorePreviewViewport(scroller, host, snapshot)
    onRendered?.()
  }, [committedHtml, onRendered, scrollerRef])


  const resolveHoverCandidate = useCallback((link: HTMLElement): WikiLinkHoverCardState | null => {
    const parsed = parseWikiTarget(decodeDataValue(link.dataset.wikilink))
    const notes = useNotes.getState().notes
    if (parsed.noteTitle) {
      const note = findNoteByTitle(parsed.noteTitle)
      if (note)
        return {
          anchor: link,
          title: parsed.alias ?? note.title,
          noteId: note.id,
          missing: false,
          headline: parsed.heading ?? note.title,
        }
      return {
        anchor: link,
        title: parsed.alias ?? parsed.noteTitle,
        noteId: null,
        missing: true,
        headline: parsed.heading ?? parsed.noteTitle,
      }
    }
    const currentId = sourceNoteId
    const summary = currentId ? notes[currentId] : undefined
    if (!summary) return null
    return {
      anchor: link,
      title: parsed.alias ?? summary.title,
      noteId: currentId,
      missing: false,
      headline: parsed.heading ?? summary.title,
    }
  }, [sourceNoteId])

  const linkHover = useLinkHover({
    resolve: resolveHoverCandidate,
    delay: preview.linkHoverDelayMs,
    enabled: preview.linkHover,
    armOnNonLink: true,
  })
  const hoverCard = linkHover.card

  const handlePin = useCallback((card: WikiLinkHoverCardState, rect: DOMRect) => {
    usePinnedWindows.getState().pin(card, rect)
    linkHover.hideNow()
  }, [linkHover.hideNow])

  useEffect(() => {
    linkHover.hideNow()
  }, [committedHtml, linkHover.hideNow])

  useEffect(() => {
    const onScroll = (event: Event) => {
      const target = event.target as Element | null
      if (target && typeof target.closest === 'function' && target.closest('[role="tooltip"]'))
        return
      linkHover.hideNow()
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [linkHover.hideNow])

  const onMouseLeave = () => {
    linkHover.handleMouseLeave()
  }

  const onFocus = (event: React.FocusEvent) => {
    const link = (event.target as HTMLElement).closest<HTMLElement>('[data-wikilink]')
    if (!link) return
    linkHover.propose(link, { immediate: true })
  }

  const onBlur = (event: React.FocusEvent) => {
    const related = event.relatedTarget as Element | null
    if (related && typeof related.closest === 'function' && related.closest('[role="tooltip"]')) {
      linkHover.clearPendingHide()
      return
    }
    linkHover.armHide(0)
  }
  const onClick = createPreviewClickHandler({
    content,
    sourceNoteId,
    hostRef,
    scrollerRef,
    committedSourceRef,
    copyResetTimersRef,
    wikiNavigationRef,
    wikiScrollCleanupRef,
    hideHover: linkHover.hideNow,
    startMermaidRender,
    api: {
      setLightbox,
      setPreviewFile,
      openNote,
      createNote,
      openView,
      editContent,
      toast,
    },
  })

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      linkHover.hideNow()
      usePinnedWindows.getState().closeFront()
      return
    }
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tab-button]')
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      moveMarkdownTabFocus(tab, event.key)
      return
    }
    if (event.key === 'Enter') {
      const selectedCell = hostRef.current?.querySelector<HTMLTableCellElement>('.is-selected-cell')
      if (selectedCell && !selectedCell.classList.contains('is-editing-cell') && sourceNoteId) {
        event.preventDefault()
        startTableCellEditing(selectedCell, content, (next) => editContent(sourceNoteId, next))
        return
      }
    }

    const interactiveLink = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-wikilink], [data-block-ref], [data-tag]',
    )
    if (interactiveLink && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      interactiveLink.click()
    }
  }

  const onDoubleClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    const tableCell = target.closest<HTMLTableCellElement>('td, th')
    if (tableCell && sourceNoteId) {
      startTableCellEditing(tableCell, content, (next) => editContent(sourceNoteId, next))
    }
  }

  return (
    <div
      ref={scrollerRef}
      onContextMenu={(event) => {
        event.preventDefault()
        onContextMenu?.(event, event.target as HTMLElement)
      }}
      className={cn('h-full overflow-y-auto overscroll-contain px-4 py-3', className)}
      data-preview-scroller
    >
      <NotePropertiesEditor noteId={sourceNoteId} content={content} />
      <div
        ref={hostRef}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onMouseMove={linkHover.handleMouseMove}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        data-font={proseFont}
        data-preview-content
        className="ink-prose"
        dangerouslySetInnerHTML={htmlObj}
      />
      {hoverCard && (
        <WikiLinkHoverCard
          card={hoverCard}
          path={hoverCard.noteId ? [hoverCard.noteId] : []}
          depth={1}
          dark={theme === 'dark'}
          onClose={linkHover.hideNow}
          onEnter={linkHover.clearPendingHide}
          onLeave={linkHover.armHide}
          onPin={handlePin}
        />
      )}
      {previewFile && (
        <FilePreviewModal
          open={Boolean(previewFile)}
          onClose={() => setPreviewFile(null)}
          url={previewFile.url}
          filename={previewFile.filename}
        />
      )}
    </div>
  )
})
