import { api } from '../../../lib/api'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import type { ShareStoreState, SetShareStoreState } from './types'

export let loadEpoch = 0
export let statsEpoch = 0

let inflightShareLoad: { key: string; controller: AbortController; promise: Promise<void> } | null = null
let inflightSummaryLoad: Promise<void> | null = null

// The hub mounts several surfaces (sidebar, note submenu, edit modal) that all
// want folders/tags on open; without this guard every hub open doubled both
// requests and every list reload fetched them again.
const COLLECTION_TTL_MS = 30_000

type CollectionGuard = { inflight: Promise<void> | null; lastLoadedAt: number }

const foldersGuard: CollectionGuard = { inflight: null, lastLoadedAt: 0 }
const tagsGuard: CollectionGuard = { inflight: null, lastLoadedAt: 0 }

export const shareLoadersActions = (set: SetShareStoreState, get: () => ShareStoreState): Pick<ShareStoreState, 'loadFolders' | 'loadTags' | 'loadShares' | 'loadStats' | 'loadSummary'> => ({
  loadFolders: () => guardCollection(foldersGuard, () => refreshFolders(set, foldersGuard)),
  loadTags: () => guardCollection(tagsGuard, () => refreshTags(set, tagsGuard)),
  loadShares: () => loadSharesImpl(set, get),
  loadStats: () => loadStatsImpl(set, get),
  loadSummary: () => loadSummaryImpl(set, get),
})

function guardCollection(guard: CollectionGuard, refresh: () => Promise<void>): Promise<void> {
  if (guard.inflight) return guard.inflight
  if (Date.now() - guard.lastLoadedAt < COLLECTION_TTL_MS) return Promise.resolve()
  const inflight = refresh().finally(() => {
    guard.inflight = null
  })
  guard.inflight = inflight
  return inflight
}

async function refreshFolders(set: SetShareStoreState, guard: CollectionGuard): Promise<void> {
  try {
    const folders = await api.share.folders.list()
    guard.lastLoadedAt = Date.now()
    set({ folders })
  } catch (error) {
    console.warn('[share-store] failed to load folders', error)
  }
}

async function refreshTags(set: SetShareStoreState, guard: CollectionGuard): Promise<void> {
  try {
    const tags = await api.share.tags.list()
    guard.lastLoadedAt = Date.now()
    set({ tags })
  } catch (error) {
    console.warn('[share-store] failed to load tags', error)
  }
}

type ShareListParams = NonNullable<Parameters<typeof api.share.list>[0]>

function shareListParams(state: ShareStoreState): ShareListParams {
  return {
    folderId: state.folderId,
    tag: state.tag,
    status: state.statusFilter,
    search: state.search.trim() || undefined,
    sort: state.sort,
    excludeBots: state.excludeBots,
    excludeSelf: state.excludeSelfReferrers,
    excludeOwner: state.excludeOwner,
  }
}

type ShareLoadRun = {
  set: SetShareStoreState
  params: ShareListParams
  controller: AbortController
  epoch: number
}

async function loadSharesImpl(set: SetShareStoreState, get: () => ShareStoreState): Promise<void> {
  const params = shareListParams(get())
  const key = JSON.stringify(params)
  // The same query is already on the wire: reuse it instead of a parallel duplicate.
  if (inflightShareLoad?.key === key) return inflightShareLoad.promise

  // A different query makes the previous result stale: cancel it so it stops
  // consuming bandwidth and cannot surface its failure as a toast.
  inflightShareLoad?.controller.abort()
  const epoch = ++loadEpoch
  const controller = new AbortController()
  set({ loading: true })
  const promise = runShareLoad({ set, params, controller, epoch })
  inflightShareLoad = { key, controller, promise }
  return promise
}

async function runShareLoad({ set, params, controller, epoch }: ShareLoadRun): Promise<void> {
  try {
    const res = await api.share.list(params, controller.signal)
    if (epoch === loadEpoch) {
      set({
        shares: res.shares,
        truncated: res.truncated === true,
        globalStats: res.globalStats,
        // The full list is now the shared-state truth; a summary kept beside
        // it would only resurrect revoked shares in the note-row markers.
        summary: null,
        loading: false,
        error: false,
      })
    }
  } catch {
    if (epoch === loadEpoch) {
      set({ loading: false, error: true })
      useUi.getState().toast({ title: t('share.could_not_load_sharing_status'), tone: 'danger' })
    }
  } finally {
    // Compare the controller, not just the key: an aborted earlier run of the
    // same query must not free the slot owned by the run that superseded it.
    if (inflightShareLoad?.controller === controller) inflightShareLoad = null
  }
}

/**
 * The sidebar counters on their own, for a hub that opens on the dashboard: the
 * list would answer them too, but only after paying for rows and per-note visit
 * stats nothing on that screen reads.
 */
async function loadStatsImpl(set: SetShareStoreState, get: () => ShareStoreState): Promise<void> {
  const state = get()
  const controller = new AbortController()
  const epoch = ++statsEpoch
  const promise = runStatsLoad({ set, state, controller, epoch })
  return promise
}

async function runStatsLoad({
  set,
  state,
  controller,
  epoch,
}: {
  set: SetShareStoreState
  state: ShareStoreState
  controller: AbortController
  epoch: number
}): Promise<void> {
  try {
    const res = await api.share.stats(
      {
        excludeBots: state.excludeBots,
        excludeSelf: state.excludeSelfReferrers,
        excludeOwner: state.excludeOwner,
      },
      controller.signal,
    )
    if (epoch === statsEpoch) set({ globalStats: res.globalStats })
  } catch (error) {
    // The counters are chrome around the list: a failure here leaves the previous
    // numbers in place rather than replacing the screen with an error state.
    console.warn('[share-store] failed to load share stats', error)
  }
}

async function loadSummaryImpl(set: SetShareStoreState, get: () => ShareStoreState): Promise<void> {
  // The sidebar prefetch and the hub open race each other only at startup;
  // a second in-flight summary would fetch the same two numbers.
  if (inflightSummaryLoad) return inflightSummaryLoad
  const promise = refreshSummary(set, get).finally(() => {
    inflightSummaryLoad = null
  })
  inflightSummaryLoad = promise
  return promise
}

async function refreshSummary(set: SetShareStoreState, get: () => ShareStoreState): Promise<void> {
  if (get().shares.length > 0 || get().globalStats) return
  try {
    const res = await api.share.summary()
    set({ summary: { totalShares: res.totalShares, sharedNoteIds: new Set(res.sharedNoteIds) } })
  } catch (error) {
    console.warn('[share-store] failed to load share summary', error)
    useUi.getState().toast({ title: t('share.could_not_load_sharing_status'), tone: 'danger' })
  }
}
