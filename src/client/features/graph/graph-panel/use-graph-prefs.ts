import { useEffect, useRef, useState } from 'react'
import type { GraphPreferences } from '../../../lib/graph-settings'
import { useSession } from '../../../store/session'
import { graphPrefsStorageKey, loadPreferences } from './helpers'

/**
 * Graph preferences are one key shared by two surfaces, so the writer says when it has written. The
 * browser's own `storage` event belongs to the *other* tabs, which leaves a panel sitting behind the
 * full-screen graph drawing with the settings it was mounted with (G-20).
 */
const GRAPH_PREFS_WRITTEN = 'inkstone:graph-preferences-written'

/** How long a change waits before it reaches storage: a drag changes the value dozens of times a second. */
export const GRAPH_PREFS_PERSIST_DEBOUNCE_MS = 300

/**
 * The one place the preference key is written. A reader in private browsing gets a warning rather than
 * a silent loss (AGENTS rule 2's best-effort form: the setting still works for this session), and a
 * write that changed nothing is not announced — the companion panel would otherwise re-read on mount.
 */
function writeGraphPreferences(userId: string | null | undefined, prefs: GraphPreferences): void {
  const key = graphPrefsStorageKey(userId)
  const next = JSON.stringify(prefs)
  let written = false
  try {
    written = localStorage.getItem(key) !== next
    if (written) localStorage.setItem(key, next)
  } catch (error) {
    console.warn('[inkstone] graph preferences could not be stored', error)
  }
  if (written) window.dispatchEvent(new Event(GRAPH_PREFS_WRITTEN))
}

/**
 * The preferences the reader set, held by the panel that owns them. Only the full-screen graph writes
 * them back: two surfaces persisting the same key would leave whichever let go of the drawer last
 * holding the graph, so the companion is given no setter to reach for (G-20).
 *
 * The write is debounced rather than per-change (G-11), and whatever is still pending when the panel
 * closes is flushed on the way out — a reader who drags a slider and immediately presses Escape has
 * still set it.
 */
export function useGraphPreferences() {
  const userId = useSession((state) => state.user?.id)
  const [prefs, setPrefs] = useState(() => loadPreferences(userId))
  const latest = useRef({ userId, prefs })
  useEffect(() => {
    latest.current = { userId, prefs }
    const timer = window.setTimeout(() => writeGraphPreferences(userId, prefs), GRAPH_PREFS_PERSIST_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [prefs, userId])
  useEffect(() => () => {
    writeGraphPreferences(latest.current.userId, latest.current.prefs)
  }, [])
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
