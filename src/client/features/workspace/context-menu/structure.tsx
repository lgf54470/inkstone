import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import {
  CheckSquare,
  Columns2,
  Copy,
  ExternalLink,
  FileText,
  List,
  Network,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import type { MenuItem } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { findNoteByTitle } from '../../../store/notes'
import { toggleBulletList, toggleTaskDone } from '../../../editor/commands'
import type { MenuCtx } from './types'
import { SubmenuList } from './submenu'

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
      id: 'copy-link',
      label: t('contextmenu.wikilink_copy_link'),
      icon: <Copy size={14} />,
      separatorBefore: true,
      onSelect: () => handleCopy(`[[${targetTitle}]]`),
    },
    {
      id: 'copy-title',
      label: t('contextmenu.wikilink_copy_title'),
      icon: <FileText size={14} />,
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
  const { editorView, editorContext, previewContext, handleCopy } = ctx

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
      {
        id: 'copy-url',
        label: t('contextmenu.link_copy'),
        icon: <Copy size={14} />,
        onSelect: () => handleCopy(url),
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
  const { editorContext, editorView, previewContext, content, onJumpToLine, handleCopy } = ctx
  return [
    ...(editorContext ? [buildFrontmatterAddPropItem(editorView, frontmatterPropertyTemplates())] : []),
    {
      id: 'copy-yaml',
      label: t('contextmenu.frontmatter_copy_yaml'),
      icon: <Copy size={14} />,
      onSelect: () => {
        const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(content)
        if (match) handleCopy(match[1]!)
      },
    },
    ...(previewContext
      ? [
          {
            id: 'jump-frontmatter',
            label: t('contextmenu.frontmatter_jump_to_editor'),
            icon: <Pencil size={14} />,
            separatorBefore: true,
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