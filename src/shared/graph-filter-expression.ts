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
  folderName: string | null
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
      : Boolean(subject.folderName) && containsTerm(subject.folderName!, term.value)
    if (isMatched === term.isExcluded) return false
  }
  return true
}
