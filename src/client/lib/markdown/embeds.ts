import { parseFrontMatter } from '@shared/markdown-utils'
import type { Note } from '@shared/types'
import { api } from '../api'
import { t } from '../i18n'
import { findNoteByTitle } from '../../store/notes/selectors'
import { useNotes } from '../../store/notes'
import { useSession } from '../../store/session'
import { decodeDataValue } from './data-attr'
import { parseWikiTarget, renderMarkdown } from './renderer'

interface ResolveOptions {
  currentContent: string
  currentTitle: string
  isCurrent?: () => boolean
}

interface ResolveContext extends ResolveOptions {
  rendered: number
  totalChars: number
  fetchCache: Map<string, Promise<Note>>
  rootScope: EmbedScope
}

interface EmbedScope {
  content: string
  title: string
  identity: string
}

interface ResolvedEmbed {
  markdown: string
  label: string
  scope: EmbedScope
  signature: string
}

const MAX_DEPTH = 4
const MAX_EMBEDS = 24
const MAX_TOTAL_CHARS = 2_000_000


export async function resolveNoteEmbeds(root: HTMLElement, options: ResolveOptions): Promise<void> {
  const rootScope: EmbedScope = {
    content: options.currentContent,
    title: options.currentTitle,
    identity: `current:${normalize(options.currentTitle)}`,
  }
  const context: ResolveContext = {
    ...options,
    rendered: 0,
    totalChars: 0,
    fetchCache: new Map(),
    rootScope,
  }
  await resolveWithin(root, context, 0, new Set([`${rootScope.identity}##`]), rootScope)
}

function resolveExampleScope(embed: HTMLElement, context: ResolveContext, scope: EmbedScope): EmbedScope {
  const example = embed.closest<HTMLElement>('[data-markdown-example]')
  const exampleSource = decodeDataValue(example?.dataset.markdownExample)
  if (!exampleSource) return scope
  return {
    content: exampleSource,
    title: scope.title,
    identity: `${context.rootScope.identity}:example:${example?.dataset.markdownExampleId ?? 'local'}`,
  }
}

function renderResolvedEmbed(
  embed: HTMLElement,
  body: HTMLElement,
  head: HTMLElement | null,
  resolved: ResolvedEmbed,
  target: ReturnType<typeof parseWikiTarget>,
): void {
  const rendered = renderMarkdown(resolved.markdown, {
    externalImages: useSession.getState().settings.preview.externalImages,
  })
  body.innerHTML = rendered.html
  body.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox').forEach((input) => {
    input.disabled = true
    input.removeAttribute('data-task-line')
    input.setAttribute('aria-label', t("markdown.tasks_in_embedded_notes_are_read_only"))
  })
  body.removeAttribute('aria-busy')
  embed.classList.remove('loading', 'error')
  embed.classList.add('ready')
  if (head) {
    head.textContent = target.alias || resolved.label
    head.dataset.wikilink = target.raw
    head.setAttribute('role', 'link')
    head.setAttribute('tabindex', '0')
  }
}

async function resolveWithin(
  root: HTMLElement,
  context: ResolveContext,
  depth: number,
  ancestors: Set<string>,
  scope: EmbedScope,
): Promise<void> {
  const embeds = [...root.querySelectorAll<HTMLElement>('[data-embed-target]')].filter(
    (element) => !element.closest('.note-embed-body') || element.closest('.note-embed-body') === root,
  )
  for (const embed of embeds) {
    if (context.isCurrent && !context.isCurrent()) return
    if (++context.rendered > MAX_EMBEDS || depth >= MAX_DEPTH) {
      showError(embed, t("markdown.embed_nesting_limit_reached"))
      continue
    }

    const raw = decodeDataValue(embed.dataset.embedTarget)
    const target = parseWikiTarget(raw)
    const targetScope = resolveExampleScope(embed, context, scope)

    try {
      const resolved = await resolveTarget(target, context, targetScope)
      if (!resolved) {
        showError(embed, t("markdown.embedded_note_not_found"))
        continue
      }
      if (ancestors.has(resolved.signature)) {
        showError(embed, t("markdown.embed_nesting_limit_reached"))
        continue
      }
      context.totalChars += resolved.markdown.length
      if (context.totalChars > MAX_TOTAL_CHARS) {
        showError(embed, t("markdown.embedded_content_is_too_large"))
        continue
      }

      const body = embed.querySelector<HTMLElement>('.note-embed-body')
      if (!body) continue
      const head = embed.querySelector<HTMLElement>('.note-embed-head')
      renderResolvedEmbed(embed, body, head, resolved, target)

      const nextAncestors = new Set(ancestors)
      nextAncestors.add(resolved.signature)
      await resolveWithin(body, context, depth + 1, nextAncestors, resolved.scope)
    } catch {
      showError(embed, t("markdown.could_not_load_embedded_content"))
    }
  }
}

async function resolveTargetSource(
  target: ReturnType<typeof parseWikiTarget>,
  context: ResolveContext,
  scope: EmbedScope,
): Promise<{ content: string; title: string; identity: string } | null> {
  if (!target.noteTitle || normalize(target.noteTitle) === normalize(scope.title)) {
    return {
      content: scope.content,
      title: scope.title || t("common.current_note"),
      identity: scope.identity,
    }
  }
  if (normalize(target.noteTitle) === normalize(context.rootScope.title)) {
    return {
      content: context.rootScope.content,
      title: context.rootScope.title || t("common.current_note"),
      identity: context.rootScope.identity,
    }
  }
  const summary = findNoteByTitle(target.noteTitle)
  if (!summary) return null
  const local = useNotes.getState().contents[summary.id]
  if (local !== undefined) {
    return { content: local, title: summary.title, identity: `note:${summary.id}` }
  }
  let request = context.fetchCache.get(summary.id)
  if (!request) {
    request = api.notes.get(summary.id)
    context.fetchCache.set(summary.id, request)
  }
  const content = (await request).content
  return { content, title: summary.title, identity: `note:${summary.id}` }
}

async function resolveTarget(
  target: ReturnType<typeof parseWikiTarget>,
  context: ResolveContext,
  scope: EmbedScope,
): Promise<ResolvedEmbed | null> {
  const source = await resolveTargetSource(target, context, scope)
  if (!source) return null
  const body = parseFrontMatter(source.content).body
  const resolvedScope = { content: source.content, title: source.title, identity: source.identity }
  const signature = `${source.identity}#${target.heading ?? ''}#${target.blockId ?? ''}`
  if (target.blockId) {
    const block = extractBlock(body, target.blockId)
    if (block == null) return null
    return {
      markdown: block,
      label: `${source.title} › ^${target.blockId}`,
      scope: resolvedScope,
      signature,
    }
  }
  if (target.heading) {
    const section = extractHeadingSection(body, target.heading)
    if (section == null) return null
    return {
      markdown: section,
      label: `${source.title} › ${target.heading}`,
      scope: resolvedScope,
      signature,
    }
  }
  return { markdown: body, label: source.title, scope: resolvedScope, signature }
}

function fenceMarker(line: string): string | undefined {
  return /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
}

function toggleFence(
  fence: { char: string; length: number } | null,
  marker: string,
): { char: string; length: number } | null {
  if (fence) {
    if (marker[0] === fence.char && marker.length >= fence.length) return null
    return fence
  }
  return { char: marker[0]!, length: marker.length }
}

function findHeadingLine(lines: string[], wanted: string): number {
  let fence: { char: string; length: number } | null = null
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const marker = fenceMarker(line)
    if (marker) {
      fence = toggleFence(fence, marker)
      continue
    }
    if (fence) continue
    const match = /^[ \t]{0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*(?:\{[^{}]+\})?$/.exec(line)
    if (!match || normalize(stripInlineMarkdown(match[2]!)) !== wanted) continue
    return index
  }
  return -1
}

function findSectionEnd(lines: string[], from: number, level: number): number {
  let fence: { char: string; length: number } | null = null
  for (let cursor = from; cursor < lines.length; cursor++) {
    const candidate = lines[cursor]!
    const marker = fenceMarker(candidate)
    if (marker) {
      fence = toggleFence(fence, marker)
      continue
    }
    if (fence) continue
    const next = /^[ \t]{0,3}(#{1,6})[ \t]+/.exec(candidate)
    if (next && next[1]!.length <= level) return cursor
  }
  return lines.length
}


function extractHeadingSection(markdown: string, heading: string): string | null {
  const lines = markdown.split(/\r?\n/)
  const wanted = normalize(stripInlineMarkdown(heading))
  const index = findHeadingLine(lines, wanted)
  if (index < 0) return null
  const level = /^[ \t]{0,3}(#{1,6})/.exec(lines[index]!)![1]!.length
  const end = findSectionEnd(lines, index + 1, level)
  return lines.slice(index, end).join('\n').trim()
}

function findBlockMarkerLine(lines: string[], marker: RegExp): number {
  let fence: { char: string; length: number } | null = null
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const fenceMark = fenceMarker(line)
    if (fenceMark) {
      fence = toggleFence(fence, fenceMark)
      continue
    }
    if (fence) continue
    if (marker.test(line)) return index
  }
  return -1
}


function extractBlock(markdown: string, blockId: string): string | null {
  const safeId = blockId.replace(/[^A-Za-z0-9_-]/g, '')
  if (!safeId) return null
  const marker = new RegExp(`(?:^|\\s)\\^${escapeRegExp(safeId)}[ \\t]*$`)
  const lines = markdown.split(/\r?\n/)
  const index = findBlockMarkerLine(lines, marker)
  if (index < 0) return null
  const line = lines[index]!
  const cleaned = line.replace(marker, '').trimEnd()
  if (/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/.test(line)) return cleaned.trim()
  let start = index
  while (start > 0 && lines[start - 1]!.trim() && !/^ {0,3}#{1,6}\s/.test(lines[start - 1]!)) start--
  return [...lines.slice(start, index), cleaned].join('\n').trim()
}

function showError(embed: HTMLElement, message: string): void {
  embed.classList.remove('loading', 'ready')
  embed.classList.add('error')
  const body = embed.querySelector<HTMLElement>('.note-embed-body')
  if (body) {
    body.textContent = message
    body.removeAttribute('aria-busy')
  }
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\{[^{}]+\}\s*$/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_whole, target: string, alias?: string) => alias || target)
    .replace(/[*_~`=+]/g, '')
    .trim()
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
