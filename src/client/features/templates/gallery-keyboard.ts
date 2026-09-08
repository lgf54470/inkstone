import { useCallback, type KeyboardEvent, type RefObject } from 'react'
import type { NoteTemplate } from '@shared/types'

interface GalleryKeyboardDeps {
  editing: unknown
  renaming: unknown
  moving: unknown
  categoryDialog: unknown
  isImportOpen: boolean
  isBatchMoving: boolean
  publishing: unknown
  isHelpOpen: boolean
  setIsHelpOpen: (v: boolean) => void
  toggleSelectMode: () => void
  searchRef: RefObject<HTMLInputElement | null>
  selectMode: boolean
  setSelectMode: (v: boolean) => void
  visible: NoteTemplate[]
  setSelectedIds: (v: ReadonlySet<string>) => void
  toggleSelectAll: () => void
  focusedId: string | null
  gridRef: RefObject<HTMLDivElement | null>
  toggleSelect: (id: string) => void
  setFocusedId: (id: string | null) => void
}

function activeTemplateId(deps: Pick<GalleryKeyboardDeps, 'focusedId'>): string | null | undefined {
    return deps.focusedId ?? (document.activeElement instanceof HTMLElement
        ? document.activeElement.closest('[data-template-id]')?.getAttribute('data-template-id')
        : null)
}

// True while a dialog/editor owns the keyboard or the event target is an input.
function galleryKeyGuard(deps: GalleryKeyboardDeps, event: KeyboardEvent): boolean {
    if (deps.editing || deps.renaming || deps.moving || deps.categoryDialog || deps.isImportOpen || deps.isBatchMoving || deps.publishing || deps.isHelpOpen)
        return true
    const target = event.target as HTMLElement
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable
}

// Non-arrow shortcut keys; returns true once the event was consumed.
function handleGalleryModifiers(deps: GalleryKeyboardDeps, event: KeyboardEvent): boolean {
    if (event.key === '?') {
        event.preventDefault()
        deps.setIsHelpOpen(true)
        return true
    }
    if (event.key === '/') {
        event.preventDefault()
        deps.searchRef.current?.focus()
        return true
    }
    if (event.key === 's' || event.key === 'S') {
        event.preventDefault()
        deps.toggleSelectMode()
        return true
    }
    if (event.key === 'a' || event.key === 'A') {
        event.preventDefault()
        if (!deps.selectMode) {
            deps.setSelectMode(true)
            deps.setSelectedIds(new Set(deps.visible.map((item) => item.id)))
        }
        else {
            deps.toggleSelectAll()
        }
        return true
    }
    if (event.key === ' ' && deps.selectMode) {
        const activeId = activeTemplateId(deps)
        if (activeId) {
            event.preventDefault()
            deps.toggleSelect(activeId)
        }
        return true
    }
    return false
}

function nextGalleryIndex(key: string, currentIndex: number, columns: number, count: number): number {
    if (key === 'ArrowRight') return currentIndex < 0 ? 0 : Math.min(count - 1, currentIndex + 1)
    if (key === 'ArrowDown') return currentIndex < 0 ? 0 : Math.min(count - 1, currentIndex + columns)
    if (key === 'ArrowLeft') return currentIndex < 0 ? count - 1 : Math.max(0, currentIndex - 1)
    if (key === 'ArrowUp') return currentIndex < 0 ? count - 1 : Math.max(0, currentIndex - columns)
    return -1
}

// Moves the focus ring across the grid; returns false when the key was not an
// arrow or the grid is empty.
function handleGalleryArrows(deps: GalleryKeyboardDeps, event: KeyboardEvent): boolean {
    if (deps.visible.length === 0)
        return false
    const columns = deps.gridRef.current
        ? getComputedStyle(deps.gridRef.current).gridTemplateColumns.split(' ').length
        : 1
    const activeId = activeTemplateId(deps)
    const currentIndex = activeId ? deps.visible.findIndex((item) => item.id === activeId) : -1
    const nextIndex = nextGalleryIndex(event.key, currentIndex, columns, deps.visible.length)
    if (nextIndex < 0)
        return false
    event.preventDefault()
    const next = deps.visible[nextIndex]
    if (!next)
        return false
    deps.setFocusedId(next.id)
    requestAnimationFrame(() => {
        deps.gridRef.current?.querySelector(`[data-template-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    return true
}

export function useGalleryKeyboard(deps: GalleryKeyboardDeps): (event: KeyboardEvent) => void {
    return useCallback((event: KeyboardEvent) => {
        if (galleryKeyGuard(deps, event))
            return
        if (handleGalleryModifiers(deps, event))
            return
        handleGalleryArrows(deps, event)
    }, [deps])
}
