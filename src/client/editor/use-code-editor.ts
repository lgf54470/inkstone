import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers, placeholder as placeholderExt } from '@codemirror/view'
import { foldGutter, indentUnit } from '@codemirror/language'
import type { EditorSettings } from '@shared/types'
import { decodeDataValue } from '../lib/markdown/data-attr'
import { parseWikiTarget } from '../lib/markdown/renderer'
import { findNoteByTitle, takePendingEditorCursor } from '../store/notes'
import { useNotes } from '../store/notes'
import { useSession } from '../store/session'
import { usePinnedWindows } from '../store/pinned-windows'
import { setFocusMode } from './decorations'
import { type CompletionSources } from './completion'
import { type PasteHandlers } from './paste'
import { useLinkHover, type WikiLinkHoverCardState } from '../features/preview'
import { editorExtensions, externalValueUpdate, type CodeEditorCallbacks, type EditorCompartments } from './editor-extensions'
import { t } from '../lib/i18n'

export interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  settings: EditorSettings
  sources: CompletionSources
  handlers: PasteHandlers
  noteId?: string | null
  onReady?: (view: EditorView | null) => void
  onScroll?: (view: EditorView) => void
  onCursorLine?: (line: number) => void
  onContextMenu?: (event: MouseEvent, view: EditorView) => void
  placeholder?: string
  className?: string
}


interface CodeEditorBundle {
  hostRef: RefObject<HTMLDivElement | null>
  dark: boolean
  card: WikiLinkHoverCardState | null
  hideNow: () => void
  clearPendingHide: () => void
  armHide: () => void
  handlePin: (card: WikiLinkHoverCardState, rect: DOMRect) => void
  handleHostContextMenu: (event: ReactMouseEvent) => void
}

export function useCodeEditor(props: CodeEditorProps): CodeEditorBundle {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const dark = useEditorTheme()
  const hover = useEditorHover(props.noteId ?? null, useSession((s) => s.settings.preview))
  const cbRef = useRef<CodeEditorCallbacks>({ sources: props.sources, handlers: props.handlers, onChange: props.onChange, onScroll: props.onScroll, onCursorLine: props.onCursorLine, onContextMenu: props.onContextMenu })
  cbRef.current = { sources: props.sources, handlers: props.handlers, onChange: props.onChange, onScroll: props.onScroll, onCursorLine: props.onCursorLine, onContextMenu: props.onContextMenu }
  const compartments = useMemo(() => ({ lineNumbers: new Compartment(), tabSize: new Compartment(), placeholder: new Compartment() }), [])
  useMountEditor({ hostRef, viewRef, cbRef, hover, compartments, props })
  useExternalValueSync(viewRef, props.value)
  useSettingsSync(viewRef, props.settings, props.placeholder ?? t('editor.start_writing'), compartments)
  useScrollHide(hover.hideNow)
  const handleHostContextMenu = (event: ReactMouseEvent) => {
    if (event.defaultPrevented) return
    event.preventDefault()
    const view = viewRef.current
    if (view && props.onContextMenu) {
      props.onContextMenu(event.nativeEvent, view)
    }
  }
  return {
    hostRef,
    dark,
    card: hover.card,
    hideNow: hover.hideNow,
    clearPendingHide: hover.clearPendingHide,
    armHide: hover.armHide,
    handlePin: hover.handlePin,
    handleHostContextMenu,
  }
}

function useEditorTheme(): boolean {
  const [dark, setDark] = useState(() => (document.documentElement.dataset.theme ?? 'dark') === 'dark')
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark((document.documentElement.dataset.theme ?? 'dark') === 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

function useEditorHover(noteId: string | null, preview: { linkHoverDelayMs: number; linkHover: boolean }) {
  const resolve = useCallback((link: HTMLElement): WikiLinkHoverCardState | null => {
    const parsed = parseWikiTarget(decodeDataValue(link.dataset.wikilink))
    const notes = useNotes.getState().notes
    if (parsed.noteTitle) {
      const note = findNoteByTitle(parsed.noteTitle)
      if (note) {
        return { anchor: link, title: parsed.alias ?? note.title, noteId: note.id, missing: false, headline: parsed.heading ?? note.title }
      }
      return { anchor: link, title: parsed.alias ?? parsed.noteTitle, noteId: null, missing: true, headline: parsed.heading ?? parsed.noteTitle }
    }
    const currentId = noteId
    const summary = currentId ? notes[currentId] : undefined
    if (!summary) return null
    return { anchor: link, title: parsed.alias ?? summary.title, noteId: currentId, missing: false, headline: parsed.heading ?? summary.title }
  }, [noteId])
  const hover = useLinkHover({
    resolve,
    delay: preview.linkHoverDelayMs,
    enabled: preview.linkHover,
    armOnNonLink: true,
  })
  const proposeRef = useRef<(link: HTMLElement | null, options?: { immediate?: boolean }) => void>(() => { })
  proposeRef.current = hover.propose
  const linkHoverRef = useRef<{ card: WikiLinkHoverCardState | null; hideNow: () => void }>({ card: hover.card, hideNow: hover.hideNow })
  linkHoverRef.current = { card: hover.card, hideNow: hover.hideNow }
  const handlePin = useCallback((card: WikiLinkHoverCardState, rect: DOMRect) => {
    usePinnedWindows.getState().pin(card, rect)
    hover.hideNow()
  }, [hover.hideNow])
  return { proposeRef, linkHoverRef, card: hover.card, hideNow: hover.hideNow, clearPendingHide: hover.clearPendingHide, armHide: hover.armHide, handlePin }
}

function useMountEditor(input: {
  hostRef: RefObject<HTMLDivElement | null>
  viewRef: RefObject<EditorView | null>
  cbRef: RefObject<CodeEditorCallbacks>
  hover: ReturnType<typeof useEditorHover>
  compartments: EditorCompartments
  props: CodeEditorProps
}) {
  useEffect(() => {
    const host = input.hostRef.current
    if (!host)
      return
    const view = new EditorView({
      state: EditorState.create({
        doc: input.props.value,
        extensions: editorExtensions({
          settings: input.props.settings,
          placeholder: input.props.placeholder ?? t('editor.start_writing'),
          live: { cb: input.cbRef, propose: input.hover.proposeRef, linkHover: input.hover.linkHoverRef },
          compartments: input.compartments,
        }),
      }),
      parent: host,
    })
    view.contentDOM.spellcheck = input.props.settings.spellcheck
    input.viewRef.current = view
    const pendingCursor = input.props.noteId ? takePendingEditorCursor(input.props.noteId) : null
    if (pendingCursor !== null) {
      view.dispatch({
        selection: EditorSelection.cursor(Math.min(pendingCursor, view.state.doc.length)),
        scrollIntoView: true,
      })
    }
    input.props.onReady?.(view)
    return () => {
      input.props.onReady?.(null)
      view.destroy()
      input.viewRef.current = null
    }
  }, [])
}

function useExternalValueSync(viewRef: RefObject<EditorView | null>, value: string) {
  useEffect(() => {
    const view = viewRef.current
    if (!view)
      return
    const current = view.state.doc.toString()
    if (current === value)
      return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) },
      annotations: externalValueUpdate.of(true),
    })
  }, [value])
}

function useSettingsSync(viewRef: RefObject<EditorView | null>, settings: EditorSettings, placeholder: string, compartments: EditorCompartments) {
  useReconfigure(viewRef, compartments.lineNumbers, settings.lineNumbers ? [lineNumbers(), foldGutter()] : [], settings.lineNumbers)
  useReconfigure(viewRef, compartments.tabSize, [indentUnit.of(' '.repeat(settings.tabSize))], settings.tabSize)
  useReconfigure(viewRef, compartments.placeholder, [placeholderExt(placeholder), EditorView.contentAttributes.of({ 'aria-label': placeholder })], placeholder)
  useEffect(() => {
    const content = viewRef.current?.contentDOM
    if (content)
      content.spellcheck = settings.spellcheck
  }, [settings.spellcheck])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setFocusMode.of(settings.focusMode) })
  }, [settings.focusMode])
}

function useReconfigure(viewRef: RefObject<EditorView | null>, compartment: Compartment, extension: Extension[], value: unknown) {
  useEffect(() => {
    const view = viewRef.current
    if (!view)
      return
    view.dispatch({ effects: compartment.reconfigure(extension) })
  }, [value])
}

function useScrollHide(hideNow: () => void) {
  useEffect(() => {
    const onScroll = (event: Event) => {
      const target = event.target as Element | null
      if (target && typeof target.closest === 'function' && target.closest('[role="tooltip"]'))
        return
      hideNow()
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [hideNow])
}
