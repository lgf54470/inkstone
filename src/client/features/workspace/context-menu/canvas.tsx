import { EditorSelection } from '@codemirror/state'
import {
  BarChart2,
  BookOpen,
  Braces,
  Calendar,
  CheckSquare,
  ChevronDown,
  Columns2,
  Copy,
  HelpCircle,
  Download,
  FileCode,
  FileDown,
  FileText,
  Image as ImageIcon,
  Kanban,
  Link2,
  LineChart,
  ListTodo,
  ListTree,
  Minus,
  Paperclip,
  PenTool,
  Pencil,
  Plus,
  Presentation,
  Quote,
  Sigma,
  Smile,
  AlignCenter,
  Columns3,
  GitCommitVertical,
  Sparkles,
  Table as TableIcon,
} from 'lucide-react'
import type { MenuItem } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { preferredScrollBehavior } from '../../../lib/motion'
import { insertAdvancedCodeBlock, insertAlign, insertCallout, insertCodeBlock, insertColumns, insertDetails, insertFrontMatter, insertHorizontalRule, insertLink, insertDiagramCode, CHARTJS_TEMPLATES, ECHARTS_TEMPLATES, COMMON_EMOJIS, MERMAID_TEMPLATES, MINDMAP_TEMPLATES, KANBAN_TEMPLATES, EXCALIDRAW_TEMPLATES, BENTO_SLIDES_TEMPLATES, insertAbbreviation, insertDefinitionList, insertEmoji, insertNoteTemplate, insertRunnableJsBlock, insertTable, insertTableOfContents, insertTabs, insertTimeline, insertTaskWithStatus, toggleInlineMath } from '../../../editor/commands'
import type { MenuCtx } from './types'
import { SubmenuList } from '../../../components/overlay'

const MERMAID_MENU_WIDTH = 190
const CHART_MENU_WIDTH = 180
const MINDMAP_MENU_WIDTH = 180
const KANBAN_MENU_WIDTH = 180
const EXCALIDRAW_MENU_WIDTH = 180
const SLIDES_MENU_WIDTH = 180
const TASK_MENU_WIDTH = 180
const EMOJI_MENU_WIDTH = 180
const INSERT_MENU_WIDTH = 200

const DIAGRAM_MENUS = {
  mermaid: { labelKey: 'workspace.mermaid_diagram', templates: MERMAID_TEMPLATES, width: MERMAID_MENU_WIDTH, icon: <Sparkles size={13} /> },
  chart: { labelKey: 'workspace.chartjs_diagram', templates: CHARTJS_TEMPLATES, width: CHART_MENU_WIDTH, icon: <BarChart2 size={13} /> },
  echarts: { labelKey: 'workspace.echarts_chart', templates: ECHARTS_TEMPLATES, width: CHART_MENU_WIDTH, icon: <LineChart size={13} /> },
  mindmap: { labelKey: 'workspace.mind_map', templates: MINDMAP_TEMPLATES, width: MINDMAP_MENU_WIDTH, icon: <ListTree size={13} /> },
  kanban: { labelKey: 'workspace.kanban', templates: KANBAN_TEMPLATES, width: KANBAN_MENU_WIDTH, icon: <Kanban size={13} /> },
  excalidraw: { labelKey: 'workspace.whiteboard', templates: EXCALIDRAW_TEMPLATES, width: EXCALIDRAW_MENU_WIDTH, icon: <PenTool size={13} /> },
  slides: { labelKey: 'workspace.slides', templates: BENTO_SLIDES_TEMPLATES, width: SLIDES_MENU_WIDTH, icon: <Presentation size={13} /> },
} as const

type DiagramKind = keyof typeof DIAGRAM_MENUS

function basicInsertItems(ctx: MenuCtx): MenuItem[] {
  const { onPickImage, onPickFile, runStateCommand } = ctx
  return [
    { id: 'link', label: t('workspace.link'), icon: <Link2 size={13} />, onSelect: () => runStateCommand(insertLink()) },
    { id: 'image', label: t('workspace.insert_image'), icon: <ImageIcon size={13} />, onSelect: () => onPickImage?.() },
    { id: 'file', label: t('workspace.insert_file'), icon: <Paperclip size={13} />, onSelect: () => onPickFile?.() },
    { id: 'table', label: t('workspace.table'), icon: <TableIcon size={13} />, onSelect: () => runStateCommand(insertTable) },
    { id: 'codeblock', label: t('workspace.code_block'), icon: <Braces size={13} />, onSelect: () => runStateCommand(insertCodeBlock) },
    { id: 'advanced-code', label: t('workspace.enhanced_code_block'), icon: <FileCode size={13} />, onSelect: () => runStateCommand(insertAdvancedCodeBlock) },
    { id: 'js-example', label: t('workspace.runnable_js_block'), icon: <FileCode size={13} />, onSelect: () => runStateCommand(insertRunnableJsBlock) },
    { id: 'math', label: t('workspace.math'), icon: <Sigma size={13} />, onSelect: () => runStateCommand(toggleInlineMath) },
  ]
}

function diagramInsertItems(ctx: MenuCtx, kind: DiagramKind, closeParent: () => void): MenuItem[] {
  const { labelKey, templates, width, icon } = DIAGRAM_MENUS[kind]
  const { runStateCommand } = ctx
  const fenceLang = kind === 'slides' ? 'bento-slides' : kind
  return [
    {
      id: kind,
      label: t(labelKey),
      icon,
      submenu: ({ closeMenu: closeSub }: { closeMenu: () => void }) => (
        <SubmenuList
          closeMenu={() => {
            closeSub()
            closeParent()
          }}
          width={width}
          items={templates.map((tpl) => ({
            id: tpl.id,
            label: t(tpl.labelKey),
            onSelect: () => runStateCommand(insertDiagramCode(fenceLang, tpl.code)),
          }))}
        />
      ),
    },
  ]
}

function tailInsertItems(ctx: MenuCtx): MenuItem[] {
  const { runStateCommand } = ctx
  return [
    { id: 'callout', label: t('workspace.callout'), icon: <Quote size={13} />, onSelect: () => runStateCommand(insertCallout) },
    { id: 'divider', label: t('workspace.divider'), icon: <Minus size={13} />, onSelect: () => runStateCommand(insertHorizontalRule) },
    { id: 'details', label: t('workspace.details_block'), icon: <ChevronDown size={13} />, onSelect: () => runStateCommand(insertDetails) },
    { id: 'tabs', label: t('common.tabs'), icon: <Columns2 size={13} />, onSelect: () => runStateCommand(insertTabs) },
    { id: 'columns', label: t('workspace.columns'), icon: <Columns3 size={13} />, onSelect: () => runStateCommand(insertColumns) },
    { id: 'timeline', label: t('workspace.timeline'), icon: <GitCommitVertical size={13} />, onSelect: () => runStateCommand(insertTimeline) },
    { id: 'alignment', label: t('workspace.alignment'), icon: <AlignCenter size={13} />, onSelect: () => runStateCommand(insertAlign('center')) },
    { id: 'toc', label: t('common.table_of_contents'), icon: <ListTree size={13} />, onSelect: () => runStateCommand(insertTableOfContents) },
    { id: 'deflist', label: t('workspace.definition_list'), icon: <BookOpen size={13} />, onSelect: () => runStateCommand(insertDefinitionList) },
    { id: 'abbr', label: t('workspace.abbreviation'), icon: <HelpCircle size={13} />, onSelect: () => runStateCommand(insertAbbreviation) },
    { id: 'frontmatter', label: 'Front Matter', icon: <FileText size={13} />, onSelect: () => runStateCommand(insertFrontMatter) },
    { id: 'template', label: t('workspace.insert_note_template'), icon: <Calendar size={13} />, onSelect: () => runStateCommand(insertNoteTemplate) },
  ]
}

function taskStatusInsertItems(ctx: MenuCtx, closeParent: () => void): MenuItem[] {
  const { runStateCommand } = ctx
  return [
    {
      id: 'tasks-status',
      label: t('common.task_list'),
      icon: <ListTodo size={13} />,
      submenu: ({ closeMenu: closeSub }: { closeMenu: () => void }) => (
        <SubmenuList
          closeMenu={() => {
            closeSub()
            closeParent()
          }}
          width={TASK_MENU_WIDTH}
          items={[
            { id: 'task-in-progress', label: t('workspace.task_in_progress'), onSelect: () => runStateCommand(insertTaskWithStatus('/')) },
            { id: 'task-cancelled', label: t('workspace.task_cancelled'), onSelect: () => runStateCommand(insertTaskWithStatus('-')) },
            { id: 'task-question', label: t('workspace.task_question'), onSelect: () => runStateCommand(insertTaskWithStatus('?')) },
            { id: 'task-important', label: t('workspace.task_important'), onSelect: () => runStateCommand(insertTaskWithStatus('!')) },
          ]}
        />
      ),
    },
  ]
}

function emojiInsertItems(ctx: MenuCtx, closeParent: () => void): MenuItem[] {
  const { runStateCommand } = ctx
  return [
    {
      id: 'emoji',
      label: t('common.emoji'),
      icon: <Smile size={13} />,
      submenu: ({ closeMenu: closeSub }: { closeMenu: () => void }) => (
        <SubmenuList
          closeMenu={() => {
            closeSub()
            closeParent()
          }}
          width={EMOJI_MENU_WIDTH}
          items={COMMON_EMOJIS.map((item) => ({
            id: item.code,
            label: `${item.emoji}  ${item.code}`,
            onSelect: () => runStateCommand(insertEmoji(item.emoji)),
          }))}
        />
      ),
    },
  ]
}

function collectInsertSubItems(ctx: MenuCtx): MenuItem[] {
  const diagramItems: MenuItem[] = (['mermaid', 'chart', 'mindmap', 'kanban', 'excalidraw', 'slides'] as const).map((kind) => {
    const { labelKey, templates, icon } = DIAGRAM_MENUS[kind]
    const fenceLang = kind === 'slides' ? 'bento-slides' : kind
    return {
      id: `diagram-${kind}`,
      label: t(labelKey),
      icon,
      onSelect: () => ctx.runStateCommand(insertDiagramCode(fenceLang, templates[0]?.code ?? '')),
    }
  })

  const taskItems: MenuItem[] = [
    { id: 'task-in-progress', label: t('workspace.task_in_progress'), onSelect: () => ctx.runStateCommand(insertTaskWithStatus('/')) },
    { id: 'task-cancelled', label: t('workspace.task_cancelled'), onSelect: () => ctx.runStateCommand(insertTaskWithStatus('-')) },
    { id: 'task-question', label: t('workspace.task_question'), onSelect: () => ctx.runStateCommand(insertTaskWithStatus('?')) },
    { id: 'task-important', label: t('workspace.task_important'), onSelect: () => ctx.runStateCommand(insertTaskWithStatus('!')) },
  ]

  return [
    ...basicInsertItems(ctx),
    ...diagramItems,
    ...tailInsertItems(ctx),
    ...taskItems,
  ]
}

function buildInsertItem(ctx: MenuCtx): MenuItem {
  return {
    id: 'insert-sub',
    label: t('contextmenu.insert'),
    icon: <Plus size={14} />,
    separatorBefore: true,
    subItems: collectInsertSubItems(ctx),
    submenu: ({ closeMenu }: { closeMenu: () => void }) => (
      <SubmenuList
        closeMenu={closeMenu}
        width={INSERT_MENU_WIDTH}
        items={[
          ...basicInsertItems(ctx),
          ...diagramInsertItems(ctx, 'mermaid', closeMenu),
          ...diagramInsertItems(ctx, 'chart', closeMenu),
          ...diagramInsertItems(ctx, 'echarts', closeMenu),
          ...diagramInsertItems(ctx, 'mindmap', closeMenu),
          ...diagramInsertItems(ctx, 'kanban', closeMenu),
          ...diagramInsertItems(ctx, 'excalidraw', closeMenu),
          ...diagramInsertItems(ctx, 'slides', closeMenu),
          ...tailInsertItems(ctx),
          ...taskStatusInsertItems(ctx, closeMenu),
          ...emojiInsertItems(ctx, closeMenu),
        ]}
      />
    ),
  }
}

function buildPresentationItem(ctx: MenuCtx): MenuItem | null {
  if (!ctx.onPresent) return null
  return { id: 'presentation', label: t('workspace.presentation_mode'), icon: <Presentation size={14} />, onSelect: ctx.onPresent }
}

export function buildCommonEditorItems(
  ctx: MenuCtx,
  hasPrivateItems: boolean,
): MenuItem[] {
  const { editorView } = ctx
  const presentationItem = buildPresentationItem(ctx)

  const items: MenuItem[] = [
    {
      id: 'select-all',
      label: t('contextmenu.select_all'),
      icon: <CheckSquare size={14} />,
      combo: 'mod+a',
      separatorBefore: hasPrivateItems,
      onSelect: () => {
        if (!editorView) return
        editorView.dispatch({ selection: EditorSelection.range(0, editorView.state.doc.length) })
      },
    },
  ]

  if (presentationItem) {
    items.push(presentationItem)
  }

  items.push(buildInsertItem(ctx))

  return items
}

export function buildEditorBlankItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, previewContext } = ctx

  if (editorView && !previewContext) {
    return buildCommonEditorItems(ctx, false)
  }
  return null
}

function buildExportItem(ctx: MenuCtx): MenuItem | null {
  const { onExport } = ctx
  if (!onExport) return null
  const exportItems: MenuItem[] = [
    { id: 'export-md', label: t('workspace.export_markdown'), icon: <FileText size={13} />, onSelect: () => onExport('md') },
    { id: 'export-html', label: t('workspace.export_html'), icon: <FileCode size={13} />, onSelect: () => onExport('html') },
    { id: 'export-pdf', label: t('workspace.export_pdf'), icon: <FileDown size={13} />, onSelect: () => onExport('pdf') },
  ]
  return {
    id: 'export-sub',
    label: t('workspace.export'),
    icon: <Download size={14} />,
    subItems: exportItems,
    submenu: ({ closeMenu }: { closeMenu: () => void }) => (
      <SubmenuList
        closeMenu={closeMenu}
        items={exportItems}
      />
    ),
  }
}

function buildLayoutSwitchItems(ctx: MenuCtx): MenuItem[] {
  const { onSwitchLayout, currentLayout } = ctx
  return [
    {
      id: 'switch-edit',
      label: currentLayout === 'edit' ? t('contextmenu.preview_switch_split') : t('contextmenu.preview_switch_edit'),
      icon: <Pencil size={14} />,
      onSelect: () => onSwitchLayout?.(currentLayout === 'edit' ? 'split' : 'edit'),
    },
    {
      id: 'switch-split',
      label: t('contextmenu.preview_switch_split'),
      icon: <Columns2 size={14} />,
      checked: currentLayout === 'split',
      onSelect: () => onSwitchLayout?.('split'),
    },
  ]
}

export function buildPreviewCanvasItems(ctx: MenuCtx): MenuItem[] {
  const { content, previewScrollerRef, handleCopy } = ctx
  const exportItem = buildExportItem(ctx)
  const presentationItem = buildPresentationItem(ctx)

  return [
    ...buildLayoutSwitchItems(ctx),
    ...(presentationItem ? [presentationItem] : []),
    {
      id: 'copy-full-md',
      label: t('contextmenu.preview_copy_markdown'),
      icon: <Copy size={14} />,
      separatorBefore: true,
      onSelect: () => handleCopy(content),
    },
    ...(exportItem ? [exportItem] : []),
    {
      id: 'scroll-top',
      label: t('contextmenu.preview_scroll_top'),
      icon: <Minus size={14} className='rotate-90' />,
      separatorBefore: true,
      onSelect: () => {
        previewScrollerRef?.current?.scrollTo({ top: 0, behavior: preferredScrollBehavior() })
      },
    },
    {
      id: 'scroll-bottom',
      label: t('contextmenu.preview_scroll_bottom'),
      icon: <Minus size={14} className='-rotate-90' />,
      onSelect: () => {
        if (previewScrollerRef?.current) {
          previewScrollerRef.current.scrollTo({
            top: previewScrollerRef.current.scrollHeight,
            behavior: preferredScrollBehavior(),
          })
        }
      },
    },
  ]
}