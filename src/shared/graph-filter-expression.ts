export interface GraphFilterTerm {
  kind: 'tag' | 'folder'
  value: string
  isExcluded: boolean
}

export interface GraphFilterExpression {
  /** Free text matched against the note title. */
  text: string
  terms: GraphFilterTerm[]
}

/** Qualified terms are capped so one filter cannot outgrow the bound-variable budget of the query. */
export const GRAPH_FILTER_TERM_LIMIT = 8

const TOKEN_PATTERN = /(?:-?(?:tag|path):(?:"[^"]*"|\S+)|\S+)/g
const QUALIFIER_PATTERN = /^(-?)(tag|path):(?:"([^"]*)"|(\S+))$/

function parseTerm(token: string): GraphFilterTerm | null {
  const matched = QUALIFIER_PATTERN.exec(token)
  if (!matched) return null
  const value = (matched[3] ?? matched[4] ?? '').trim()
  if (!value) return null
  return { kind: matched[2] === 'tag' ? 'tag' : 'folder', value, isExcluded: matched[1] === '-' }
}

/**
 * Splits a graph filter line into free text plus `tag:` / `path:` terms, each optionally negated with a
 * leading `-`. A quoted value may contain a space. One unparseable qualifier is kept as text rather than
 * dropped, so a typo hides notes the way the old title-only search did instead of silently widening the
 * graph.
 */
export function parseGraphFilter(raw: string): GraphFilterExpression {
  const textParts: string[] = []
  const terms: GraphFilterTerm[] = []
  for (const token of raw.match(TOKEN_PATTERN) ?? []) {
    const term = parseTerm(token)
    if (term && terms.length < GRAPH_FILTER_TERM_LIMIT) terms.push(term)
    else textParts.push(token)
  }
  return { text: textParts.join(' ').trim(), terms }
}

export interface GraphFilterSubject {
  title: string
  /** What a `path:` term is matched against: the folder's whole way down, not just its last word (G-48). */
  folderPath: string | null
  tags: Array<{ name: string }>
}

function containsTerm(value: string, term: string): boolean {
  return value.toLocaleLowerCase().includes(term.toLocaleLowerCase())
}

/** Client-side evaluation of the same grammar, used by the color groups of the graph panel. */
export function graphFilterMatches(subject: GraphFilterSubject, expression: GraphFilterExpression): boolean {
  if (expression.text && !containsTerm(subject.title, expression.text)) return false
  for (const term of expression.terms) {
    const isMatched = term.kind === 'tag'
      ? subject.tags.some((tag) => tag.name.toLowerCase() === term.value.toLowerCase())
      : Boolean(subject.folderPath) && containsTerm(subject.folderPath!, term.value)
    if (isMatched === term.isExcluded) return false
  }
  return true
}

/**
 * How to write a folder back into a filter line. A path is one term only while it holds no space, so
 * `Reading Room/Notes` has to arrive quoted — otherwise the grammar reads it as a folder called
 * `Reading` plus the free text `Room/Notes` (G-48).
 */
export function graphPathTerm(value: string): string {
  return /\s/.test(value) ? `path:"${value}"` : `path:${value}`
}
