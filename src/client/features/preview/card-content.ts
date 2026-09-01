import { useEffect, useRef, useState } from 'react'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { enhancePreview } from '../../lib/markdown/enhance'
import { getNoteBacklinks } from '../../lib/backlinks'
import { useDebounced } from '../../lib/hooks'
import { useNotes } from '../../store/notes'
import type { Backlink } from '@shared/types'

export interface NoteCardContent {
  status: 'loading' | 'ready' | 'missing' | 'error'
  html: string
  truncated: boolean
}

const HTML_CACHE_LIMIT = 40
const htmlCache = new Map<string, string>()

export function useNoteCardContent(
  target: { noteId: string | null; missing: boolean; headline?: string },
  dark: boolean,
  previewMath: boolean,
  maxLength: number,
): NoteCardContent {
  const [status, setStatus] = useState<NoteCardContent['status']>(
    target.missing || !target.noteId ? 'missing' : 'loading',
  )
  const [html, setHtml] = useState('')
  const [truncated, setTruncated] = useState(false)
  const revisionRef = useRef(0)
  const statusRef = useRef<NoteCardContent['status']>(status)
  const noteIdRef = useRef(target.noteId)
  const headline = target.headline?.trim()
  const rev = useNotes((s) => (target.noteId ? s.notes[target.noteId]?.rev ?? 0 : 0))
  const hydrated = useNotes((s) => s.hydrated)
  const liveContent = useNotes((s) => (target.noteId ? s.contents[target.noteId] : undefined))
  const debouncedLiveContent = useDebounced(liveContent ?? '', 90)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    if (target.missing || !target.noteId) {
      noteIdRef.current = null
      statusRef.current = 'missing'
      setStatus('missing')
      return
    }
    if (noteIdRef.current !== target.noteId) {
      noteIdRef.current = target.noteId
      statusRef.current = 'loading'
    }
    const revision = ++revisionRef.current
    let cancelled = false
    if (statusRef.current !== 'ready') {
      setStatus('loading')
      setHtml('')
      setTruncated(false)
    }
    void useNotes
      .getState()
      .peekContent(target.noteId)
      .then(async (content) => {
        if (cancelled || revision !== revisionRef.current) return
        if (content == null) {
          if (hydrated || rev > 0) {
            statusRef.current = 'error'
            setStatus('error')
          }
          return
        }
        const truncatedContent = limitPreviewLength(content, maxLength)
        const cacheKey = [target.noteId, rev, hashString(truncatedContent), previewMath ? 1 : 0, dark ? 1 : 0].join(':')
        let nextHtml = htmlCache.get(cacheKey)
        if (nextHtml === undefined) {
          const staging = document.createElement('div')
          staging.innerHTML = renderMarkdown(truncatedContent).html
          if (staging.querySelector('pre code') || staging.querySelector('[data-math]')) {
            await enhancePreview(staging, {
              math: previewMath,
              mermaid: false,
              dark,
              codeBlockCollapseLines: 0,
            })
          }
          nextHtml = staging.innerHTML
          remember(htmlCache, cacheKey, nextHtml, HTML_CACHE_LIMIT)
        }
        if (cancelled || revision !== revisionRef.current) return
        const highlighted = headline ? applyHighlightToHtml(nextHtml, buildHighlightTerms(headline)) : nextHtml
        setHtml(highlighted)
        setTruncated(truncatedContent.length < content.length)
        statusRef.current = 'ready'
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled && revision === revisionRef.current) {
          statusRef.current = 'error'
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [target.missing, target.noteId, dark, maxLength, previewMath, headline, rev, hydrated, debouncedLiveContent])

  return { status, html, truncated }
}

interface NoteBacklinks {
  links: Backlink[] | null
}

export function useNoteBacklinks(noteId: string | null): NoteBacklinks {
  const rev = useNotes((s) => (noteId ? s.notes[noteId]?.rev ?? 0 : 0))
  const cursor = useNotes((s) => s.cursor)
  const [links, setLinks] = useState<Backlink[] | null>(null)

  useEffect(() => {
    if (!noteId) {
      setLinks(null)
      return
    }
    const controller = new AbortController()
    let cancelled = false
    setLinks(null)
    getNoteBacklinks(noteId, rev, cursor, controller.signal)
      .then((response) => {
        if (!cancelled) setLinks(response)
      })
      .catch(() => {
        if (!cancelled) setLinks([])
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [noteId, rev, cursor])

  return { links }
}

export function hashString(value: string): number {
  let hash = 5381
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0
  }
  return hash
}

export function buildHighlightTerms(headline: string): string[] {
  const normalized = headline.trim()
  if (!normalized) return []
  const words = normalized
    .split(/[\s\u3000\uFF0C\u3002\u3001\uFF1B\uFF1A\uFF01\uFF1F\uFF08\uFF09()\u300C\u300D\u300E\u300F\u300A\u300B\u3008\u3009\u3010\u3011\[\]{}'"\u2018\u2019\u201C\u201D\u00B7\u2014\u2026:;,./\\|#+_-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
  const terms = new Set<string>(words)
  terms.add(normalized)
  if (words.length > 1) terms.add(words.join(''))
  return [...terms].sort((a, b) => b.length - a.length)
}

export function applyHighlightToHtml(html: string, terms: string[]): string {
  if (!terms.length) return html
  const staging = document.createElement('div')
  staging.innerHTML = html
  highlightMatches(staging, terms)
  return staging.innerHTML
}

function highlightMatches(root: HTMLElement, terms: string[]): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (!node.data) continue
    if (node.parentElement?.closest('mark, code, pre, script, style'))
      continue
    textNodes.push(node)
  }
  for (const node of textNodes) {
    const parent = node.parentElement
    if (!parent) continue
    const segments = splitByTerms(node.data, terms)
    if (!segments) continue
    const fragment = document.createDocumentFragment()
    for (const segment of segments) {
      if (segment.highlight) {
        const mark = document.createElement('mark')
        mark.className = 'card-hl'
        mark.textContent = segment.text
        fragment.appendChild(mark)
      }
      else {
        fragment.appendChild(document.createTextNode(segment.text))
      }
    }
    parent.replaceChild(fragment, node)
  }
}

function splitByTerms(text: string, terms: string[]): Array<{ text: string; highlight: boolean }> | null {
  const lower = text.toLowerCase()
  const result: Array<{ text: string; highlight: boolean }> = []
  let position = 0
  let changed = false
  while (position < text.length) {
    const match = findNextTerm(lower, terms, position)
    if (!match) {
      if (position < text.length) result.push({ text: text.slice(position), highlight: false })
      break
    }
    if (match.index > position) {
      result.push({ text: text.slice(position, match.index), highlight: false })
    }
    const end = match.index + match.term.length
    if (!isInsideWord(text, match.index, match.term)) {
      result.push({ text: text.slice(match.index, end), highlight: true })
      changed = true
    }
    else {
      result.push({ text: text.slice(match.index, end), highlight: false })
    }
    position = end
  }
  return changed ? result : null
}

function findNextTerm(lower: string, terms: string[], start: number): { term: string; index: number } | null {
  let best: { term: string; index: number } | null = null
  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase(), start)
    if (index < 0) continue
    if (best === null || index < best.index || (index === best.index && term.length > best.term.length))
      best = { term, index }
  }
  return best
}

function isInsideWord(text: string, index: number, term: string): boolean {
  if (!/^[A-Za-z0-9]+$/.test(term) || term.length < 3) return false
  const before = index > 0 ? text[index - 1] : ''
  const after = index + term.length < text.length ? text[index + term.length] : ''
  return /[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after)
}

function limitPreviewLength(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  const cut = content.slice(0, maxLength)
  const newline = cut.lastIndexOf('\n')
  return cut.slice(0, newline >= maxLength * 0.6 ? newline : maxLength)
}

function remember<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  if (cache.has(key))
    cache.delete(key)
  cache.set(key, value)
  while (cache.size > limit) {
    const oldest = cache.keys().next().value as K | undefined
    if (oldest === undefined)
      break
    cache.delete(oldest)
  }
}