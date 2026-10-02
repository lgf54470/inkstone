import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import {
  CheckSquare,
  Columns2,
  ExternalLink,
  FileText,
  Heading,
  List,
  Network,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import type { MenuItem } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { findNoteByTitle } from '../../../store/notes'
import { setHeading, clearHeading, toggleBulletList, toggleTaskDone } from '../../../editor/commands'
import type { MenuCtx } from './types'
import { SubmenuList, submenuFor } from '../../../components/overlay'

function buildWikiLinkMenu(ctx: MenuCtx, targetTitle: string): MenuItem[] {
  const { previewContext, onJumpToLine, createNote, openNote, setWorkspaceNote, handleCopy } = ctx
  return [
    {
      id: 'open-note',
      label: t('contextmenu.wikilink_open'),
      icon: <Network size={14} />,
      onSelect: () => {
        if (!targetTitle) return
        const targetNote = findNoteByTitle(targetTitle)
        if (targetNote) void openNote(targetNote.id)
        else void createNote({ title: targetTitle, open: true })
      },
    },
    {
      id: 'open-secondary',
      label: t('contextmenu.wikilink_open_secondary'),
      icon: <Columns2 size={14} />,
      onSelect: () => {
        if (!targetTitle) return
        const targetNote = findNoteByTitle(targetTitle)
        if (targetNote) setWorkspaceNote('secondary', targetNote.id, true)
      },
    },
    {
      id: 'copy-title',
      label: t('contextmenu.wikilink_copy_title'),
      icon: <FileText size={14} />,
      separatorBefore: true,
      onSelect: () => handleCopy(targetTitle),
    },
    ...(previewContext
      ? [
          {
            id: 'jump-wikilink',
            label: t('contextmenu.wikilink_jump_to_editor'),
            icon: <Pencil size={14} />,
            separatorBefore: true,
            onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
          },
        ]
      : []),
  ]
}

export function buildWikiLinkItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorContext, previewContext } = ctx
  if (editorContext?.type === 'wikilink' || previewContext?.type === 'wikilink') {
    const targetTitle = editorContext?.wikiLink?.target ?? previewContext?.wikiLink?.noteTitle ?? ''
    return buildWikiLinkMenu(ctx, targetTitle)
  }
  return null
}

export function buildLinkItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext } = ctx

  if (editorContext?.type === 'link' || previewContext?.type === 'link') {
    const url = editorContext?.link?.url ?? previewContext?.link?.url ?? ''
    return [
      {
        id: 'open-link',
        label: t('contextmenu.link_open'),
        icon: <ExternalLink size={14} />,
        onSelect: () => {
          if (url) window.open(url, '_blank', 'noopener,noreferrer')
        },
      },
      ...(editorContext?.link
        ? [
            {
              id: 'delete-link',
              label: t('contextmenu.link_delete'),
              icon: <Trash2 size={14} />,
              tone: 'danger' as const,
              separatorBefore: true,
              onSelect: () => {
                if (!editorView || !editorContext.link) return
                editorView.dispatch({
                  changes: { from: editorContext.link.from, to: editorContext.link.to, insert: editorContext.link.text },
                })
              },
            },
          ]
        : []),
    ]
  }
  return null
}

function frontmatterPropertyTemplates() {
  return [
    { id: 'tags', label: 'tags: []', text: 'tags: []\n' },
    { id: 'aliases', label: 'aliases: []', text: 'aliases: []\n' },
    { id: 'status', label: 'status: draft', text: 'status: draft\n' },
    { id: 'created', label: 'createdAt: ' + new Date().toISOString().slice(0, 10), text: 'createdAt: ' + new Date().toISOString().slice(0, 10) + '\n' },
  ]
}

function frontmatterAddPropSubmenu(closeMenu: () => void, editorView: EditorView | null | undefined, propertyTemplates: Array<{ id: string; label: string; text: string }>) {
  return (
    <SubmenuList
      closeMenu={closeMenu}
      items={propertyTemplates.map((prop) => ({
        id: prop.id,
        label: prop.label,
        onSelect: () => {
          if (!editorView) return
          const line = editorView.state.doc.line(2)
          editorView.dispatch({
            changes: { from: line.from, insert: prop.text },
            selection: EditorSelection.cursor(line.from + prop.text.length),
          })
        },
      }))}
    />
  )
}

function buildFrontmatterAddPropItem(editorView: EditorView | null | undefined, propertyTemplates: Array<{ id: string; label: string; text: string }>): MenuItem {
  return {
    id: 'add-prop-sub',
    label: t('contextmenu.frontmatter_add_prop'),
    icon: <Plus size={14} />,
    submenu: ({ closeMenu }: { closeMenu: () => void }) => frontmatterAddPropSubmenu(closeMenu, editorView, propertyTemplates),
  }
}

function buildFrontmatterMenu(ctx: MenuCtx): MenuItem[] {
  const { editorContext, editorView, previewContext, onJumpToLine } = ctx
  return [
    ...(editorContext ? [buildFrontmatterAddPropItem(editorView, frontmatterPropertyTemplates())] : []),
    ...(previewContext
      ? [
          {
            id: 'jump-frontmatter',
            label: t('contextmenu.frontmatter_jump_to_editor'),
            icon: <Pencil size={14} />,
            separatorBefore: Boolean(editorContext),
            onSelect: () => onJumpToLine(0),
          },
        ]
      : []),
  ]
}

export function buildFrontmatterItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorContext, previewContext } = ctx
  if (editorContext?.type === 'frontmatter' || previewContext?.type === 'frontmatter') {
    return buildFrontmatterMenu(ctx)
  }
  return null
}

function deleteTaskLine(editorView: EditorView | null | undefined, lineNumber: number) {
  if (!editorView) return
  const line = editorView.state.doc.line(lineNumber)
  const to = Math.min(editorView.state.doc.length, line.to + 1)
  editorView.dispatch({ changes: { from: line.from, to, insert: '' } })
}

function buildTaskMenu(ctx: MenuCtx): MenuItem[] {
  const { editorView, editorContext, previewContext, onJumpToLine, runStateCommand } = ctx
  return [
    {
      id: 'toggle-task',
      label: t('contextmenu.task_toggle'),
      icon: <CheckSquare size={14} />,
      onSelect: () => {
        if (editorView) {
          runStateCommand(toggleTaskDone)
        } else if (previewContext?.task) {
          const checkbox = previewContext.target.closest<HTMLInputElement>('input[type="checkbox"]')
          if (checkbox) checkbox.click()
        }
      },
    },
    ...(editorContext
      ? [
          {
            id: 'convert-bullet',
            label: t('contextmenu.task_convert_bullet'),
            icon: <List size={14} />,
            onSelect: () => runStateCommand(toggleBulletList),
          },
          {
            id: 'delete-task',
            label: t('contextmenu.task_delete'),
            icon: <Trash2 size={14} />,
            tone: 'danger' as const,
            separatorBefore: true,
            onSelect: () => deleteTaskLine(editorView, editorContext.lineNumber),
          },
        ]
      : []),
    ...(previewContext
      ? [
          {
            id: 'jump-task',
            label: t('contextmenu.task_jump_to_editor'),
            icon: <Pencil size={14} />,
            separatorBefore: true,
            onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
          },
        ]
      : []),
  ]
}

export function buildTaskItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorContext, previewContext } = ctx
  if (editorContext?.type === 'task' || previewContext?.type === 'task') {
    return buildTaskMenu(ctx)
  }
  return null
}

export function buildHeadingItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, runStateCommand, onJumpToLine } = ctx
  const headingData = editorContext?.heading ?? previewContext?.heading
  if (editorContext?.type === 'heading' || previewContext?.type === 'heading') {
    const level = headingData?.level ?? 1
    const convertHeadingItems = [
      ...([1, 2, 3, 4, 5, 6] as const).map((lvl) => ({
        id: `convert-h${lvl}`,
        label: t('workspace.heading_value0', { value0: lvl }),
        combo: `mod+${lvl}`,
        checked: level === lvl,
        onSelect: () => {
          if (editorView) {
            runStateCommand(setHeading(lvl))
          } else if (previewContext?.heading?.sourceLine !== undefined) {
            onJumpToLine(previewContext.heading.sourceLine)
          }
        },
      })),
      {
        id: 'convert-p',
        label: t('contextmenu.heading_paragraph'),
        checked: false,
        separatorBefore: true,
        onSelect: () => {
          if (editorView) {
            runStateCommand(clearHeading)
          } else if (previewContext?.heading?.sourceLine !== undefined) {
            onJumpToLine(previewContext.heading.sourceLine)
          }
        },
      },
    ]

    return [
      {
        id: 'heading-convert-sub',
        label: t('contextmenu.heading_level'),
        icon: <Heading size={14} />,
        subItems: convertHeadingItems,
        submenu: submenuFor(convertHeadingItems),
      },
      ...(previewContext?.heading?.sourceLine !== undefined
        ? [
            {
              id: 'jump-heading',
              label: t('contextmenu.preview_jump_to_editor'),
              icon: <Pencil size={14} />,
              separatorBefore: true,
              onSelect: () => onJumpToLine(previewContext.heading!.sourceLine!),
            },
          ]
        : []),
    ]
  }
  return null
}