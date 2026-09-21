import { useCallback, useEffect, useRef, useState } from 'react'
import type { ShareCollection } from '@shared/types'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'

export type ShareCollectionsBundle = ReturnType<typeof useShareCollections>

/**
 * The owner's published collections: the list, what is being done to it, and the two mutations the
 * panel offers. Every mutation reloads the list rather than patching it in place — the count beside
 * each row is read live by the worker, so a locally edited number would be a guess.
 */
export function useShareCollections() {
  const list = useCollectionList()
  const mutations = useCollectionMutations(list.reload)
  return {
    ...list,
    ...mutations,
    isEmpty: !list.isLoading && !list.hasError && list.collections.length === 0,
  }
}

/** Reading the list, and the four states a caller has to paint for it. */
function useCollectionList() {
  const [collections, setCollections] = useState<ShareCollection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  const reload = useCallback(async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setIsLoading(true)
    setHasError(false)
    try {
      const result = await api.share.collections.list(controller.signal)
      if (!controller.signal.aborted) setCollections(result.collections)
    } catch (error) {
      if (controller.signal.aborted || (error as Error)?.name === 'AbortError') return
      setHasError(true)
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void reload()
    return () => {
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [reload])

  return { collections, isLoading, hasError, reload }
}

/** The two things the panel does to a page: pause or republish it, and revoke it. */
function useCollectionMutations(reload: () => Promise<void>) {
  const toast = useUi((s) => s.toast)
  const [busyId, setBusyId] = useState<string | null>(null)

  const run = useCallback(async (collection: ShareCollection, action: () => Promise<void>, success: string) => {
    setBusyId(collection.id)
    try {
      await action()
      toast({ title: success, tone: 'success' })
      await reload()
    } catch (error) {
      // The failure keeps its own message: "the folder already has a published collection" is the
      // one answer that tells the owner what to do about it.
      toast({ title: error instanceof Error ? error.message : t('share.collection_action_failed'), tone: 'danger' })
    } finally {
      setBusyId(null)
    }
  }, [reload, toast])

  const setEnabled = useCallback((collection: ShareCollection, isEnabled: boolean) => run(
    collection,
    async () => {
      await api.share.collections.patch(collection.id, { isEnabled })
    },
    isEnabled ? t('share.collection_resumed') : t('share.collection_paused'),
  ), [run])

  const revoke = useCallback((collection: ShareCollection) => run(
    collection,
    async () => {
      await api.share.collections.revoke(collection.id)
    },
    t('share.collection_revoked'),
  ), [run])

  return { busyId, setEnabled, revoke }
}
