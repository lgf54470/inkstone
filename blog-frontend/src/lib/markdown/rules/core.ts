import MarkdownIt from 'markdown-it'
import type { Token } from 'markdown-it'
import { calloutDefaultTitle, normalizeCalloutType } from '../callout.ts'
import { slugify } from '../slugify.ts'
import type { TocHeading } from '../types.ts'

function appendTokenClass(token: Token, className: string): void {
  const attr = token.attrGet('class')
  const current = typeof attr === 'string' ? attr : ''
  const classes = current.split(/\s+/).filter(Boolean)
  if (!classes.includes(className)) {
    classes.push(className)
    token.attrSet('class', classes.join(' '))
  }
}

function plainInline(token: Token): string {
  if (token.type !== 'inline' || !token.children) return token.content || ''
  return token.children
    .filter((child) => ['text', 'code_inline', 'inline_tag', 'wikilink', 'block_reference'].includes(child.type))
    .map((child) => child.content)
    .join('')
    .trim()
}

export function registerCoreRules(md: InstanceType<typeof MarkdownIt>, headings: TocHeading[]): void {
  // Core rule: Block anchors ^anchor-id
  md.core.ruler.push('obsidian_blocks', (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const inline = state.tokens[index]!
      if (inline.type !== 'inline') continue
      const prev = state.tokens[index - 1]
      if (!prev || !['paragraph_open', 'heading_open'].includes(prev.type)) continue
      const match = /(?:^|\s)\^([A-Za-z0-9][A-Za-z0-9_-]{0,63})\s*$/.exec(inline.content)
      if (match) {
        const id = match[1]!
        prev.attrSet('id', `^${id}`)
        prev.attrSet('data-block-id', id)
        inline.content = inline.content.slice(0, match.index).trimEnd()
      }
    }
    return true
  })

  // Core rule: Task List Items (<span class="task-label"> wrapper and status markers)
  md.core.ruler.after('github-task-lists', 'task_labels_and_markers', (state) => {
    for (let index = 2; index < state.tokens.length; index++) {
      const inline = state.tokens[index]!
      const paragraph = state.tokens[index - 1]!
      const item = state.tokens[index - 2]!
      if (
        inline.type !== 'inline' ||
        paragraph.type !== 'paragraph_open' ||
        item.type !== 'list_item_open' ||
        !inline.children?.length
      ) {
        continue
      }

      const cbIdx = inline.children.findIndex(
        (child) => child.type === 'html_inline' && /task-list-item-checkbox/.test(child.content)
      )
      let status = ''
      let checked = false
      if (cbIdx >= 0) {
        const checkbox = inline.children[cbIdx]!
        checked = /\schecked(?:=|\s|>)/.test(checkbox.content)
        status = checked ? 'done' : 'todo'
        checkbox.content = `<input type="checkbox" class="task-list-item-checkbox"${checked ? ' checked=""' : ''} data-task-status="${status}" />`
        const labelOpen = new state.Token('html_inline', '', 0)
        labelOpen.content = '<span class="task-label">'
        const labelClose = new state.Token('html_inline', '', 0)
        labelClose.content = '</span>'
        inline.children.splice(cbIdx + 1, 0, labelOpen)
        inline.children.push(labelClose)
      } else {
        const firstChild = inline.children[0]
        if (firstChild?.type === 'text') {
          const extMatch = /^\[([/\-?!])\][ \t]*/.exec(firstChild.content)
          if (extMatch) {
            const ch = extMatch[1]!
            status =
              ch === '/' ? 'in-progress' :
              ch === '-' ? 'cancelled' :
              ch === '?' ? 'question' :
              ch === '!' ? 'important' : 'todo'
            firstChild.content = firstChild.content.slice(extMatch[0].length)
            appendTokenClass(item, 'task-list-item')
            const listOpen = state.tokens.slice(0, index - 2).reverse().find(
              (t) => t.type === 'bullet_list_open' || t.type === 'ordered_list_open'
            )
            if (listOpen) appendTokenClass(listOpen, 'contains-task-list')
            const checkbox = new state.Token('html_inline', '', 0)
            checkbox.content = `<input type="checkbox" class="task-list-item-checkbox" data-task-status="${status}" />`
            const labelOpen = new state.Token('html_inline', '', 0)
            labelOpen.content = '<span class="task-label">'
            const labelClose = new state.Token('html_inline', '', 0)
            labelClose.content = '</span>'
            inline.children.unshift(checkbox)
            inline.children.splice(1, 0, labelOpen)
            inline.children.push(labelClose)
          }
        }
      }
      if (status) {
        item.attrSet('data-task-status', status)
        appendTokenClass(item, `task-status-${status}`)
        if (status === 'done') appendTokenClass(item, 'done')
        else if (status === 'cancelled') appendTokenClass(item, 'cancelled')
      }
    }
    return true
  })

  // Core rule: Obsidian Callouts (> [!NOTE] ...)
  md.core.ruler.after('github-task-lists', 'obsidian_callouts', (state) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const open = state.tokens[index]!
      if (open.type !== 'blockquote_open') continue
      const pOpen = state.tokens[index + 1]
      const inline = state.tokens[index + 2]
      if (pOpen?.type !== 'paragraph_open' || inline?.type !== 'inline') continue
      const firstBreak = inline.content.indexOf('\n')
      const firstLine = firstBreak >= 0 ? inline.content.slice(0, firstBreak) : inline.content
      const marker = /^\[!([A-Za-z][A-Za-z0-9_-]{0,31})\]([+-])?(?:[ \t]+(.+?))?[ \t]*$/.exec(firstLine)
      if (!marker) continue

      let depth = 0
      let closeIndex = -1
      for (let i = index; i < state.tokens.length; i++) {
        if (state.tokens[i]!.type === 'blockquote_open') depth++
        else if (state.tokens[i]!.type === 'blockquote_close' && --depth === 0) {
          closeIndex = i
          break
        }
      }
      if (closeIndex < 0) continue

      const type = normalizeCalloutType(marker[1]!)
      const fold = marker[2] ?? ''
      const title = marker[3]?.trim() || calloutDefaultTitle(type)

      open.type = 'callout_open'
      open.tag = fold ? 'details' : 'aside'
      open.meta = { type, title, fold }

      const close = state.tokens[closeIndex]!
      close.type = 'callout_close'
      close.tag = open.tag
      close.meta = { fold }

      const remaining = firstBreak >= 0 ? inline.content.slice(firstBreak + 1) : ''
      if (remaining.trim()) {
        inline.content = remaining
        inline.children = []
        md.inline.parse(remaining, md, state.env, inline.children)
      } else {
        const pClose = state.tokens[index + 3]
        if (pClose?.type === 'paragraph_close') state.tokens.splice(index + 1, 3)
      }
    }
    return true
  })

  // Collect headings in core phase before TOC rendering
  md.core.ruler.push('collect_headings', (state) => {
    headings.length = 0
    for (let index = 0; index < state.tokens.length; index++) {
      const token = state.tokens[index]!
      if (token.type !== 'heading_open') continue
      const inline = state.tokens[index + 1]
      const text = inline ? plainInline(inline) : ''
      const level = parseInt(token.tag.slice(1), 10)
      const slug = String(token.attrGet('id') ?? slugify(text))
      headings.push({
        level,
        text,
        slug,
      })
    }
    return true
  })
}