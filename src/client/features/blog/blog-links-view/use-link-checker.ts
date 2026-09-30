import { useEffect, useMemo, useRef, useState } from 'react'
import type { BlogLink } from '@shared/types'
import { api } from '../../../lib/api'

export type LinkHealthLevel = 'ok' | 'warning' | 'broken' | 'error' | 'skipped' | 'checking'

export interface HealthResult {
  status: number | null
  ok: boolean
  level: LinkHealthLevel
  durationMs: number
  error?: string
  finalUrl?: string
}

const BATCH_SIZE = 8
const CACHE_KEY = 'inkstone_blog_link_check_cache'

/**
 * How long a stored verdict stays current. The checker used to read its cache without ever looking at
 * the timestamp it wrote, so a result from months ago was displayed — and bulk-deleted on — as if it
 * were this morning's.
 */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export function isCacheStale(timestamp: unknown, now: number): boolean {
  return typeof timestamp !== 'number' || !Number.isFinite(timestamp) || now - timestamp > CACHE_TTL_MS
}

export function useLinkCheckerState(
  links: BlogLink[],
  open: boolean,
  onBatchDeleteLinks: (ids: string[]) => Promise<boolean>,
) {
  const [results, setResults] = useState<Record<string, HealthResult>>({})
  const [running, setRunning] = useState(false)
  const [progressIndex, setProgressIndex] = useState(0)
  const [filterLevel, setFilterLevel] = useState<'all' | 'broken' | 'error' | 'warning' | 'ok'>('all')
  const [cacheStale, setCacheStale] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const stopRequested = useRef(false)

  useEffect(() => {
    if (!open) {
      stopRequested.current = true
      setRunning(false)
      return
    }
    loadCachedResults(setResults, setCacheStale)
  }, [open])

  const stats = useMemo(() => computeStats(links, results), [links, results])
  const filteredLinks = useMemo(() => {
    if (filterLevel === 'all') return links
    return links.filter((l) => results[l.url]?.level === filterLevel)
  }, [links, results, filterLevel])

  const actions = useCheckerActions({
    links, results, setResults, setProgressIndex, stopRequested, setRunning,
    onBatchDeleteLinks, selectedIds, setSelectedIds, setBatchDeleting,
  })

  return {
    results, running, progressIndex, filterLevel, setFilterLevel,
    selectedIds, setSelectedIds, batchDeleting, stats, filteredLinks, cacheStale,
    ...actions,
  }
}

interface CheckerActionProps {
  links: BlogLink[]
  results: Record<string, HealthResult>
  setResults: React.Dispatch<React.SetStateAction<Record<string, HealthResult>>>
  setProgressIndex: (n: number) => void
  stopRequested: React.RefObject<boolean>
  setRunning: (r: boolean) => void
  onBatchDeleteLinks: (ids: string[]) => Promise<boolean>
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setBatchDeleting: (b: boolean) => void
}

function useCheckerActions(props: CheckerActionProps) {
  const handleStart = async () => {
    props.stopRequested.current = false
    props.setRunning(true)
    await runCheckerLoop(props.links, props.results, props.setResults, props.setProgressIndex, props.stopRequested)
    props.setRunning(false)
  }

  const handlePause = () => {
    props.stopRequested.current = true
    props.setRunning(false)
  }

  const handleCheckSingle = async (url: string) => {
    props.setResults((prev) => ({ ...prev, [url]: { status: null, ok: false, level: 'checking', durationMs: 0 } }))
    try {
      const res = await api.blog.links.check([url])
      const r = res.results[0]
      if (r) {
        props.setResults((prev) => {
          const next = { ...prev, [url]: { status: r.status, ok: r.ok, level: r.level, durationMs: r.durationMs, error: r.error, finalUrl: r.finalUrl } }
          saveCachedResults(next)
          return next
        })
      }
    } catch (err: unknown) {
      // A request that never reached the site says nothing about the site: 'error' is not a verdict,
      // and only a verdict may be deleted.
      props.setResults((prev) => ({ ...prev, [url]: { status: null, ok: false, level: 'error', durationMs: 0, error: (err as Error).message } }))
    }
  }

  const handleBatchDelete = async () => {
    if (props.selectedIds.size === 0) return
    props.setBatchDeleting(true)
    try {
      // Keep the selection when nothing was deleted: a failed run should not lose the rows the
      // reader picked while the toast is still on screen.
      const deleted = await props.onBatchDeleteLinks(Array.from(props.selectedIds))
      if (deleted) props.setSelectedIds(new Set())
    } finally {
      props.setBatchDeleting(false)
    }
  }

  return { handleStart, handlePause, handleCheckSingle, handleBatchDelete }
}

export function computeStats(links: BlogLink[], results: Record<string, HealthResult>) {
  const counts: Record<'ok' | 'warning' | 'broken' | 'error' | 'unchecked', number> =
    { ok: 0, warning: 0, broken: 0, error: 0, unchecked: 0 }
  for (const l of links) {
    const level = results[l.url]?.level
    const key = level === 'ok' || level === 'warning' || level === 'broken' || level === 'error' ? level : 'unchecked'
    counts[key]++
  }
  return counts
}

async function runCheckerLoop(
  links: BlogLink[],
  _initialResults: Record<string, HealthResult>,
  setResults: React.Dispatch<React.SetStateAction<Record<string, HealthResult>>>,
  setProgressIndex: (n: number) => void,
  stopRef: React.RefObject<boolean>,
) {
  for (let i = 0; i < links.length; i += BATCH_SIZE) {
    if (stopRef.current) break
    const chunk = links.slice(i, i + BATCH_SIZE)
    const urls = chunk.map((c) => c.url)

    setResults((prev) => {
      const next = { ...prev }
      for (const u of urls) next[u] = { status: null, ok: false, level: 'checking', durationMs: 0 }
      return next
    })

    try {
      const res = await api.blog.links.check(urls)
      const resMap = new Map(res.results.map((r) => [r.url, r]))
      setResults((prev) => {
        const next = { ...prev }
        for (const u of urls) {
          const r = resMap.get(u)
          if (r) {
            next[u] = { status: r.status, ok: r.ok, level: r.level, durationMs: r.durationMs, error: r.error, finalUrl: r.finalUrl }
          }
        }
        saveCachedResults(next)
        return next
      })
    } catch (err: unknown) {
      // One flaky request must not mark a whole batch broken: a failure to ask is recorded as an
      // error, which the filter, the counts and the bulk delete all keep apart from a verdict.
      setResults((prev) => {
        const next = { ...prev }
        for (const u of urls) {
          next[u] = { status: null, ok: false, level: 'error', durationMs: 0, error: (err as Error).message }
        }
        return next
      })
    }
    setProgressIndex(Math.min(links.length, i + BATCH_SIZE))
  }
}

function loadCachedResults(
  set: (r: Record<string, HealthResult>) => void,
  setStale: (stale: boolean) => void,
) {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.results === 'object') {
      // An old verdict is still worth showing — it is the last thing anyone measured — but it is
      // shown as old.
      setStale(isCacheStale(parsed.timestamp, Date.now()))
      set(parsed.results)
    }
  } catch {
    set({})
  }
}

function saveCachedResults(results: Record<string, HealthResult>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), results }))
  } catch {
    return false
  }
}
