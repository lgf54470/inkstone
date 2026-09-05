import { truncateText } from "@shared/text-utils";
import type { Env } from "../../env";
import { searchUserNotes } from "../../routes/search";
import { fuseByRrf, searchSemanticNotes, semanticSnippet, type SemanticSearchHit } from "../ai-search";

const SEARCH_CANDIDATES = 40

const HYBRID_CANDIDATES = 24

export type McpSearchMode = 'auto' | 'lexical' | 'semantic' | 'hybrid'

export interface McpSearchOptions {
  query: string
  limit?: number
  tags?: string[]
  folder?: string
  starred?: boolean
  archived?: boolean
  mode?: McpSearchMode
}

export interface McpSearchHit {
  id: string
  title: string
  url: string
  snippet: string
  score: number
  rev: number
  updatedAt: number
  source: 'lexical' | 'semantic' | 'both'
}

export interface McpSearchResponse {
  results: McpSearchHit[]
  mode: 'lexical' | 'semantic' | 'hybrid'
}

export async function searchMcpNotes(
  env: Env,
  userId: string,
  origin: string,
  ftsEnabled: boolean,
  options: McpSearchOptions,
): Promise<McpSearchResponse> {
  const limit = Math.max(1, Math.min(20, options.limit ?? 8))
  const mode = options.mode ?? 'auto'
  const lexicalQuery = composeLexicalQuery(options)
  const { results: lexical } = await searchUserNotes(
    env.DB, userId, lexicalQuery, SEARCH_CANDIDATES, ftsEnabled,
  )
  const lexicalHits: LexicalHit[] = lexical.map((hit) => ({
    id: hit.note.id,
    title: hit.note.title,
    url: noteUrl(origin, hit.note.id),
    snippet: hit.snippet,
    score: hit.score,
    rev: hit.note.rev,
    updatedAt: hit.note.updatedAt,
    excerpt: hit.note.excerpt,
  }))

  const wantsSemantic = mode === 'auto' || mode === 'hybrid' || mode === 'semantic'
  let semanticHits: SemanticSearchHit[] | null = null
  if (wantsSemantic) {
    try {
      semanticHits = await searchSemanticNotes(env, env.DB, userId, options.query, {
        tags: options.tags,
        folder: options.folder,
        starred: options.starred,
        archived: options.archived,
      })
    } catch (error) {
      // AI unavailable, rate-limited, or malformed response: degrade to lexical.
      console.warn('[inkstone] Semantic search unavailable; using lexical:', error instanceof Error ? error.message : error)
      semanticHits = null
    }
  }
  if (!semanticHits || !semanticHits.length) {
    return {
      results: lexicalHits.slice(0, limit).map((hit) => ({ ...hit, source: 'lexical' as const })),
      mode: 'lexical',
    }
  }

  const semanticCandidates: SemanticHit[] = semanticHits.slice(0, HYBRID_CANDIDATES).map((hit) => ({
    ...hit,
    url: noteUrl(origin, hit.id),
  }))
  if (mode === 'semantic') {
    return {
      results: semanticCandidates.slice(0, limit).map((hit) => ({
        id: hit.id,
        title: hit.title,
        url: hit.url,
        snippet: semanticSnippet(hit.excerpt),
        score: hit.score,
        rev: hit.rev,
        updatedAt: hit.updatedAt,
        source: 'semantic' as const,
      })),
      mode: 'semantic',
    }
  }
  const fused = fuseByRrf(lexicalHits, semanticCandidates)
  const results: McpSearchHit[] = fused.slice(0, limit).map(({ item, sources }) => {
    const lexicalHit = sources.has('lexical') && isLexicalHit(item) ? item : null
    const semanticHit = sources.has('semantic') && !isLexicalHit(item) ? item : null
    return {
      id: item.id,
      title: item.title,
      url: noteUrl(origin, item.id),
      snippet: lexicalHit?.snippet ?? (semanticHit ? semanticSnippet(semanticHit.excerpt) : ''),
      score: lexicalHit?.score ?? semanticHit?.score ?? item.score,
      rev: item.rev,
      updatedAt: item.updatedAt,
      source: sources.size > 1 ? 'both' : sources.has('semantic') ? 'semantic' : 'lexical',
    }
  })
  return {
    results,
    mode: lexicalHits.length && semanticHits.length ? 'hybrid' : 'semantic',
  }
}

type LexicalHit = {
  id: string
  title: string
  url: string
  snippet: string
  score: number
  rev: number
  updatedAt: number
  excerpt: string
}

type SemanticHit = SemanticSearchHit & { url: string }

function isLexicalHit(hit: LexicalHit | SemanticHit): hit is LexicalHit {
  return 'snippet' in hit
}

function composeLexicalQuery(options: McpSearchOptions): string {
  const parts = [options.query.trim()]
  for (const tag of options.tags ?? []) parts.push(`tag:"${escapeQuote(tag)}"`)
  if (options.folder) parts.push(`folder:"${escapeQuote(options.folder)}"`)
  if (options.starred === true) parts.push('is:starred')
  if (options.archived === true) parts.push('is:archived')
  else if (options.archived === false) parts.push('is:unarchived')
  return parts.filter(Boolean).join(' ')
}

export function noteUrl(origin: string, noteId: string): string {
  return `${origin.replace(/\/$/, '')}/n/${encodeURIComponent(noteId)}`
}

function escapeQuote(value: string): string {
  return truncateText(value.replace(/"/g, ''), 120)
}
