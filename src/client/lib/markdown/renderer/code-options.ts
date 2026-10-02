import { braceTokens, infoFlag, infoOption, infoTokens, isBraceGroup } from './info-string'
import { parseFenceInfo, parseLineSpec } from './parse'
import { clamp } from './util'

/**
 * What a standard code block lets the note say about itself: its title, whether the gutter numbers
 * the lines and from where, which lines are highlighted, whether long lines wrap, whether the block
 * starts folded and which palette it draws with.
 *
 * The first four already reached the renderer before this module; the last three are what the
 * settings toolbar adds. They live in the fence's info string, so the block carries its own
 * configuration and every toolbar edit is an ordinary source edit.
 */

export type CodeTheme = 'auto' | 'light' | 'dark'

export interface CodeBlockOptions {
  title: string
  lineNumbers: boolean
  startLine: number
  highlighted: number[]
  wrap: boolean
  /** Fold beyond this many lines; null follows the preview setting, 0 never folds. */
  collapse: number | null
  theme: CodeTheme
}

export const CODE_OPTION_DEFAULTS: CodeBlockOptions = {
  title: '',
  lineNumbers: false,
  startLine: 1,
  highlighted: [],
  wrap: false,
  collapse: null,
  theme: 'auto',
}

const LINE_NUMBER_FLAGS = new Set(['line-numbers', 'linenumbers', 'linenos', 'numberlines', 'number-lines', 'show-line-numbers', 'showlinenumbers'])
const HIGHLIGHT_KEYS = new Set(['hl_lines', 'highlight'])
const MANAGED_KEYS = new Set(['title', 'start', 'startfrom', 'wrap', ...HIGHLIGHT_KEYS])
const MANAGED_FLAGS = new Set([...LINE_NUMBER_FLAGS, 'nowrap', 'wrap', 'collapse'])
const COLLAPSE_LIMIT = 100000

function isHighlightSpec(token: string): boolean {
  return isBraceGroup(token) && /^\d[\d,\s-]*$/.test(token.slice(1, -1).trim())
}

function isManagedToken(token: string): boolean {
  if (isHighlightSpec(token)) return true
  if (isBraceGroup(token)) return braceTokens(token).every(isManagedToken)
  const option = infoOption(token)
  if (option) return MANAGED_KEYS.has(option.key) || LINE_NUMBER_FLAGS.has(option.key) || option.key === 'collapse' || option.key === 'theme'
  return MANAGED_FLAGS.has(infoFlag(token))
}

/** Reads every managed option; anything unset keeps the default. */
export function readCodeOptions(info: string): CodeBlockOptions {
  const base = parseFenceInfo(info)
  const options: CodeBlockOptions = {
    ...CODE_OPTION_DEFAULTS,
    title: base.title,
    lineNumbers: base.lineNumbers,
    startLine: base.startLine,
    highlighted: [...base.highlightedLines],
  }
  for (const token of infoTokens(info)) {
    const option = infoOption(token)
    const flag = infoFlag(token)
    if (flag === 'wrap') options.wrap = true
    else if (flag === 'nowrap') options.wrap = false
    else if (option?.key === 'collapse') options.collapse = parseCollapseValue(option.value)
    else if (option?.key === 'theme') {
      const theme = codeTheme(option.value)
      if (theme) options.theme = theme
    }
  }
  return options
}

export function codeTheme(value: string): CodeTheme | null {
  const normalized = value.toLowerCase().replace(/^["']|["']$/g, '').trim()
  return normalized === 'light' || normalized === 'dark' || normalized === 'auto' ? normalized : null
}

/** The fold threshold a `collapse=` value asks for: null when it is not a number at all. */
export function parseCollapseValue(value: string): number | null {
  return /^\d{1,6}$/.test(value.trim()) ? clamp(Number(value.trim()), 0, COLLAPSE_LIMIT) : null
}

/**
 * Whether the fence currently numbers its lines. `parseFenceInfo` reads every spelling except a
 * leading brace group, whose inner tokens never reach its trailing scan, so that spelling is read
 * here too — writing "off" only when the fence ever said "on" is what keeps the note from growing a
 * redundant flag.
 */
function isNumbered(info: string): boolean {
  if (readCodeOptions(info).lineNumbers) return true
  const leading = infoTokens(info)[0]
  return Boolean(leading) && isBraceGroup(leading!) && braceTokens(leading!).some((token) => LINE_NUMBER_FLAGS.has(infoFlag(token)))
}

/**
 * The info string with the managed options put back, in one canonical spelling: a value equal to the
 * default is dropped rather than written, and every unmanaged token the user wrote survives. A title
 * is the one value that cannot round-trip a double quote inside its own quoting, so it is normalized
 * to single ones.
 */
export function writeCodeOptions(info: string, next: CodeBlockOptions): string {
  const tokens = infoTokens(info)
  const kept = tokens.filter((token, index) => index === 0 || !isManagedToken(token))
  if (next.lineNumbers) kept.push('line-numbers')
  else if (isNumbered(info)) kept.push('line-numbers=false')
  if (next.title.trim()) kept.push(`title="${next.title.trim().replace(/"/g, "'")}"`)
  if (next.startLine > 1) kept.push(`start=${next.startLine}`)
  if (next.highlighted.length) kept.push(`{${next.highlighted.join(',')}}`)
  if (next.wrap) kept.push('wrap')
  if (next.collapse !== null) kept.push(`collapse=${next.collapse}`)
  if (next.theme !== 'auto') kept.push(`theme=${next.theme}`)
  return kept.join(' ')
}

/** The highlight input a person types ("2,4-6") read back, bounded like the fence's own specs. */
export function readHighlightInput(value: string): number[] {
  return parseLineSpec(value)
}
