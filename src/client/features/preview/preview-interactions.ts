import type { Dispatch, MouseEvent as ReactMouseEvent, RefObject, SetStateAction } from 'react'
import { t } from '../../lib/i18n'
import { decodeDataValue } from '../../lib/markdown/data-attr'
import { parseWikiTarget } from '../../lib/markdown/renderer'
import { resetMermaidNode, toggleCodeBlockCollapse } from '../../lib/markdown/enhance'
import { preferredScrollBehavior } from '../../lib/motion'
import { updateTaskAtSourceLine } from '../../editor/commands'
import { useUi } from '../../store/ui'
import { useNotes } from '../../store/notes'
import { findNoteByTitle } from '../../store/notes/selectors'
import { executeTableFloatingAction, handleTableCellSelection } from './table-interactive'
import { handleJsExampleRun, handleJsExampleSwitch } from './js-runner'
import { selectMarkdownTab } from './markdown-tabs'
import { capturePreviewViewport, restorePreviewViewport } from './viewport'
import { scrollElementIntoView, scrollToWikiTarget } from './wiki-scroll'

type UiState = ReturnType<typeof useUi.getState>
type NotesState = ReturnType<typeof useNotes.getState>

export interface PreviewClickApi {
  setLightbox: UiState['setLightbox']
  setPreviewFile: Dispatch<SetStateAction<{ url: string; filename: string } | null>>
  openNote: NotesState['openNote']
  createNote: NotesState['createNote']
  openView: UiState['openView']
  editContent: NotesState['editContent']
  toast: UiState['toast']
}

export interface PreviewClickParams {
  content: string
  sourceNoteId: string | null
  hostRef: RefObject<HTMLDivElement | null>
  scrollerRef: RefObject<HTMLDivElement | null>
  committedSourceRef: RefObject<string>
  copyResetTimersRef: RefObject<Map<HTMLElement, number>>
  wikiNavigationRef: RefObject<number>
  wikiScrollCleanupRef: RefObject<() => void>
  hideHover: () => void
  startMermaidRender: () => void
  api: PreviewClickApi
}

/** DOM click handling for the rendered preview body: file/table/JS-runner actions, mermaid retry, code copy/collapse, task checkboxes, wiki/block/tag navigation, lightbox, anchors. */
export function createPreviewClickHandler(params: PreviewClickParams): (event: ReactMouseEvent) => Promise<void> {
  const {
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
    api,
  } = params
  const { setLightbox, setPreviewFile, openNote, createNote, openView, editContent, toast } = api
  return async (event: ReactMouseEvent) => {
    const target = event.target as HTMLElement
    hideHover()

    const fileActionBtn = target.closest<HTMLElement>('[data-file-action]')
    if (fileActionBtn) {
      event.preventDefault()
      const action = fileActionBtn.dataset.fileAction
      const card = fileActionBtn.closest<HTMLElement>('[data-file-card]')
      const fileUrl = card?.dataset.fileUrl ?? ''
      const fileName = card?.dataset.fileName ?? 'file'

      if (action === 'preview') {
        const isImage = /\.(jpe?g|png|gif|webp|avif|svg)$/i.test(fileName)
        if (isImage) {
          setLightbox({ src: fileUrl, alt: fileName })
        } else {
          setPreviewFile({ url: fileUrl, filename: fileName })
        }
        return
      }

      if (action === 'download') {
        const link = document.createElement('a')
        link.href = fileUrl
        link.download = fileName
        link.rel = 'noopener noreferrer'
        document.body.appendChild(link)
        link.click()
        link.remove()
        return
      }

      if (action === 'delete') {
        if (!sourceNoteId) return
        const committedSource = committedSourceRef.current
        const next = removeFileAttachmentFromContent(committedSource, fileUrl)
        if (next !== committedSource) {
          const previous = content
          editContent(sourceNoteId, next)
          toast({
            title: t('workspace.file_deleted'),
            kind: 'undo',
            action: {
              label: t('common.undo'),
              run: () => editContent(sourceNoteId, previous),
            },
            duration: 5000,
            tone: 'default',
          })
        }
        return
      }
    }

    const tableActionBtn = target.closest<HTMLButtonElement>('[data-table-action]')
    if (tableActionBtn && sourceNoteId) {
      event.preventDefault()
      executeTableFloatingAction(
        tableActionBtn.dataset.tableAction!,
        tableActionBtn,
        content,
        (next) => editContent(sourceNoteId, next),
      )
      return
    }

    const jsSwitchBtn = target.closest<HTMLButtonElement>('[data-js-switch]')
    if (jsSwitchBtn) {
      event.preventDefault()
      handleJsExampleSwitch(jsSwitchBtn)
      return
    }

    const jsRunBtn = target.closest<HTMLButtonElement>('[data-js-run]')
    if (jsRunBtn) {
      event.preventDefault()
      handleJsExampleRun(jsRunBtn)
      return
    }

    const tableCell = target.closest<HTMLTableCellElement>('td, th')
    if (tableCell && hostRef.current) {
      handleTableCellSelection(tableCell, hostRef.current)
    }

    const mermaidRetry = target.closest<HTMLElement>('[data-mermaid-retry]')
    if (mermaidRetry) {
      const block = mermaidRetry.closest<HTMLElement>('[data-mermaid]')
      if (block) {
        const scroller = scrollerRef.current
        const host = hostRef.current
        const snapshot =
          scroller && host ? capturePreviewViewport(scroller, host) : null
        resetMermaidNode(block)
        if (snapshot && scroller && host) restorePreviewViewport(scroller, host, snapshot)
        startMermaidRender()
      }
      return
    }

    const copyButton = target.closest<HTMLElement>('[data-copy]')
    if (copyButton) {
      const code = copyButton.closest('.code-block')?.querySelector('pre')?.textContent ?? ''
      if (!navigator.clipboard?.writeText) {
        toast({ title: t("preview.could_not_copy"), tone: 'danger' })
        return
      }
      try {
        await navigator.clipboard.writeText(code)
        if (!hostRef.current?.contains(copyButton)) return
        const existingTimer = copyResetTimersRef.current.get(copyButton)
        if (existingTimer !== undefined) window.clearTimeout(existingTimer)
        copyButton.textContent = t("common.copied")
        copyButton.classList.add('copied')
        const timer = window.setTimeout(() => {
          if (hostRef.current?.contains(copyButton)) {
            copyButton.textContent = t("common.copy")
            copyButton.classList.remove('copied')
          }
          copyResetTimersRef.current.delete(copyButton)
        }, 900)
        copyResetTimersRef.current.set(copyButton, timer)
      } catch {
        toast({ title: t("preview.could_not_copy"), tone: 'danger' })
      }
      return
    }

    const collapseButton = target.closest<HTMLButtonElement>('[data-code-collapse]')
    if (collapseButton) {
      toggleCodeBlockCollapse(collapseButton)
      return
    }

    const checkbox = target.closest<HTMLInputElement>('input[type="checkbox"]')
    if (checkbox) {
      if (checkbox.disabled || checkbox.closest('.note-embed-body')) return


      const checked = checkbox.checked
      const line = Number(checkbox.dataset.taskLine)
      if (Number.isInteger(line) && line >= 0) {
        const committedSource = committedSourceRef.current
        if (content !== committedSource) {
          checkbox.checked = !checked
          toast({ title: t("preview.the_preview_is_updating_try_again_in_a_moment"), tone: 'warning' })
          return
        }
        const next = updateTaskAtSourceLine(committedSource, line, checked)
        if (next == null || !sourceNoteId) {
          checkbox.checked = !checked
          toast({ title: t("preview.could_not_update_this_task"), tone: 'warning' })
          return
        }
        editContent(sourceNoteId, next)
      }
      return
    }

    const tabButton = target.closest<HTMLButtonElement>('[data-tab-button]')
    if (tabButton) {
      event.preventDefault()
      selectMarkdownTab(tabButton)
      return
    }

    const wikilink = target.closest<HTMLElement>('[data-wikilink]')
    if (wikilink) {
      event.preventDefault()
      wikiScrollCleanupRef.current()
      const navigation = ++wikiNavigationRef.current
      const parsed = parseWikiTarget(decodeDataValue(wikilink.dataset.wikilink))
      const note = parsed.noteTitle ? findNoteByTitle(parsed.noteTitle) : sourceNoteId ? useNotes.getState().notes[sourceNoteId] : undefined
      if (note) {
        await openNote(note.id)
        const isCurrent = () =>
          navigation === wikiNavigationRef.current &&
          useUi.getState().activeNoteId === note.id
        if (isCurrent()) {
          wikiScrollCleanupRef.current = scrollToWikiTarget(hostRef, parsed, isCurrent)
        }
      } else if (parsed.noteTitle) {
        const id = await createNote({ title: parsed.noteTitle, open: false })
        if (id) {
          toast({ title: t("preview.created_title", { title: parsed.noteTitle }), tone: 'success' })
          if (
            navigation === wikiNavigationRef.current &&
            useUi.getState().activeNoteId === sourceNoteId
          ) {
            await openNote(id)
          }
        }
      }
      return
    }

    const blockReference = target.closest<HTMLElement>('[data-block-ref]')
    if (blockReference) {
      event.preventDefault()
      scrollElementIntoView(hostRef.current?.querySelector(`#${CSS.escape(`^${blockReference.dataset.blockRef ?? ''}`)}`))
      return
    }

    const tag = target.closest<HTMLElement>('[data-tag]')
    if (tag) {
      event.preventDefault()
      openView('tag', { tag: decodeDataValue(tag.dataset.tag) })
      return
    }

    const image = target.closest<HTMLImageElement>('img')
    if (image?.src) {
      event.preventDefault()
      setLightbox({ src: image.src, alt: image.alt })
      return
    }

    const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]')
    if (anchor) {
      event.preventDefault()
      const rawId = anchor.getAttribute('href')!.slice(1)
      let id = rawId
      try {
        id = decodeURIComponent(rawId)
      } catch {

      }
      const heading = hostRef.current?.querySelector(`#${CSS.escape(id)}`)
      heading?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' })
    }
  }
}

function removeFileAttachmentFromContent(source: string, url: string): string {
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(^|\\n)[ \\t]*\\[[^\\]]*\\]\\(<(?:${escapedUrl})>(?:\\s+["'][^"']*["'])?\\)[ \\t]*(?:\\r?\\n|$)`, 'g')
  let next = source.replace(pattern, (_match, prefix) => prefix ? '\n' : '')
  if (next === source) {
    const plainPattern = new RegExp(`(^|\\n)[ \\t]*\\[[^\\]]*\\]\\((?:${escapedUrl})(?:\\s+["'][^"']*["'])?\\)[ \\t]*(?:\\r?\\n|$)`, 'g')
    next = source.replace(plainPattern, (_match, prefix) => prefix ? '\n' : '')
  }
  if (next === source) {
    const inlinePattern = new RegExp(`\\[[^\\]]*\\]\\(<?(?:${escapedUrl})>?(?:\\s+["'][^"']*["'])?\\)`, 'g')
    next = source.replace(inlinePattern, '')
  }
  return next
}
