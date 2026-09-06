import { useSyncExternalStore } from 'react'

// Neutral projection registry between the notes store and the share/blog
// features. The notes store's visible-note selector must filter shared and
// published notes out of normal views, but it cannot import the feature
// stores: they import the notes store, and a reverse edge would couple the
// data layer to feature modules. The blog/share stores push their derived id
// sets here instead; selectors subscribe through this module, which imports
// neither side.

interface VisibilitySnapshot {
    sharedNoteIds: ReadonlySet<string>
    publishedNoteIds: ReadonlySet<string>
}

const EMPTY_SNAPSHOT: VisibilitySnapshot = {
    sharedNoteIds: new Set<string>(),
    publishedNoteIds: new Set<string>(),
}

let current = EMPTY_SNAPSHOT
const listeners = new Set<() => void>()

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    if (a.size !== b.size) return false
    for (const id of a) {
        if (!b.has(id)) return false
    }
    return true
}

/** Replaces the projection when either id set changed; no-op otherwise. */
export function pushVisibilitySnapshot(next: VisibilitySnapshot): void {
    if (
        sameSet(current.sharedNoteIds, next.sharedNoteIds) &&
        sameSet(current.publishedNoteIds, next.publishedNoteIds)
    ) {
        return
    }
    current = next
    for (const listener of listeners) listener()
}

export function getVisibilitySnapshot(): VisibilitySnapshot {
    return current
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

/** Reactive read of the shared/published note-id projection for selectors. */
export function useVisibilitySnapshot(): VisibilitySnapshot {
    return useSyncExternalStore(subscribe, getVisibilitySnapshot)
}