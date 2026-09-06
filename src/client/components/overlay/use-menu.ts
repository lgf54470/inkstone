import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { getVisibleViewport } from '../../lib/viewport';
import type { MenuItem } from './menu';

function nextCursor(items: MenuItem[], current: number, step: 1 | -1): number {
    let next = current;
    for (let i = 0; i < items.length; i++) {
        next = (next + step + items.length) % items.length;
        if (!items[next]?.disabled)
            return next;
    }
    return current;
}

export function useMenuReset(open: boolean, setActiveSubmenuId: React.Dispatch<React.SetStateAction<string | null>>, setSubmenuAnchorRect: React.Dispatch<React.SetStateAction<DOMRect | null>>): void {
    useEffect(() => {
        if (!open) {
            setActiveSubmenuId(null);
            setSubmenuAnchorRect(null);
        }
    }, [open, setActiveSubmenuId, setSubmenuAnchorRect]);
}

export function useMenuPosition(open: boolean, anchor: RefObject<HTMLElement | null> | { x: number; y: number }, align: 'start' | 'end', menuWidth: number, items: MenuItem[], setPosition: React.Dispatch<React.SetStateAction<{ top: number; left: number; origin: string }>>, setCursor: React.Dispatch<React.SetStateAction<number>>): void {
    useLayoutEffect(() => {
        if (!open)
            return;
        const margin = 8;
        const itemHeight = innerWidth < 768 ? 40 : 30;
        const height = Math.min(items.length * itemHeight + 12, 420);
        const point = 'current' in anchor ? null : anchor;
        const anchorRef = 'current' in anchor ? anchor : null;
        let top: number;
        let left: number;
        if (point) {
            top = point.y;
            left = point.x;
        }
        else {
            const rect = anchorRef?.current?.getBoundingClientRect();
            if (!rect)
                return;
            top = rect.bottom + 5;
            left = align === 'end' ? rect.right - menuWidth : rect.left;
        }
        const viewport = getVisibleViewport();
        const flipUp = top + height > viewport.bottom - margin;
        if (flipUp)
            top = Math.max(viewport.top + margin, (point ? point.y : (anchorRef?.current?.getBoundingClientRect().top ?? top)) - height - 5);
        left = Math.min(Math.max(viewport.left + margin, left), viewport.right - menuWidth - margin);
        setPosition({ top, left, origin: `${flipUp ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}` });
        setCursor(items.findIndex((i) => !i.disabled));
    }, [open, items, align, menuWidth, anchor, setPosition, setCursor]);
}

export function useSubmenuPosition(activeSubmenuId: string | null, submenuAnchorRect: DOMRect | null, menuRef: RefObject<HTMLDivElement | null>, submenuRef: RefObject<HTMLDivElement | null>, setSubmenuPos: React.Dispatch<React.SetStateAction<{ top: number; left: number }>>): void {
    useLayoutEffect(() => {
        if (!activeSubmenuId || !submenuAnchorRect)
            return;
        const margin = 8;
        const viewport = getVisibleViewport();
        const parentRect = menuRef.current?.getBoundingClientRect();
        const itemRect = submenuAnchorRect;
        const submenuWidth = submenuRef.current?.offsetWidth || 260;
        const submenuHeight = submenuRef.current?.offsetHeight || 320;

        const preferredRight = (parentRect ? parentRect.right : itemRect.right) - 2;
        const preferredLeft = (parentRect ? parentRect.left : itemRect.left) - submenuWidth + 2;

        let left = preferredRight;
        if (left + submenuWidth > viewport.right - margin) {
            left = preferredLeft >= viewport.left + margin ? preferredLeft : Math.max(viewport.left + margin, viewport.right - submenuWidth - margin);
        }

        let top = itemRect.top - 4;
        if (top + submenuHeight > viewport.bottom - margin) {
            top = Math.max(viewport.top + margin, viewport.bottom - submenuHeight - margin);
        }
        if (top < viewport.top + margin) {
            top = viewport.top + margin;
        }

        setSubmenuPos({ top, left });
    }, [activeSubmenuId, submenuAnchorRect, menuRef, submenuRef, setSubmenuPos]);
}

export function useFocusRestore(open: boolean): void {
    useEffect(() => {
        if (!open)
            return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return () => {
            if (previousFocus?.isConnected)
                previousFocus.focus({ preventScroll: true });
        };
    }, [open]);
}

export function useCursorFocus(open: boolean, cursor: number, menuRef: RefObject<HTMLDivElement | null>): void {
    useEffect(() => {
        if (!open)
            return;
        if (cursor < 0) {
            menuRef.current?.focus({ preventScroll: true });
            return;
        }
        menuRef.current
            ?.querySelector<HTMLElement>(`[data-menu-index="${cursor}"]`)
            ?.focus({ preventScroll: true });
    }, [open, cursor, menuRef]);
}

export function useMenuCursorKeys(open: boolean, items: MenuItem[], setCursor: React.Dispatch<React.SetStateAction<number>>): void {
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                setCursor((current) => nextCursor(items, current, step));
                return;
            }
            if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                const indexes = items
                    .map((item, index) => item.disabled ? -1 : index)
                    .filter((index) => index >= 0);
                setCursor(event.key === 'Home' ? (indexes[0] ?? -1) : (indexes[indexes.length - 1] ?? -1));
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [open, items, setCursor]);
}

export function useMenuActionKeys(open: boolean, items: MenuItem[], cursor: number, onClose: () => void, menuRef: RefObject<HTMLDivElement | null>, submenuRef: RefObject<HTMLDivElement | null>, setActiveSubmenuId: React.Dispatch<React.SetStateAction<string | null>>, setSubmenuAnchorRect: React.Dispatch<React.SetStateAction<DOMRect | null>>): void {
    useEffect(() => {
        if (!open)
            return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowRight') {
                const item = items[cursor];
                if (!item?.submenu)
                    return;
                event.preventDefault();
                const btn = menuRef.current?.querySelector<HTMLElement>(`[data-menu-index="${cursor}"]`);
                if (!btn)
                    return;
                setActiveSubmenuId(() => item.id);
                setSubmenuAnchorRect(btn.getBoundingClientRect());
                queueMicrotask(() => {
                    submenuRef.current?.querySelector<HTMLElement>('input, button')?.focus();
                });
                return;
            }
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            event.preventDefault();
            const item = items[cursor];
            if (!item || item.disabled)
                return;
            if (item.submenu) {
                const btn = menuRef.current?.querySelector<HTMLElement>(`[data-menu-index="${cursor}"]`);
                if (btn) {
                    setActiveSubmenuId((curr) => curr === item.id ? null : item.id);
                    setSubmenuAnchorRect(btn.getBoundingClientRect());
                }
                return;
            }
            item.onSelect?.();
            onClose();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [open, items, cursor, onClose, menuRef, submenuRef, setActiveSubmenuId, setSubmenuAnchorRect]);
}