import type { NoteSummary } from './notes';

export type SearchMode = 'fts' | 'like'

export interface SearchHit {
  note: NoteSummary
  snippet: string
  score: number
}

export interface SearchResponse {
  results: SearchHit[]
  mode: SearchMode
  took: number
  query: {
    text: string
    tags: string[]
    folder: string | null
    starred: boolean | null
    archived: boolean | null
  }
}
