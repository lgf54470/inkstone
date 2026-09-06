import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { PreviewSettings } from '@shared/types/settings'
import type { Tag } from '@shared/types/notes'
import { useDebounced } from '../../lib/hooks'
import { decodeDataValue } from '../../lib/markdown/data-attr'
import { parseWikiTarget, renderMarkdown, type Heading } from '../../lib/markdown/renderer'
import { resolveNoteEmbeds } from '../../lib/markdown/embeds'
import { useLocale } from '../../lib/i18n'
import { destroyChartInstances, enhancePreview, renderChartJs, renderPendingMermaid } from '../../lib/markdown/enhance'
import { useUi } from '../../store/ui'
import { findNoteByTitle } from '../../store/notes/selectors'
import { useNotes } from '../../store/notes'
import { useSession } from '../../store/session'
import { createPreviewClickHandler } from './preview-interactions'
import { moveMarkdownTabFocus } from './markdown-tabs'
import { capturePreviewInteractionState, restorePreviewInteractionState } from './preview-state'
import type { WikiLinkHoverCardState } from './wiki-link-hover-card'
import { useLinkHover } from './link-hover'
import { capturePreviewViewport, restorePreviewViewport, type PreviewViewport } from './viewport'
import { usePinnedWindows } from '../../store/pinned-windows'
import { enhanceTablesInRoot, startTableCellEditing } from './table-interactive'

const PREVIEW_DEBOUNCE_MS = 90
const MERMAID_RENDER_DELAY_MS = 60

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

async function prepareStagedHtml(opts: {
  staging: HTMLDivElement
  rendered: ReturnType<typeof renderMarkdown>
  debounced: string
  embedContextTitle: string
  preview: PreviewSettings
  theme: string
  host: HTMLDivElement | null
  isCurrent: () => boolean
}): Promise<string | null> {
  const { staging, rendered, debounced, embedContextTitle, preview, theme, host, isCurrent } = opts
  if (rendered.hasEmbeds) {
    await resolveNoteEmbeds(staging, {
      currentContent: debounced,
      currentTitle: embedContextTitle,
      isCurrent,
    })
  }
  await enhancePreview(staging, {
    math: preview.math,
    mermaid: preview.mermaid,
    dark: theme === 'dark',
    codeBlockCollapseLines: preview.codeBlockCollapse ? preview.codeBlockCollapseLines : 0,
  })
  enhanceTablesInRoot(staging)
  if (!isCurrent()) return null
  restorePreviewInteractionState(staging, capturePreviewInteractionState(host))
  return staging.innerHTML
}

function resolveHoverCandidate(link: HTMLElement, sourceNoteId: string | null): WikiLinkHoverCardState | null {
  const parsed = parseWikiTarget(decodeDataValue(link.dataset.wikilink))
  const notes = useNotes.getState().notes
  if (parsed.noteTitle) {
    const note = findNoteByTitle(parsed.noteTitle)
    if (note) {
      return { anchor: link, title: parsed.alias ?? note.title, noteId: note.id, missing: false, headline: parsed.heading ?? note.title }
    }
    return { anchor: link, title: parsed.alias ?? parsed.noteTitle, noteId: null, missing: true, headline: parsed.heading ?? parsed.noteTitle }
  }
  const currentId = sourceNoteId
  const summary = currentId ? notes[currentId] : undefined
  if (!summary) return null
  return { anchor: link, title: parsed.alias ?? summary.title, noteId: currentId, missing: false, headline: parsed.heading ?? summary.title }
}

function usePreviewSource(props: PreviewProps) {
  const { content, noteId, noteTitle, onHeadings, scrollerRef: externalScrollerRef, onRendered } = props
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
  const allTags = useNotes((s) => s.tags ?? [])
  const fallbackTitle = useNotes((s) => (activeNoteId ? s.notes[activeNoteId]?.title ?? '' : ''))
  const sourceNoteId = noteId ?? activeNoteId
  const currentTitle = noteTitle ?? fallbackTitle

  const debounced = useDebounced(content, PREVIEW_DEBOUNCE_MS)
  const rendered = useMemo(
    () => renderMarkdown(debounced, { externalImages: preview.externalImages, hideFrontMatter: true }),
    [debounced, locale, preview.externalImages],
  )
  const embedContextTitle = rendered.hasEmbeds ? currentTitle : ''

  useEffect(() => {
    onHeadings?.(rendered.headings)
  }, [rendered.headings, onHeadings])

  return {
    content,
    onRendered,
    hostRef,
    scrollerRef,
    sourceNoteId,
    preview,
    proseFont,
    editContent,
    allTags,
    debounced,
    rendered,
    embedContextTitle,
    api: { setLightbox, openView, toast, openNote, createNote, editContent },
  }
}

type PreviewSource = ReturnType<typeof usePreviewSource>

function useThemeTracking() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark')
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const next = document.documentElement.dataset.theme ?? 'dark'
      setTheme((current) => (current === next ? current : next))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

function useTagColors(hostRef: RefObject<HTMLDivElement | null>, committedHtml: string, allTags: Tag[]) {
  const tagColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const tag of allTags) {
      if (tag.color) map.set(tag.name, tag.color)
    }
    return map
  }, [allTags])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const tagElements = host.querySelectorAll<HTMLElement>('.inline-tag[data-tag]')
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
}

function usePreviewRendering(opts: {
  rendered: ReturnType<typeof renderMarkdown>
  debounced: string
  embedContextTitle: string
  preview: PreviewSettings
  theme: string
  hostRef: RefObject<HTMLDivElement | null>
  scrollerRef: RefObject<HTMLDivElement | null>
}) {
  const { rendered, debounced, embedContextTitle, preview, theme, hostRef, scrollerRef } = opts
  const [committedHtml, setCommittedHtml] = useState(rendered.html)
  const committedHtmlRef = useRef(committedHtml)
  const committedSourceRef = useRef(debounced)
  const preparationRef = useRef(0)
  const pendingViewportRef = useRef<PreviewViewport | null>(null)
  const [mermaidEpoch, setMermaidEpoch] = useState(0)
  const htmlObj = useMemo(() => ({ __html: committedHtml }), [committedHtml])

  useEffect(() => {
    const revision = ++preparationRef.current
    let isCancelled = false
    const staging = document.createElement('div')
    staging.innerHTML = rendered.html

    void prepareStagedHtml({
      staging,
      rendered,
      debounced,
      embedContextTitle,
      preview,
      theme,
      host: hostRef.current,
      isCurrent: () => !isCancelled && revision === preparationRef.current,
    }).then((nextHtml) => {
      if (nextHtml === null || isCancelled || revision !== preparationRef.current) return
      committedSourceRef.current = debounced
      if (nextHtml !== committedHtmlRef.current) {
        const scroller = scrollerRef.current
        const host = hostRef.current
        pendingViewportRef.current = scroller && host ? capturePreviewViewport(scroller, host) : null
        committedHtmlRef.current = nextHtml
        setCommittedHtml(nextHtml)
      }
      setMermaidEpoch((current) => current + 1)
    })

    return () => {
      isCancelled = true
    }
  }, [debounced, embedContextTitle, rendered.hasEmbeds, rendered.html, scrollerRef, preview.math, preview.mermaid, preview.codeBlockCollapse, preview.codeBlockCollapseLines, theme])

  return { committedHtml, htmlObj, committedSourceRef, pendingViewportRef, mermaidEpoch }
}

function usePreviewPostRender(opts: {
  committedHtml: string
  theme: string
  hostRef: RefObject<HTMLDivElement | null>
  scrollerRef: RefObject<HTMLDivElement | null>
  onRendered: (() => void) | undefined
  pendingViewportRef: RefObject<PreviewViewport | null>
  mermaidEpoch: number
  preview: PreviewSettings
}) {
  const { committedHtml, theme, hostRef, scrollerRef, onRendered, pendingViewportRef, mermaidEpoch, preview } = opts
  const mermaidRevisionRef = useRef(0)

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
        if (snapshot && scroller && hostRef.current === host) restorePreviewViewport(scroller, host, snapshot)
        onRendered?.()
      },
    })
  }, [onRendered, scrollerRef, preview.mermaid, theme])

  useEffect(() => {
    if (!mermaidEpoch || !preview.mermaid) return
    const timer = window.setTimeout(startMermaidRender, MERMAID_RENDER_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      mermaidRevisionRef.current++
    }
  }, [mermaidEpoch, preview.mermaid, startMermaidRender])


  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    void renderChartJs(host, theme === 'dark')
    return () => destroyChartInstances(host)
  }, [committedHtml, theme])

  useLayoutEffect(() => {
    const snapshot = pendingViewportRef.current
    pendingViewportRef.current = null
    const scroller = scrollerRef.current
    const host = hostRef.current
    if (snapshot && scroller && host) restorePreviewViewport(scroller, host, snapshot)
    onRendered?.()
  }, [committedHtml, onRendered, scrollerRef])

  return startMermaidRender
}

function usePreviewLinkHover(opts: { sourceNoteId: string | null; preview: PreviewSettings; committedHtml: string }) {
  const { sourceNoteId, preview, committedHtml } = opts

  const resolve = useCallback((link: HTMLElement) => resolveHoverCandidate(link, sourceNoteId), [sourceNoteId])

  const linkHover = useLinkHover({
    resolve,
    delay: preview.linkHoverDelayMs,
    enabled: preview.linkHover,
    armOnNonLink: true,
  })

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
      if (target && typeof target.closest === 'function' && target.closest('[role="tooltip"]')) return
      linkHover.hideNow()
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [linkHover.hideNow])

  const onMouseLeave = () => linkHover.handleMouseLeave()

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

  return { linkHover, hoverCard: linkHover.card, handlePin, onMouseLeave, onFocus, onBlur }
}

function usePreviewInteractions(opts: {
  content: string
  sourceNoteId: string | null
  hostRef: RefObject<HTMLDivElement | null>
  scrollerRef: RefObject<HTMLDivElement | null>
  committedSourceRef: RefObject<string>
  startMermaidRender: () => void
  hideHover: () => void
  setPreviewFile: Dispatch<SetStateAction<{ url: string; filename: string } | null>>
  api: PreviewSource['api']
}) {
  const { content, sourceNoteId, hostRef, scrollerRef, committedSourceRef, startMermaidRender, hideHover, setPreviewFile, api } = opts
  const copyResetTimersRef = useRef(new Map<HTMLElement, number>())
  const wikiNavigationRef = useRef(0)
  const wikiScrollCleanupRef = useRef<() => void>(() => {})

  useEffect(() => () => {
    wikiNavigationRef.current++
    wikiScrollCleanupRef.current()
    for (const timer of copyResetTimersRef.current.values()) window.clearTimeout(timer)
    copyResetTimersRef.current.clear()
  }, [])

  return createPreviewClickHandler({
    content,
    sourceNoteId,
    hostRef,
    scrollerRef,
    committedSourceRef,
    copyResetTimersRef,
    wikiNavigationRef,
    wikiScrollCleanupRef,
    hideHover,
    startMermaidRender,
    api: { ...api, setPreviewFile },
  })
}

function usePreviewKeyboard(opts: {
  content: string
  sourceNoteId: string | null
  hostRef: RefObject<HTMLDivElement | null>
  editContent: (noteId: string, next: string) => void
  hideHover: () => void
}) {
  const { content, sourceNoteId, hostRef, editContent, hideHover } = opts

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      hideHover()
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
    const interactiveLink = (event.target as HTMLElement).closest<HTMLElement>('[data-wikilink], [data-block-ref], [data-tag]')
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

  return { onKeyDown, onDoubleClick }
}

export function usePreview(props: PreviewProps) {
  const src = usePreviewSource(props)
  const theme = useThemeTracking()
  const html = usePreviewRendering({ rendered: src.rendered, debounced: src.debounced, embedContextTitle: src.embedContextTitle, preview: src.preview, theme, hostRef: src.hostRef, scrollerRef: src.scrollerRef })
  useTagColors(src.hostRef, html.committedHtml, src.allTags)
  const startMermaidRender = usePreviewPostRender({ committedHtml: html.committedHtml, theme, hostRef: src.hostRef, scrollerRef: src.scrollerRef, onRendered: src.onRendered, pendingViewportRef: html.pendingViewportRef, mermaidEpoch: html.mermaidEpoch, preview: src.preview })
  const hover = usePreviewLinkHover({ sourceNoteId: src.sourceNoteId, preview: src.preview, committedHtml: html.committedHtml })
  const [previewFile, setPreviewFile] = useState<{ url: string; filename: string } | null>(null)
  const onClick = usePreviewInteractions({ content: src.content, sourceNoteId: src.sourceNoteId, hostRef: src.hostRef, scrollerRef: src.scrollerRef, committedSourceRef: html.committedSourceRef, startMermaidRender, hideHover: hover.linkHover.hideNow, setPreviewFile, api: src.api })
  const keyboard = usePreviewKeyboard({ content: src.content, sourceNoteId: src.sourceNoteId, hostRef: src.hostRef, editContent: src.editContent, hideHover: hover.linkHover.hideNow })

  return {
    content: src.content, proseFont: src.proseFont, sourceNoteId: src.sourceNoteId,
    scrollerRef: src.scrollerRef, hostRef: src.hostRef,
    htmlObj: html.htmlObj, theme,
    previewFile, setPreviewFile,
    hoverCard: hover.hoverCard, linkHover: hover.linkHover, handlePin: hover.handlePin,
    onMouseLeave: hover.onMouseLeave, onFocus: hover.onFocus, onBlur: hover.onBlur,
    onClick,
    ...keyboard,
  }
}
