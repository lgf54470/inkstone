import { useEffect, useMemo, useRef, useState } from 'react'
import type { BlogLink } from '@shared/types'
import { api } from '../../../lib/api'

export interface HealthResult {
  status: number | null
  ok: boolean
  level: 'ok' | 'warning' | 'broken' | 'skipped' | 'checking'
  durationMs: number
  error?: string
  finalUrl?: string
}

const BATCH_SIZE = 8
const CACHE_KEY = 'inkstone_blog_link_check_cache'

export function useLinkCheckerState(
  links: BlogLink[],
  open: boolean,
  onBatchDeleteLinks: (ids: string[]) => Promise<void>,
) {
  const [results, setResults] = useState<Record<string, HealthResult>>({})
  const [running, setRunning] = useState(false)
  const [progressIndex, setProgressIndex] = useState(0)
  const [filterLevel, setFilterLevel] = useState<'all' | 'broken' | 'warning' | 'ok'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const stopRequested = useRef(false)

  useEffect(() => {
    if (!open) {
      stopRequested.current = true
      setRunning(false)
      return
    }
    loadCachedResults(setResults)
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
    selectedIds, setSelectedIds, batchDeleting, stats, filteredLinks,
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
  onBatchDeleteLinks: (ids: string[]) => Promise<void>
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
      props.setResults((prev) => ({ ...prev, [url]: { status: null, ok: false, level: 'broken', durationMs: 0, error: (err as Error).message } }))
    }
  }

  const handleBatchDelete = async () => {
    if (props.selectedIds.size === 0) return
    props.setBatchDeleting(true)
    try {
      await props.onBatchDeleteLinks(Array.from(props.selectedIds))
      props.setSelectedIds(new Set())
    } finally {
      props.setBatchDeleting(false)
    }
  }

  return { handleStart, handlePause, handleCheckSingle, handleBatchDelete }
}

export function computeStats(links: BlogLink[], results: Record<string, HealthResult>) {
  const counts = { ok: 0, warning: 0, broken: 0, unchecked: 0 }
  for (const l of links) {
    const level = results[l.url]?.level
    const key = level === 'ok' || level === 'warning' || level === 'broken' ? level : 'unchecked'
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
      setResults((prev) => {
        const next = { ...prev }
        for (const u of urls) {
          next[u] = { status: null, ok: false, level: 'broken', durationMs: 0, error: (err as Error).message }
        }
        return next
      })
    }
    setProgressIndex(Math.min(links.length, i + BATCH_SIZE))
  }
}

function loadCachedResults(set: (r: Record<string, HealthResult>) => void) {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.results === 'object') set(parsed.results)
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
