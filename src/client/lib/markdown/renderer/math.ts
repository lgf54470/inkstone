import MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import { encodeDataValue } from '../data-attr'
import { blockLine } from './containers'
import { renderEnv } from './env'
import { escapeAttr } from './util'

const MATH_INLINE = /^\$(?!\s)((?:[^$\\]|\\.)+?)(?<!\s)\$/

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== '$')
    return false
  const match = MATH_INLINE.exec(state.src.slice(state.pos))
  if (!match)
    return false
  if (!silent) {
    const token = state.push('math_inline', 'span', 0)
    token.content = match[1]!
    token.markup = '$'
    renderEnv(state.env).hasMath = true
  }
  state.pos += match[0].length
  return true
}

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const line = blockLine(state, startLine)
  if (!/^\$\$/.test(line))
    return false
  const firstLine = line.slice(2)
  let content = ''
  let next = startLine
  let isFound = false
  if (firstLine.trim().endsWith('$$')) {
    content = firstLine.trim().slice(0, -2)
    isFound = true
  }
  else {
    while (!isFound && ++next < endLine) {
      const text = blockLine(state, next)
      if (text.trim().endsWith('$$')) {
        content += text.slice(0, text.lastIndexOf('$$'))
        isFound = true
      }
      else {
        content += `${text}\n`
      }
    }
    if (firstLine.trim())
      content = `${firstLine}\n${content}`
  }
  if (!isFound)
    return false
  if (silent)
    return true
  const token = state.push('math_block', 'div', 0)
  token.content = content.trim()
  token.map = [startLine, next + 1]
  token.markup = '$$'
  renderEnv(state.env).hasMath = true
  state.line = next + 1
  return true
}

export function registerMath(md: MarkdownIt): void {

  md.inline.ruler.before('escape', 'math_inline', mathInlineRule)
  md.block.ruler.before('fence', 'math_block', mathBlockRule)
  md.renderer.rules.math_inline = (tokens, index) => `<span class="math-inline" data-math="${escapeAttr(encodeDataValue(tokens[index]!.content))}"></span>`
  md.renderer.rules.math_block = (tokens, index) => {
    const token = tokens[index]!
    const line = token.map ? ` data-line="${token.map[0]}"` : ''
    return `<div class="math-block"${line} data-math="${escapeAttr(encodeDataValue(token.content))}"></div>`
  }
}
