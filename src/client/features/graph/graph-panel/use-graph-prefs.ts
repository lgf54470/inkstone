import { useEffect, useState } from 'react'
import type { GraphPreferences } from '../../../lib/graph-settings'
import { useSession } from '../../../store/session'
import { graphPrefsStorageKey, loadPreferences } from './helpers'

/**
 * Graph preferences are one key shared by two surfaces, so the writer says when it has written. The
 * browser's own `storage` event belongs to the *other* tabs, which leaves a panel sitting behind the
 * full-screen graph drawing with the settings it was mounted with (G-20).
 */
const GRAPH_PREFS_WRITTEN = 'inkstone:graph-preferences-written'

/**
 * The preferences the reader set, held by the panel that owns them. Only the full-screen graph writes
 * them back: two surfaces persisting the same key would leave whichever let go of the drawer last
 * holding the graph, so the companion is given no setter to reach for (G-20).
 */
export function useGraphPreferences() {
  const userId = useSession((state) => state.user?.id)
  const [prefs, setPrefs] = useState(() => loadPreferences(userId))
  useEffect(() => {
    const key = graphPrefsStorageKey(userId)
    const next = JSON.stringify(prefs)
    let written = false
    try {
      written = localStorage.getItem(key) !== next
      if (written) localStorage.setItem(key, next)
    } catch {
      // Private browsing or a locked-down browser can reject local preferences.
    }
    // Only a real write is worth announcing: the effect runs on every mount, and a reader that re-reads
    // an unchanged key still gets a new object to render.
    if (written) window.dispatchEvent(new Event(GRAPH_PREFS_WRITTEN))
  }, [prefs, userId])
  return [prefs, setPrefs] as const
}

/** The same preferences read-only, following every write the owning panel makes. */
export function useStoredGraphPreferences(): GraphPreferences {
  const userId = useSession((state) => state.user?.id)
  const [prefs, setPrefs] = useState(() => loadPreferences(userId))
  useEffect(() => {
    const follow = () => setPrefs(loadPreferences(userId))
    window.addEventListener(GRAPH_PREFS_WRITTEN, follow)
    return () => window.removeEventListener(GRAPH_PREFS_WRITTEN, follow)
  }, [userId])
  return prefs
}
