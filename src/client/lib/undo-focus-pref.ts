import { useSyncExternalStore } from 'react'

export const UNDO_FOCUS_STORAGE_KEY = 'inkstone.undo-toast-focus.v1'

const listeners = new Set<() => void>()
let pref: boolean = load()

function load(): boolean {
    try {
        const raw = localStorage.getItem(UNDO_FOCUS_STORAGE_KEY)
        if (raw !== null)
            return raw !== 'off'
    }
    catch {
    }
    return true
}

function save(): void {
    try {
        localStorage.setItem(UNDO_FOCUS_STORAGE_KEY, pref ? 'on' : 'off')
    }
    catch {
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

/** Whether undo toasts should auto-focus their action button (explicit "no-distraction" opt-out). */
export function useUndoToastFocus(): boolean {
    return useSyncExternalStore(subscribe, () => pref, () => pref)
}

export function setUndoToastFocus(next: boolean): void {
    if (pref === next)
        return
    pref = next
    save()
    listeners.forEach((listener) => listener())
}