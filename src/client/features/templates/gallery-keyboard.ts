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

export function useGalleryKeyboard(deps: GalleryKeyboardDeps): (event: KeyboardEvent) => void {
    const { editing, renaming, moving, categoryDialog, isImportOpen, isBatchMoving, publishing, isHelpOpen, setIsHelpOpen, toggleSelectMode, searchRef, selectMode, setSelectMode, visible, setSelectedIds, toggleSelectAll, focusedId, gridRef, toggleSelect, setFocusedId } = deps;
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (editing || renaming || moving || categoryDialog || isImportOpen || isBatchMoving || publishing || isHelpOpen)
            return;
        const target = event.target as HTMLElement;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable)
            return;
        if (event.key === '?') {
            event.preventDefault();
            setIsHelpOpen(true);
            return;
        }
        if (event.key === '/') {
            event.preventDefault();
            searchRef.current?.focus();
            return;
        }
        if (event.key === 's' || event.key === 'S') {
            event.preventDefault();
            toggleSelectMode();
            return;
        }
        if (event.key === 'a' || event.key === 'A') {
            event.preventDefault();
            if (!selectMode) {
                setSelectMode(true);
                setSelectedIds(new Set(visible.map((item) => item.id)));
            }
            else {
                toggleSelectAll();
            }
            return;
        }
        if (event.key === ' ' && selectMode) {
            const activeId = focusedId ?? (document.activeElement instanceof HTMLElement
                ? document.activeElement.closest('[data-template-id]')?.getAttribute('data-template-id')
                : null);
            if (activeId) {
                event.preventDefault();
                toggleSelect(activeId);
            }
            return;
        }
        if (visible.length === 0)
            return;
        const columns = gridRef.current
            ? getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').length
            : 1;
        const activeId = focusedId ?? (document.activeElement instanceof HTMLElement
            ? document.activeElement.closest('[data-template-id]')?.getAttribute('data-template-id')
            : null);
        const currentIndex = activeId ? visible.findIndex((item) => item.id === activeId) : -1;
        let nextIndex = -1;
        if (event.key === 'ArrowRight') nextIndex = currentIndex < 0 ? 0 : Math.min(visible.length - 1, currentIndex + 1);
        else if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : Math.min(visible.length - 1, currentIndex + columns);
        else if (event.key === 'ArrowLeft') nextIndex = currentIndex < 0 ? visible.length - 1 : Math.max(0, currentIndex - 1);
        else if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? visible.length - 1 : Math.max(0, currentIndex - columns);
        else return;
        event.preventDefault();
        const next = visible[nextIndex];
        if (!next)
            return;
        setFocusedId(next.id);
        requestAnimationFrame(() => {
            gridRef.current?.querySelector(`[data-template-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
    }, [isBatchMoving, categoryDialog, editing, focusedId, isHelpOpen, isImportOpen, moving, publishing, renaming, selectMode, toggleSelect, toggleSelectAll, toggleSelectMode, visible]);
    return handleKeyDown;
}
