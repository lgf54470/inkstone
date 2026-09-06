import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'inkstone.calendar-tree-prefs.v1'

interface CalendarTreePrefs {
    visible: boolean
    showEmpty: boolean
}

const listeners = new Set<() => void>()
let prefs: CalendarTreePrefs = load()

function load(): CalendarTreePrefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            const parsed = JSON.parse(raw) as { visible?: unknown; showEmpty?: unknown }
            return {
                visible: typeof parsed.visible === 'boolean' ? parsed.visible : true,
                showEmpty: typeof parsed.showEmpty === 'boolean' ? parsed.showEmpty : false,
            }
        }
    }
    catch {
        // Corrupt or missing stored prefs fall back to the defaults below.
    }
    return { visible: true, showEmpty: false }
}

function save(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    }
    catch {
        // Quota or private-mode writes can throw; prefs stay authoritative in memory.
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function useCalendarTreeVisible(): boolean {
    return useSyncExternalStore(subscribe, () => prefs.visible, () => prefs.visible)
}

export function setCalendarTreeVisible(visible: boolean): void {
    prefs = { ...prefs, visible }
    save()
    listeners.forEach((listener) => listener())
}

export function useCalendarTreeShowEmpty(): boolean {
    return useSyncExternalStore(subscribe, () => prefs.showEmpty, () => prefs.showEmpty)
}

export function setCalendarTreeShowEmpty(showEmpty: boolean): void {
    prefs = { ...prefs, showEmpty }
    save()
    listeners.forEach((listener) => listener())
}