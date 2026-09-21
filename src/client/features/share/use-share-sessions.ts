import { useCallback, useEffect, useState } from 'react'
import type { ShareSession, ShareTimelineRange } from '@shared/types'
import { api } from '../../lib/api'

const SESSIONS_PAGE = 25

/**
 * The sessions a range holds, and the ones that come after it (ADR-0003). Paging is by opaque
 * cursor rather than by page number: sessions are derived, so a new visit in the middle of the
 * range would shift every later page and a numbered walk would show one sitting twice.
 */
export function useShareSessions(params: {
  open: boolean
  range: ShareTimelineRange
  filters: { excludeBots: boolean; excludeSelf: boolean; excludeOwner: boolean }
}) {
  const { open, range, filters } = params
  const [sessions, setSessions] = useState<ShareSession[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAppending, setIsAppending] = useState(false)
  const [hasError, setHasError] = useState(false)

  const load = useCallback(async (nextCursor: string | null) => {
    if (nextCursor) setIsAppending(true)
    else setIsLoading(true)
    setHasError(false)
    try {
      const res = await api.share.sessions({ range, filters, limit: SESSIONS_PAGE, cursor: nextCursor ?? undefined })
      setSessions((current) => (nextCursor ? [...current, ...res.sessions] : res.sessions))
      setCursor(res.nextCursor)
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
      setIsAppending(false)
    }
  }, [range, filters.excludeBots, filters.excludeSelf, filters.excludeOwner])

  useEffect(() => {
    if (!open) return
    void load(null)
  }, [open, load])

  return {
    sessions,
    isLoading,
    isAppending,
    hasError,
    hasMore: cursor !== null,
    loadMore: () => void load(cursor),
    reload: () => void load(null),
  }
}
