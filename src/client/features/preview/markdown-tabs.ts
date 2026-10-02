import { fitMindmapBlock } from '../../lib/markdown/mindmap'
import { fitExcalidrawBlock } from '../../lib/markdown/excalidraw'

const SYNC_STORAGE_PREFIX = 'inkstone:tabs-sync:v1:'

export function directTabsButtons(tabs: HTMLElement): HTMLButtonElement[] {
  return [...tabs.querySelectorAll<HTMLButtonElement>('[data-tab-button]')].filter(
    (candidate) => candidate.closest('[data-tabs]') === tabs,
  )
}

export function directTabPanels(tabs: HTMLElement): HTMLElement[] {
  return [...tabs.querySelectorAll<HTMLElement>('[data-tab-panel]')].filter(
    (panel) => panel.closest('[data-tabs]') === tabs,
  )
}

export function selectedTabIndex(tabs: HTMLElement): number {
  const index = directTabsButtons(tabs).find((button) => button.getAttribute('aria-selected') === 'true')?.dataset.tabButton
  return index === undefined ? 0 : Number(index)
}

/**
 * Applies a selection to one tab block only (no sync coordination or persistence). Returns false
 * when the index is out of range or the block was already showing that panel.
 */
export function applyTabSelection(tabs: HTMLElement, index: number, options: { reveal?: boolean } = {}): boolean {
  const buttons = directTabsButtons(tabs)
  if (index < 0 || index >= buttons.length) return false
  const already = buttons[index]!.getAttribute('aria-selected') === 'true'
  buttons.forEach((candidate, candidateIndex) => {
    const selected = candidateIndex === index
    candidate.setAttribute('aria-selected', String(selected))
    candidate.tabIndex = selected ? 0 : -1
  })
  const panels = directTabPanels(tabs)
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== String(index)
  })
  syncRenameField(tabs, buttons[index]!)
  if (!already && options.reveal !== false) {
    const activePanel = panels[index]
    if (activePanel) revealActiveTabContent(activePanel)
  }
  return !already
}

// The settings panel's rename field always names the active tab; refresh it from the live DOM
// (the field and the tab block are committed together, so no staging-only listener could do this).
function syncRenameField(tabs: HTMLElement, activeButton: HTMLButtonElement): void {
  const input = tabs.querySelector<HTMLInputElement>('[data-tabs-rename-input]')
  if (!input || input.ownerDocument.activeElement === input) return
  const title = activeButton.textContent?.trim()
  if (title !== undefined) input.value = title
}

export function selectMarkdownTab(button: HTMLButtonElement): void {
  const tabs = button.closest<HTMLElement>('[data-tabs]')
  if (!tabs) return
  const index = Number(button.dataset.tabButton)
  if (!Number.isInteger(index)) return
  applyTabSelection(tabs, index)
  coordinateSyncedTabs(tabs, index)
  rememberSyncedChoice(tabs, index)
}

/** Blocks sharing a sync id inside the same prose surface switch to the same panel together. */
function coordinateSyncedTabs(source: HTMLElement, index: number): void {
  const group = source.dataset.tabsSync
  if (!group) return
  const scope = source.closest<HTMLElement>('.ink-prose') ?? source.ownerDocument?.documentElement
  if (!scope) return
  let peers: HTMLElement[]
  try {
    peers = [...scope.querySelectorAll<HTMLElement>(`[data-tabs-sync="${CSS.escape(group)}"]`)]
  }
  catch {
    // The sync id is validated at parse time, so an escape failure means malformed hand-built DOM.
    return
  }
  for (const peer of peers) {
    if (peer === source || source.contains(peer)) continue
    applyTabSelection(peer, index)
  }
}

function syncedStorageKey(noteId: string, group: string): string {
  return `${SYNC_STORAGE_PREFIX}${noteId}:${group}`
}

export function readSyncedTabChoice(noteId: string | null | undefined, group: string): number | null {
  if (!noteId) return null
  try {
    const raw = window.localStorage.getItem(syncedStorageKey(noteId, group))
    if (raw === null) return null
    const index = Number(raw)
    return Number.isInteger(index) && index >= 0 ? index : null
  }
  catch {
    // Storage can be unavailable (private mode / quota); remembered choice is best-effort.
    return null
  }
}

function rememberSyncedChoice(tabs: HTMLElement, index: number): void {
  const group = tabs.dataset.tabsSync
  const noteId = tabs.closest<HTMLElement>('[data-note-id]')?.dataset.noteId
  if (!group || !noteId) return
  try {
    window.localStorage.setItem(syncedStorageKey(noteId, group), String(index))
  }
  catch {
    // Persisting the choice is best-effort; in-session coordination still works.
  }
}

export function revealActiveTabContent(panel: HTMLElement): void {
  const chartBlocks = panel.querySelectorAll<HTMLElement>('[data-chart]')
  for (const block of chartBlocks) {
    // The live Chart.js instance is stashed on the node by the chart enhancer.
    const holder: HTMLElement & { __chartInstance?: { resize: () => void } } = block
    holder.__chartInstance?.resize()
  }
  const mindmaps = panel.querySelectorAll<HTMLElement>('[data-mindmap]')
  for (const block of mindmaps) {
    fitMindmapBlock(block)
  }
  const excalidraws = panel.querySelectorAll<HTMLElement>('[data-excalidraw]')
  for (const block of excalidraws) {
    fitExcalidrawBlock(block)
  }
  window.dispatchEvent(new Event('resize'))
}

export function moveMarkdownTabFocus(button: HTMLButtonElement, key: string): void {
  const tablist = button.closest<HTMLElement>('[role="tablist"]')
  const buttons = [
    ...(tablist?.querySelectorAll<HTMLButtonElement>('[data-tab-button]') ?? []),
  ].filter((candidate) => candidate.closest('[role="tablist"]') === tablist)
  if (!buttons.length) return
  const current = Math.max(0, buttons.indexOf(button))
  const forward = key === 'ArrowRight' || key === 'ArrowDown'
  const backward = key === 'ArrowLeft' || key === 'ArrowUp'
  if (!forward && !backward && key !== 'Home' && key !== 'End') return
  const index =
    key === 'Home'
      ? 0
      : key === 'End'
        ? buttons.length - 1
        : (current + (forward ? 1 : -1) + buttons.length) % buttons.length
  const next = buttons[index]!
  selectMarkdownTab(next)
  next.focus()
}
