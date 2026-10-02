import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import {
  BarChart2,
  CheckSquare,
  FileCode,
  FileText,
  Maximize2,
  Network,
  Pencil,
  Sigma,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { MenuItem } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { formatCode } from '../../../lib/markdown/code-formatter'
import { CHARTJS_TEMPLATES, MERMAID_TEMPLATES, MINDMAP_TEMPLATES, KANBAN_TEMPLATES, EXCALIDRAW_TEMPLATES, BENTO_SLIDES_TEMPLATES } from '../../../editor/commands'
import { detectMindmapMode, loadMindmapVendor, type MindmapMode } from '../../../lib/markdown/mindmap'
import { findCodeFenceInLines, isMarkdownContainer, type EditorContextData, type PreviewContextData } from '../context-menu-detect'
import type { MenuCtx } from './types'
import { submenuFor } from '../../../components/overlay'

type CodeBlockData = NonNullable<EditorContextData['codeBlock']>
type MathData = NonNullable<EditorContextData['math']>
type PreviewCodeBlockData = NonNullable<PreviewContextData['codeBlock']>

const CODE_LANGUAGES = [
  'mermaid',
  'chart',
  'bento-slides',
  'kanban',
  'mindmap',
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'python',
  'bash',
  'powershell',
  'json',
  'yaml',
  'toml',
  'html',
  'xml',
  'css',
  'scss',
  'markdown',
  'diff',
  'dockerfile',
  'nginx',
  'sql',
  'rust',
  'go',
  'c',
  'cpp',
  'csharp',
  'java',
  'kotlin',
  'swift',
  'php',
  'ruby',
  'lua',
]

function deleteRangeFlow(editorView: EditorView, from: number, to: number) {
  editorView.dispatch({ changes: { from, to, insert: '' } })
}

function formatCodeBlockFlow(editorView: EditorView, cb: CodeBlockData) {
  const doc = editorView.state.doc
  const startLine = doc.lineAt(cb.from)
  const formatted = formatCode(cb.code, cb.language)
  if (cb.isClosed === false) {
    const insert = formatted ? `${startLine.text}\n${formatted}` : startLine.text
    editorView.dispatch({
      changes: { from: startLine.from, to: cb.to, insert },
      scrollIntoView: true,
    })
    return
  }
  const endLine = doc.lineAt(cb.to)
  const insert = formatted
    ? `${startLine.text}\n${formatted}\n${endLine.text}`
    : `${startLine.text}\n${endLine.text}`
  editorView.dispatch({
    changes: { from: startLine.from, to: endLine.to, insert },
    scrollIntoView: true,
  })
}

function changeCodeLanguageFlow(editorView: EditorView, cb: CodeBlockData, lang: string) {
  const firstLine = editorView.state.doc.lineAt(cb.from)
  const lineText = firstLine.text
  const match = /^([ \t]{0,3})(`{3,}|~{3,})([ \t]*)(.*)$/.exec(lineText)
  if (!match) {
    editorView.dispatch({ changes: { from: firstLine.from, to: firstLine.to, insert: '```' + lang } })
    return
  }

  const indent = match[1]!
  const fence = match[2]!
  const after = match[4]!

  let newInfo = ''
  const isAttrOrOption = /^(?:[A-Za-z][\w-]*=|[[{]|line-?numbers\b|linenos\b)/i.test(after)
  if (isAttrOrOption) {
    newInfo = `${lang} ${after}`
  } else {
    const tokenMatch = /^([^\s{:]*)(.*)$/.exec(after)
    newInfo = tokenMatch ? `${lang}${tokenMatch[2]!}` : lang
  }

  editorView.dispatch({
    changes: { from: firstLine.from, to: firstLine.to, insert: `${indent}${fence}${newInfo}` },
  })
}

function formatCodeInContentFlow(content: string, sourceLine: number, cb: PreviewCodeBlockData, onEditContent: (content: string) => void) {
  const lines = content.split('\n')
  const formatted = formatCode(cb.code, cb.language)
  let block = findCodeFenceInLines(lines, sourceLine)
  if (!block) return
  const targetLang = (cb.language || '').toLowerCase().trim()
  const blockLang = (block.language || '').toLowerCase().trim()
  if (targetLang && blockLang !== targetLang && isMarkdownContainer(block.language)) {
    for (let i = block.openLine + 1; i < block.closeLine; i++) {
      const inner = findCodeFenceInLines(lines, i)
      if (inner && (inner.language || '').toLowerCase().trim() === targetLang) {
        block = inner
        break
      }
    }
  }
  const replacement = formatted ? formatted.split('\n') : []
  lines.splice(block.openLine, block.closeLine - block.openLine + 1, lines[block.openLine]!, ...replacement, lines[block.closeLine]!)
  onEditContent(lines.join('\n'))
}

function applyTemplateFlow(editorView: EditorView, from: number, to: number, blockLang: string, text: string) {
  editorView.dispatch({ changes: { from, to, insert: '```' + blockLang + '\n' + text + '\n```' } })
}

async function convertMindmapInEditor(
  editorView: EditorView | null | undefined,
  from: number,
  to: number,
  code: string,
  targetMode: MindmapMode,
) {
  if (!editorView) return
  const currentMode = detectMindmapMode(code)
  if (currentMode === targetMode) return
  try {
    const vendor = await loadMindmapVendor()
    const parsed = vendor.parse(code, currentMode, 'Topic')
    if (!parsed.ok) {
      useUi.getState().toast({ title: parsed.error, tone: 'warning' })
      return
    }
    const converted = vendor.serialize(parsed.data, targetMode, parsed.extra)
    editorView.dispatch({
      changes: { from, to, insert: '```mindmap\n' + converted + '\n```' },
      scrollIntoView: true,
    })
  } catch {
    useUi.getState().toast({ title: t('preview.mindmap_render_failed'), tone: 'warning' })
  }
}

function buildTemplateItems(editorView: EditorView | null | undefined, from: number, to: number, blockLang: string, templates: { id: string; label: string; text: string }[]) {
  return templates.map((tpl) => ({
    id: tpl.id,
    label: tpl.label,
    onSelect: () => {
      if (!editorView) return
      applyTemplateFlow(editorView, from, to, blockLang, tpl.text)
    },
  }))
}

export function buildImageItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine, handleCopy } = ctx

  if (editorContext?.type === 'image' || previewContext?.type === 'image') {
    const src = previewContext?.image?.src ?? editorContext?.image?.url ?? ''
    const alt = previewContext?.image?.alt ?? editorContext?.image?.alt ?? ''
    return [
      { id: 'preview-lightbox', label: t('contextmenu.image_preview'), icon: <Maximize2 size={14} />, onSelect: () => useUi.getState().setLightbox({ src, alt }) },
      { id: 'copy-image-md', label: t('contextmenu.image_copy_markdown'), icon: <FileText size={14} />, onSelect: () => handleCopy(`![${alt}](${src})`) },
      ...(previewContext
        ? [
            { id: 'jump-image', label: t('contextmenu.image_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
      ...(editorContext?.image
        ? [
            { id: 'delete-image', label: t('contextmenu.image_delete'), icon: <Trash2 size={14} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => { if (!editorView || !editorContext.image) return; deleteRangeFlow(editorView, editorContext.image.from, editorContext.image.to) } },
          ]
        : []),
    ]
  }
  return null
}

export function buildMathItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine } = ctx

  if (editorContext?.type === 'math' || previewContext?.type === 'math') {
    return [
      ...(editorContext?.math
        ? [
            { id: 'toggle-block-math', label: t('contextmenu.math_toggle_block'), icon: <Sigma size={14} />, onSelect: () => { if (!editorView || !editorContext.math) return; toggleMathBlockFlow(editorView, editorContext.math) } },
            { id: 'delete-math', label: t('contextmenu.math_delete'), icon: <Trash2 size={14} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => { if (!editorView || !editorContext.math) return; deleteRangeFlow(editorView, editorContext.math.from, editorContext.math.to) } },
          ]
        : []),
      ...(previewContext
        ? [
            { id: 'jump-math', label: t('contextmenu.math_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ]
  }
  return null
}

function toggleMathBlockFlow(editorView: EditorView, math: MathData) {
  const { formula, isBlock, from, to } = math
  const replacement = isBlock ? `$${formula.trim()}$` : `$$\n${formula.trim()}\n$$\n`
  editorView.dispatch({ changes: { from, to, insert: replacement } })
}

export function buildCodeBlockItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, content, onEditContent, onJumpToLine } = ctx

  const codeData = editorContext?.codeBlock ?? previewContext?.codeBlock
  if (editorContext?.type === 'codeblock' || previewContext?.type === 'codeblock') {
    const code = codeData?.code ?? ''
    const lang = (codeData?.language ?? '').toLowerCase()
    const isMindmap = lang === 'mindmap' || lang === 'mind-elixir'
    const currentMode = isMindmap ? detectMindmapMode(code) : null
    const langItems = editorContext?.codeBlock
      ? CODE_LANGUAGES.map((l) => ({
          id: `lang-${l}`,
          label: l,
          checked: editorContext.codeBlock?.language.toLowerCase() === l,
          onSelect: () => {
            if (!editorView || !editorContext.codeBlock) return
            changeCodeLanguageFlow(editorView, editorContext.codeBlock, l)
          },
        }))
      : []

    return [
      ...(editorContext?.codeBlock
        ? [
            { id: 'format-code', label: t('contextmenu.code_format'), icon: <Sparkles size={14} />, onSelect: () => { if (!editorView || !editorContext.codeBlock) return; formatCodeBlockFlow(editorView, editorContext.codeBlock) } },
            ...(isMindmap
              ? [
                  {
                    id: 'code-mindmap-mode-sub',
                    label: t('contextmenu.mindmap_convert_mode'),
                    icon: <Network size={14} />,
                    submenu: submenuFor([
                      {
                        id: 'code-mode-outline',
                        label: t('contextmenu.mindmap_to_outline'),
                        checked: currentMode === 'outline',
                        onSelect: () => void convertMindmapInEditor(editorView, editorContext.codeBlock!.from, editorContext.codeBlock!.to, code, 'outline'),
                      },
                      {
                        id: 'code-mode-json',
                        label: t('contextmenu.mindmap_to_json'),
                        checked: currentMode === 'json',
                        onSelect: () => void convertMindmapInEditor(editorView, editorContext.codeBlock!.from, editorContext.codeBlock!.to, code, 'json'),
                      },
                    ]),
                  },
                ]
              : []),
            { id: 'select-code', label: t('contextmenu.code_select'), icon: <CheckSquare size={14} />, onSelect: () => { if (!editorView || !editorContext.codeBlock) return; editorView.dispatch({ selection: EditorSelection.range(editorContext.codeBlock.from, editorContext.codeBlock.to) }) } },
            {
              id: 'change-lang-sub',
              label: t('contextmenu.code_change_lang'),
              icon: <FileCode size={14} />,
              separatorBefore: true,
              subItems: langItems,
              submenu: submenuFor(langItems),
            },
            { id: 'delete-codeblock', label: t('contextmenu.code_delete'), icon: <Trash2 size={14} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => { if (!editorView || !editorContext.codeBlock) return; deleteRangeFlow(editorView, editorContext.codeBlock.from, editorContext.codeBlock.to) } },
          ]
        : []),
      ...(previewContext?.codeBlock
        ? [
            { id: 'format-code-preview', label: t('contextmenu.code_format'), icon: <Sparkles size={14} />, onSelect: () => { if (!previewContext.codeBlock) return; formatCodeInContentFlow(content, previewContext.sourceLine ?? 0, previewContext.codeBlock, onEditContent) } },
            { id: 'jump-code', label: t('contextmenu.code_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ]
  }
  return null
}

export function buildMermaidItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine } = ctx

  if (editorContext?.type === 'mermaid' || previewContext?.type === 'mermaid') {
    const templates = MERMAID_TEMPLATES.map((tpl) => ({ id: tpl.id, label: t(tpl.labelKey), text: tpl.code }))
    const tplItems = editorContext?.mermaid ? buildTemplateItems(editorView, editorContext.mermaid.from, editorContext.mermaid.to, 'mermaid', templates) : []
    return [
      ...(editorContext?.mermaid
        ? [
            { id: 'mermaid-templates-sub', label: t('contextmenu.mermaid_templates'), icon: <Sparkles size={14} />, subItems: tplItems, submenu: submenuFor(tplItems, 190) },
          ]
        : []),
      ...(previewContext
        ? [
            { id: 'jump-mermaid', label: t('contextmenu.mermaid_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ]
  }
  return null
}

/**
 * A mind map block's menu matches the diagram ones: copy the source, swap in a
 * template while the fence is being edited from the note, and jump back to it
 * from the rendered block.
 */
export function buildMindmapItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine } = ctx

  const mindmapData = editorContext?.mindmap ?? previewContext?.mindmap
  if (editorContext?.type === 'mindmap' || previewContext?.type === 'mindmap') {
    const code = mindmapData?.code ?? ''
    const currentMode = detectMindmapMode(code)
    const templates = MINDMAP_TEMPLATES.map((tpl) => ({ id: tpl.id, label: t(tpl.labelKey), text: tpl.code }))
    const tplItems = editorContext?.mindmap ? buildTemplateItems(editorView, editorContext.mindmap.from, editorContext.mindmap.to, 'mindmap', templates) : []
    return [
      ...(editorContext?.mindmap
        ? [
            {
              id: 'format-mindmap',
              label: t('contextmenu.code_format'),
              icon: <Sparkles size={14} />,
              onSelect: () => {
                if (!editorView || !editorContext.mindmap) return
                const formatted = currentMode === 'json' ? formatCode(code, 'json') : code
                editorView.dispatch({
                  changes: { from: editorContext.mindmap.from, to: editorContext.mindmap.to, insert: '```mindmap\n' + formatted + '\n```' },
                  scrollIntoView: true,
                })
              },
            },
            {
              id: 'mindmap-mode-sub',
              label: t('contextmenu.mindmap_convert_mode'),
              icon: <Network size={14} />,
              subItems: [
                {
                  id: 'mode-outline',
                  label: t('contextmenu.mindmap_to_outline'),
                  checked: currentMode === 'outline',
                  onSelect: () => void convertMindmapInEditor(editorView, editorContext.mindmap!.from, editorContext.mindmap!.to, code, 'outline'),
                },
                {
                  id: 'mode-json',
                  label: t('contextmenu.mindmap_to_json'),
                  checked: currentMode === 'json',
                  onSelect: () => void convertMindmapInEditor(editorView, editorContext.mindmap!.from, editorContext.mindmap!.to, code, 'json'),
                },
              ],
              submenu: submenuFor([
                {
                  id: 'mode-outline',
                  label: t('contextmenu.mindmap_to_outline'),
                  checked: currentMode === 'outline',
                  onSelect: () => void convertMindmapInEditor(editorView, editorContext.mindmap!.from, editorContext.mindmap!.to, code, 'outline'),
                },
                {
                  id: 'mode-json',
                  label: t('contextmenu.mindmap_to_json'),
                  checked: currentMode === 'json',
                  onSelect: () => void convertMindmapInEditor(editorView, editorContext.mindmap!.from, editorContext.mindmap!.to, code, 'json'),
                },
              ]),
            },
            { id: 'mindmap-templates-sub', label: t('contextmenu.mindmap_templates'), icon: <Sparkles size={14} />, separatorBefore: true, subItems: tplItems, submenu: submenuFor(tplItems, 190) },
            { id: 'delete-mindmap', label: t('contextmenu.code_delete'), icon: <Trash2 size={14} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => { if (!editorView || !editorContext.mindmap) return; deleteRangeFlow(editorView, editorContext.mindmap.from, editorContext.mindmap.to) } },
          ]
        : []),
      ...(previewContext
        ? [
            { id: 'jump-mindmap', label: t('contextmenu.preview_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ]
  }
  return null
}

export function buildKanbanItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine } = ctx

  if (editorContext?.type === 'kanban' || previewContext?.type === 'kanban') {
    const templates = KANBAN_TEMPLATES.map((tpl) => ({ id: tpl.id, label: t(tpl.labelKey), text: tpl.code }))
    const tplItems = editorContext?.kanban ? buildTemplateItems(editorView, editorContext.kanban.from, editorContext.kanban.to, 'kanban', templates) : []
    return [
      ...(editorContext?.kanban
        ? [
            { id: 'kanban-templates-sub', label: t('contextmenu.kanban_templates'), icon: <Sparkles size={14} />, separatorBefore: true, subItems: tplItems, submenu: submenuFor(tplItems, 190) },
          ]
        : []),
      ...(previewContext
        ? [
            { id: 'jump-kanban', label: t('contextmenu.mermaid_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ]
  }
  return null
}

export function buildSlidesItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine } = ctx

  if (editorContext?.type === 'slides' || previewContext?.type === 'slides') {
    const templates = BENTO_SLIDES_TEMPLATES.map((tpl) => ({ id: tpl.id, label: t(tpl.labelKey), text: tpl.code }))
    const tplItems = editorContext?.slides ? buildTemplateItems(editorView, editorContext.slides.from, editorContext.slides.to, 'bento-slides', templates) : []
    return [
      ...(editorContext?.slides
        ? [
            { id: 'slides-templates-sub', label: t('contextmenu.slides_templates'), icon: <Sparkles size={14} />, separatorBefore: true, subItems: tplItems, submenu: submenuFor(tplItems, 190) },
          ]
        : []),
      ...(previewContext
        ? [
            { id: 'jump-slides', label: t('contextmenu.mermaid_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ]
  }
  return null
}

/**
 * A whiteboard block's menu is the one every other block gets: the note owns the
 * right-click, so the source is what can be copied here and a template is what can be
 * swapped in while the fence is being edited — the library's own canvas menu belongs to
 * the full screen view, where the board is the surface being worked on.
 */
export function buildExcalidrawItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine } = ctx

  if (editorContext?.type === 'excalidraw' || previewContext?.type === 'excalidraw') {
    const templates = EXCALIDRAW_TEMPLATES.map((tpl) => ({ id: tpl.id, label: t(tpl.labelKey), text: tpl.code }))
    const tplItems = editorContext?.excalidraw ? buildTemplateItems(editorView, editorContext.excalidraw.from, editorContext.excalidraw.to, 'excalidraw', templates) : []
    return [
      ...(editorContext?.excalidraw
        ? [
            { id: 'excalidraw-templates-sub', label: t('contextmenu.excalidraw_templates'), icon: <Sparkles size={14} />, separatorBefore: true, subItems: tplItems, submenu: submenuFor(tplItems, 190) },
          ]
        : []),
      ...(previewContext
        ? [
            { id: 'jump-excalidraw', label: t('contextmenu.excalidraw_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ]
  }
  return null
}

export function buildChartItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine } = ctx

  if (editorContext?.type === 'chart' || previewContext?.type === 'chart') {
    const templates = CHARTJS_TEMPLATES.map((tpl) => ({ id: tpl.id, label: t(tpl.labelKey), text: tpl.code }))
    const tplItems = editorContext?.chart ? buildTemplateItems(editorView, editorContext.chart.from, editorContext.chart.to, 'chart', templates) : []
    return [
      ...(editorContext?.chart
        ? [
            { id: 'chart-templates-sub', label: t('contextmenu.chart_templates'), icon: <BarChart2 size={14} />, separatorBefore: true, subItems: tplItems, submenu: submenuFor(tplItems, 190) },
          ]
        : []),
      ...(previewContext
        ? [
            { id: 'jump-chart', label: t('contextmenu.chart_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ]
  }
  return null
}