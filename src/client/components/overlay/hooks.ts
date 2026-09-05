import { useEffect, useRef, type RefObject } from 'react';




export const escStack: (() => void)[] = [];


export function useEscape(active: boolean, onEscape: () => void): void {
    const callbackRef = useRef(onEscape);
    callbackRef.current = onEscape;
    useEffect(() => {
        if (!active)
            return;
        const handler = () => callbackRef.current();
        escStack.push(handler);
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape')
                return;
            const top = escStack[escStack.length - 1];
            if (top !== handler)
                return;
            event.preventDefault();
            event.stopPropagation();
            handler();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
            const index = escStack.indexOf(handler);
            if (index >= 0)
                escStack.splice(index, 1);
        };
    }, [active]);
}


export function useClickOutside(refs: RefObject<HTMLElement | null>[], active: boolean, onOutside: () => void): void {
    const refsRef = useRef(refs);
    const callbackRef = useRef(onOutside);
    refsRef.current = refs;
    callbackRef.current = onOutside;
    useEffect(() => {
        if (!active)
            return;
        const handler = (event: MouseEvent) => {
            const target = event.target as Node;
            if (refsRef.current.some((ref) => ref.current?.contains(target)))
                return;
            callbackRef.current();
        };

        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [active]);
}


export let scrollLockCount = 0;


export let unlockedBodyOverflow = '';


export function useLockScroll(active: boolean): void {
    useEffect(() => {
        if (!active)
            return;
        if (scrollLockCount === 0)
            unlockedBodyOverflow = document.body.style.overflow;
        scrollLockCount++;
        document.body.style.overflow = 'hidden';
        return () => {
            scrollLockCount = Math.max(0, scrollLockCount - 1);
            if (scrollLockCount === 0)
                document.body.style.overflow = unlockedBodyOverflow;
        };
    }, [active]);
}


export const dialogStack: symbol[] = [];


export const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(',');



export function useDialogFocus<T extends HTMLElement>(active: boolean, panelRef: RefObject<T | null>, initialFocusRef?: RefObject<HTMLElement | null>): void {
    useEffect(() => {
        if (!active)
            return;
        const token = Symbol('dialog');
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialogStack.push(token);
        const panel = panelRef.current;
        const requestedInitial = initialFocusRef?.current ??
            panel?.querySelector<HTMLElement>('[data-autofocus]');
        const initial = requestedInitial && isAvailableFocusTarget(requestedInitial)
            ? requestedInitial
            : [...(panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])]
                .find(isAvailableFocusTarget);
        (initial ?? panel)?.focus({ preventScroll: true });
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Tab' || dialogStack[dialogStack.length - 1] !== token)
                return;
            const currentPanel = panelRef.current;
            if (!currentPanel)
                return;
            const focusable = [...currentPanel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
                .filter(isAvailableFocusTarget);
            if (focusable.length === 0) {
                event.preventDefault();
                currentPanel.focus({ preventScroll: true });
                return;
            }
            const current = document.activeElement as HTMLElement | null;
            const index = current ? focusable.indexOf(current) : -1;
            if (event.shiftKey && index <= 0) {
                event.preventDefault();
                focusable[focusable.length - 1]?.focus({ preventScroll: true });
            }
            else if (!event.shiftKey && (index < 0 || index === focusable.length - 1)) {
                event.preventDefault();
                focusable[0]?.focus({ preventScroll: true });
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            const index = dialogStack.indexOf(token);
            if (index >= 0)
                dialogStack.splice(index, 1);
            if (previousFocus?.isConnected)
                previousFocus.focus({ preventScroll: true });
        };
    }, [active, initialFocusRef, panelRef]);
}



export function isAvailableFocusTarget(element: HTMLElement): boolean {
    return !element.matches(':disabled') && !element.closest('[hidden], [aria-hidden="true"]');
}
