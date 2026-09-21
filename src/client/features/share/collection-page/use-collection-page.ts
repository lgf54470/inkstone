import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { PublicCollection, PublicCollectionNote } from '@shared/types'
import { api, ApiError } from '../../../lib/api'
import { t } from '../../../lib/i18n'

export type CollectionPageBundle = ReturnType<typeof useCollectionPage>

/**
 * The visitor's side of a collection (ADR-0005). Same three states as the note page — loading,
 * password required, unavailable — because the two pages present the same kind of thing: an address
 * that is either open, locked, or gone, and which one it is has to be the same shape in both so a
 * probe cannot tell a locked collection from a missing one.
 */
export function useCollectionPage(slug: string) {
  const page = useCollectionState()
  const load = useLoadPage(slug, page)
  const loadMore = useLoadMorePage(slug, page)
  usePageTitleCleanup(page.appliedTitleRef, page.originalTitleRef)
  return { ...page.view, load, loadMore }
}

function useCollectionState() {
  const [title, setTitle] = useState('')
  const [count, setCount] = useState(0)
  const [notes, setNotes] = useState<PublicCollectionNote[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isPasswordRequired, setIsPasswordRequired] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const appliedTitleRef = useRef<string | null>(null)
  const originalTitleRef = useRef(document.title)
  const state = {
    setTitle, setCount, setNotes, setNextCursor, setIsPasswordRequired, setPassword, setError,
    setIsLoading, setIsLoadingMore, requestRef, appliedTitleRef, originalTitleRef,
  }
  return {
    ...state,
    view: { title, count, notes, nextCursor, isPasswordRequired, password, setPassword, error, isLoading, isLoadingMore },
  }
}

type CollectionState = ReturnType<typeof useCollectionState>

function useLoadPage(slug: string, state: CollectionState) {
  const load = useCallback(async (pwd?: string) => loadCollectionPage(slug, pwd, state), [slug])
  useEffect(() => {
    void load()
    return () => {
      state.requestRef.current?.abort()
      state.requestRef.current = null
    }
  }, [load])
  return load
}

async function loadCollectionPage(slug: string, pwd: string | undefined, state: CollectionState): Promise<void> {
  state.requestRef.current?.abort()
  const controller = new AbortController()
  state.requestRef.current = controller
  state.setIsLoading(true)
  state.setError(null)
  try {
    const result = await api.share.readCollection({ slug, password: pwd, signal: controller.signal })
    if (controller.signal.aborted) return
    applyCollection(result, state)
    state.setIsPasswordRequired(false)
    state.setPassword('')
  } catch (err) {
    if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return
    if (err instanceof ApiError && err.status === 401) {
      // A wrong passcode and a missing one look the same to the visitor: the server answers them
      // identically, and the only difference here is that a guess gets told it was a guess.
      state.setIsPasswordRequired(true)
      state.setError(pwd ? t('share.incorrect_passcode') : null)
    } else {
      state.setIsPasswordRequired(false)
      state.setError(err instanceof ApiError ? err.message : t('share.collection_page_unavailable'))
    }
  } finally {
    if (state.requestRef.current === controller) {
      state.requestRef.current = null
      state.setIsLoading(false)
    }
  }
}

/** The directory's title is the collection's, and the tab says so — then gives the old one back. */
function applyCollection(result: PublicCollection, state: CollectionState): void {
  state.setTitle(result.title)
  state.setCount(result.count)
  state.setNotes(result.notes)
  state.setNextCursor(result.nextCursor)
  const nextTitle = result.title ? `${result.title} · ${t('share.category_collections')}` : document.title
  document.title = nextTitle
  state.appliedTitleRef.current = nextTitle
}

function useLoadMorePage(slug: string, state: CollectionState) {
  return useCallback(async () => {
    const cursor = state.view.nextCursor
    if (!cursor) return
    state.setIsLoadingMore(true)
    try {
      const result = await api.share.readCollection({ slug, cursor })
      state.setNotes((previous) => [...previous, ...result.notes])
      state.setNextCursor(result.nextCursor)
    } catch (err) {
      state.setError(err instanceof ApiError ? err.message : t('share.collection_page_unavailable'))
    } finally {
      state.setIsLoadingMore(false)
    }
  }, [slug, state])
}

function usePageTitleCleanup(appliedTitleRef: MutableRefObject<string | null>, originalTitleRef: MutableRefObject<string>): void {
  useEffect(() => () => {
    if (appliedTitleRef.current && document.title === appliedTitleRef.current) {
      document.title = originalTitleRef.current
    }
    appliedTitleRef.current = null
  }, [appliedTitleRef, originalTitleRef])
}
