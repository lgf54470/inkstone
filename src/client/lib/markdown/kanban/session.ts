import { serializeKanban } from './body'
import type { KanbanBlockEntry } from './entry'
import {
  attachKanbanToOverlay,
  detachKanbanFromOverlay,
  kanbanEntryForNode,
  updateKanbanData,
} from './registry'
import type { KanbanData, KanbanMode } from './types'
import { flushKanbanEntry } from './write'

export interface KanbanSession {
  readonly key: string
  noteId(): string | null
  isReady(): boolean
  isEditable(): boolean
  getData(): KanbanData | null
  updateData(updater: (prev: KanbanData) => KanbanData): void
  getMode(): KanbanMode
  moveInto(target: HTMLElement): void
  moveBack(): void
  title(): string
  serialize(): string | null
  flush(): void
}

export function openKanbanSession(node: HTMLElement): KanbanSession | null {
  const opened = kanbanEntryForNode(node)
  return opened ? sessionFor(opened) : null
}

function sessionFor(entry: KanbanBlockEntry): KanbanSession {
  return {
    key: entry.key,
    noteId: () => entry.noteId,
    isReady: () => Boolean(entry.data),
    isEditable: () => Boolean(entry.editable),
    getData: () => entry.data,
    updateData: (updater) => updateKanbanData(entry, updater),
    getMode: () => entry.mode,
    moveInto: (target) => attachKanbanToOverlay(entry, target),
    moveBack: () => detachKanbanFromOverlay(entry),
    title: () => entry.data?.title || 'Kanban',
    serialize: () => {
      if (!entry.data) return null
      return serializeKanban(entry.data, entry.mode)
    },
    flush: () => {
      flushKanbanEntry(entry)
    },
  }
}
