import type { Dispatch, MouseEvent as ReactMouseEvent, RefObject, SetStateAction } from 'react'
import { t } from '../../lib/i18n'
import { decodeDataValue } from '../../lib/markdown/data-attr'
import { parseWikiTarget } from '../../lib/markdown/renderer'
import { resetMermaidNode, toggleCodeBlockCollapse } from '../../lib/markdown/enhance'
import { preferredScrollBehavior } from '../../lib/motion'
import { updateTaskAtSourceLine } from '../../editor/commands'
import { useUi } from '../../store/ui'
import { useNotes } from '../../store/notes'
import { findNoteByTitle } from '../../store/notes'
import { executeTableFloatingAction, handleTableCellSelection } from './table-interactive'
import { handleJsExampleRun, handleJsExampleSwitch } from './js-runner'
import { selectMarkdownTab } from './markdown-tabs'
import { capturePreviewViewport, restorePreviewViewport } from './viewport'
import { scrollElementIntoView, scrollToWikiTarget } from './wiki-scroll'

type UiState = ReturnType<typeof useUi.getState>
type NotesState = ReturnType<typeof useNotes.getState>


interface PreviewClickApi {
  setLightbox: UiState['setLightbox']
  setPreviewFile: Dispatch<SetStateAction<{ url: string; filename: string } | null>>
  openNote: NotesState['openNote']
  createNote: NotesState['createNote']
  openView: UiState['openView']
  editContent: NotesState['editContent']
  toast: UiState['toast']
}


interface PreviewClickParams {
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

interface PreviewClickContext {
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
  const ctx: PreviewClickContext = {
    content: params.content,
    sourceNoteId: params.sourceNoteId,
    hostRef: params.hostRef,
    scrollerRef: params.scrollerRef,
    committedSourceRef: params.committedSourceRef,
    copyResetTimersRef: params.copyResetTimersRef,
    wikiNavigationRef: params.wikiNavigationRef,
    wikiScrollCleanupRef: params.wikiScrollCleanupRef,
    hideHover: params.hideHover,
    startMermaidRender: params.startMermaidRender,
    api: params.api,
  }
  return async (event: ReactMouseEvent) => {
    const target = event.target as HTMLElement
    ctx.hideHover()
    if (await handleFileActionBtn(event, target, ctx)) return
    if (await handleTableActionBtn(event, target, ctx)) return
    if (await handleJsSwitchBtn(event, target)) return
    if (await handleJsRunBtn(event, target)) return
    handleTableCellSelectionIfPresent(target, ctx)
    if (await handleMermaidRetry(target, ctx)) return
    if (await handleCopyButton(target, ctx)) return
    if (await handleCodeCollapse(target)) return
    if (await handleTaskCheckbox(target, ctx)) return
    if (await handleTabButton(event, target)) return
    if (await handleWikiLink(event, target, ctx)) return
    if (await handleBlockReference(event, target, ctx)) return
    if (await handleTag(event, target, ctx)) return
    if (await handleImage(event, target, ctx)) return
    handleAnchor(event, target, ctx)
  }
}

function handleTableCellSelectionIfPresent(target: HTMLElement, ctx: PreviewClickContext): void {
  const tableCell = target.closest<HTMLTableCellElement>('td, th')
  if (tableCell && ctx.hostRef.current) {
    handleTableCellSelection(tableCell, ctx.hostRef.current)
  }
}

async function handleFileActionBtn(event: ReactMouseEvent, target: HTMLElement, ctx: PreviewClickContext): Promise<boolean> {
  const fileActionBtn = target.closest<HTMLElement>('[data-file-action]')
  if (!fileActionBtn) return false
  event.preventDefault()
  const action = fileActionBtn.dataset.fileAction
  const card = fileActionBtn.closest<HTMLElement>('[data-file-card]')
  const fileUrl = card?.dataset.fileUrl ?? ''
  const fileName = card?.dataset.fileName ?? 'file'

  if (action === 'preview') {
    const isImage = /\.(jpe?g|png|gif|webp|avif|svg)$/i.test(fileName)
    if (isImage) {
      ctx.api.setLightbox({ src: fileUrl, alt: fileName })
    } else {
      ctx.api.setPreviewFile({ url: fileUrl, filename: fileName })
    }
    return true
  }

  if (action === 'download') {
    const link = document.createElement('a')
    link.href = fileUrl
    link.download = fileName
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    link.remove()
    return true
  }

  if (action === 'delete') {
    if (ctx.sourceNoteId) handleFileDelete(ctx.sourceNoteId, fileUrl, ctx)
    return true
  }
  return true
}

function handleFileDelete(sourceNoteId: string, fileUrl: string, ctx: PreviewClickContext): void {
  const committedSource = ctx.committedSourceRef.current
  const next = removeFileAttachmentFromContent(committedSource, fileUrl)
  if (next !== committedSource) {
    const previous = ctx.content
    ctx.api.editContent(sourceNoteId, next)
    ctx.api.toast({
      title: t('workspace.file_deleted'),
      kind: 'undo',
      action: {
        label: t('common.undo'),
        run: () => ctx.api.editContent(sourceNoteId, previous),
      },
      duration: 5000,
      tone: 'default',
    })
  }
}

async function handleTableActionBtn(event: ReactMouseEvent, target: HTMLElement, ctx: PreviewClickContext): Promise<boolean> {
  const tableActionBtn = target.closest<HTMLButtonElement>('[data-table-action]')
  if (!tableActionBtn || !ctx.sourceNoteId) return false
  event.preventDefault()
  executeTableFloatingAction(
    tableActionBtn.dataset.tableAction!,
    tableActionBtn,
    ctx.content,
    (next) => ctx.api.editContent(ctx.sourceNoteId!, next),
  )
  return true
}

async function handleJsSwitchBtn(event: ReactMouseEvent, target: HTMLElement): Promise<boolean> {
  const jsSwitchBtn = target.closest<HTMLButtonElement>('[data-js-switch]')
  if (!jsSwitchBtn) return false
  event.preventDefault()
  handleJsExampleSwitch(jsSwitchBtn)
  return true
}

async function handleJsRunBtn(event: ReactMouseEvent, target: HTMLElement): Promise<boolean> {
  const jsRunBtn = target.closest<HTMLButtonElement>('[data-js-run]')
  if (!jsRunBtn) return false
  event.preventDefault()
  handleJsExampleRun(jsRunBtn)
  return true
}

async function handleMermaidRetry(target: HTMLElement, ctx: PreviewClickContext): Promise<boolean> {
  const mermaidRetry = target.closest<HTMLElement>('[data-mermaid-retry]')
  if (!mermaidRetry) return false
  const block = mermaidRetry.closest<HTMLElement>('[data-mermaid]')
  if (block) {
    const scroller = ctx.scrollerRef.current
    const host = ctx.hostRef.current
    const snapshot =
      scroller && host ? capturePreviewViewport(scroller, host) : null
    resetMermaidNode(block)
    if (snapshot && scroller && host) restorePreviewViewport(scroller, host, snapshot)
    ctx.startMermaidRender()
  }
  return true
}

async function handleCopyButton(target: HTMLElement, ctx: PreviewClickContext): Promise<boolean> {
  const copyButton = target.closest<HTMLElement>('[data-copy]')
  if (!copyButton) return false
  const code = copyButton.closest('.code-block')?.querySelector('pre')?.textContent ?? ''
  if (!navigator.clipboard?.writeText) {
    ctx.api.toast({ title: t('preview.could_not_copy'), tone: 'danger' })
    return true
  }
  try {
    await navigator.clipboard.writeText(code)
    if (!ctx.hostRef.current?.contains(copyButton)) return true
    const existingTimer = ctx.copyResetTimersRef.current.get(copyButton)
    if (existingTimer !== undefined) window.clearTimeout(existingTimer)
    copyButton.textContent = t('common.copied')
    copyButton.classList.add('copied')
    const timer = window.setTimeout(() => {
      if (ctx.hostRef.current?.contains(copyButton)) {
        copyButton.textContent = t('common.copy')
        copyButton.classList.remove('copied')
      }
      ctx.copyResetTimersRef.current.delete(copyButton)
    }, 900)
    ctx.copyResetTimersRef.current.set(copyButton, timer)
  } catch {
    ctx.api.toast({ title: t('preview.could_not_copy'), tone: 'danger' })
  }
  return true
}

async function handleCodeCollapse(target: HTMLElement): Promise<boolean> {
  const collapseButton = target.closest<HTMLButtonElement>('[data-code-collapse]')
  if (!collapseButton) return false
  toggleCodeBlockCollapse(collapseButton)
  return true
}

async function handleTaskCheckbox(target: HTMLElement, ctx: PreviewClickContext): Promise<boolean> {
  const checkbox = target.closest<HTMLInputElement>('input[type="checkbox"]')
  if (!checkbox) return false
  if (checkbox.disabled || checkbox.closest('.note-embed-body')) return true

  const checked = checkbox.checked
  const line = Number(checkbox.dataset.taskLine)
  if (Number.isInteger(line) && line >= 0) {
    const committedSource = ctx.committedSourceRef.current
    if (ctx.content !== committedSource) {
      checkbox.checked = !checked
      ctx.api.toast({ title: t('preview.the_preview_is_updating_try_again_in_a_moment'), tone: 'warning' })
      return true
    }
    const next = updateTaskAtSourceLine(committedSource, line, checked)
    if (next == null || !ctx.sourceNoteId) {
      checkbox.checked = !checked
      ctx.api.toast({ title: t('preview.could_not_update_this_task'), tone: 'warning' })
      return true
    }
    ctx.api.editContent(ctx.sourceNoteId, next)
  }
  return true
}

async function handleTabButton(event: ReactMouseEvent, target: HTMLElement): Promise<boolean> {
  const tabButton = target.closest<HTMLButtonElement>('[data-tab-button]')
  if (!tabButton) return false
  event.preventDefault()
  selectMarkdownTab(tabButton)
  return true
}

async function handleWikiLink(event: ReactMouseEvent, target: HTMLElement, ctx: PreviewClickContext): Promise<boolean> {
  const wikilink = target.closest<HTMLElement>('[data-wikilink]')
  if (!wikilink) return false
  event.preventDefault()
  ctx.wikiScrollCleanupRef.current()
  const navigation = ++ctx.wikiNavigationRef.current
  const parsed = parseWikiTarget(decodeDataValue(wikilink.dataset.wikilink))
  const note = parsed.noteTitle ? findNoteByTitle(parsed.noteTitle) : ctx.sourceNoteId ? useNotes.getState().notes[ctx.sourceNoteId] : undefined
  if (note) {
    await ctx.api.openNote(note.id)
    const isCurrent = () =>
      navigation === ctx.wikiNavigationRef.current &&
      useUi.getState().activeNoteId === note.id
    if (isCurrent()) {
      ctx.wikiScrollCleanupRef.current = scrollToWikiTarget(ctx.hostRef, parsed, isCurrent)
    }
    return true
  }
  if (!parsed.noteTitle) return true
  const id = await ctx.api.createNote({ title: parsed.noteTitle, open: false })
  if (id) {
    ctx.api.toast({ title: t('preview.created_title', { title: parsed.noteTitle }), tone: 'success' })
    if (
      navigation === ctx.wikiNavigationRef.current &&
      useUi.getState().activeNoteId === ctx.sourceNoteId
    ) {
      await ctx.api.openNote(id)
    }
  }
  return true
}

async function handleBlockReference(event: ReactMouseEvent, target: HTMLElement, ctx: PreviewClickContext): Promise<boolean> {
  const blockReference = target.closest<HTMLElement>('[data-block-ref]')
  if (!blockReference) return false
  event.preventDefault()
  scrollElementIntoView(ctx.hostRef.current?.querySelector(`#${CSS.escape(`^${blockReference.dataset.blockRef ?? ''}`)}`))
  return true
}

async function handleTag(event: ReactMouseEvent, target: HTMLElement, ctx: PreviewClickContext): Promise<boolean> {
  const tag = target.closest<HTMLElement>('[data-tag]')
  if (!tag) return false
  event.preventDefault()
  ctx.api.openView('tag', { tag: decodeDataValue(tag.dataset.tag) })
  return true
}

async function handleImage(event: ReactMouseEvent, target: HTMLElement, ctx: PreviewClickContext): Promise<boolean> {
  const image = target.closest<HTMLImageElement>('img')
  if (!image?.src) return false
  event.preventDefault()
  ctx.api.setLightbox({ src: image.src, alt: image.alt })
  return true
}

function handleAnchor(event: ReactMouseEvent, target: HTMLElement, ctx: PreviewClickContext): void {
  const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]')
  if (!anchor) return
  event.preventDefault()
  const rawId = anchor.getAttribute('href')!.slice(1)
  let id = rawId
  try {
    id = decodeURIComponent(rawId)
  } catch {
    // Malformed percent-encoding falls back to the raw id.
  }
  const heading = ctx.hostRef.current?.querySelector(`#${CSS.escape(id)}`)
  heading?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' })
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