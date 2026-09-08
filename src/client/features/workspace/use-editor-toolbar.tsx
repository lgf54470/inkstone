import { useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { CHARTJS_TEMPLATES, COMMON_EMOJIS, MERMAID_TEMPLATES, insertAbbreviation, insertAdvancedCodeBlock, insertBlockId, insertCallout, insertDefinitionList, insertDetails, insertDiagramCode, insertEmoji, insertFootnote, insertFrontMatter, insertImage, insertNoteTemplate, insertRuby, insertRunnableJsBlock, insertTableOfContents, insertTabs, insertTag, insertTaskWithStatus, setHeading, toggleBlockReference, toggleHighlight, toggleInlineMath, toggleNoteEmbed, toggleSubscript, toggleSuperscript, toggleUnderline, toggleWikiLink } from '../../editor/commands'
import type { MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { SubmenuList } from './context-menu/submenu'

const MERMAID_MENU_WIDTH = 190
const CHART_MENU_WIDTH = 180
const TASK_MENU_WIDTH = 180

type MenuName = 'heading' | 'inline' | 'note' | 'block' | 'emoji'
type Run = (command: (target: EditorView) => boolean) => () => void

function headingMenuItems(run: Run): MenuItem[] {
  return [1, 2, 3, 4, 5, 6].map((level) => ({
    id: `h${level}`,
    label: t('workspace.heading_value0', { value0: level }),
    combo: `mod+${level}`,
    onSelect: run(setHeading(level)),
  }))
}

function inlineMenuItems(run: Run): MenuItem[] {
  return [
    { id: 'underline', label: t('common.underline'), combo: 'mod+u', onSelect: run(toggleUnderline) },
    { id: 'highlight', label: t('common.highlight'), combo: 'mod+shift+h', onSelect: run(toggleHighlight) },
    { id: 'subscript', label: t('workspace.subscript'), onSelect: run(toggleSubscript) },
    { id: 'superscript', label: t('workspace.superscript'), onSelect: run(toggleSuperscript) },
    { id: 'ruby', label: t('workspace.ruby_annotation'), onSelect: run(insertRuby) },
    { id: 'inline-math', label: t('workspace.inline_math'), onSelect: run(toggleInlineMath), separatorBefore: true },
  ]
}

function emojiMenuItems(run: Run): MenuItem[] {
  return COMMON_EMOJIS.map((item) => ({
    id: item.code,
    label: `${item.emoji}  ${item.code}`,
    onSelect: run(insertEmoji(item.emoji)),
  }))
}

function noteMenuItems(run: Run): MenuItem[] {
  return [
    { id: 'wiki-link', label: t('common.wiki_links'), onSelect: run(toggleWikiLink) },
    { id: 'note-embed', label: t('workspace.note_embed'), onSelect: run(toggleNoteEmbed) },
    { id: 'remote-image', label: t('workspace.remote_image'), onSelect: run(insertImage()) },
    { id: 'tag', label: t('workspace.insert_tag'), onSelect: run(insertTag), separatorBefore: true },
    { id: 'block-id', label: t('workspace.block_id'), onSelect: run(insertBlockId) },
    { id: 'block-reference', label: t('workspace.block_reference'), onSelect: run(toggleBlockReference) },
    { id: 'footnote', label: t('workspace.footnote'), onSelect: run(insertFootnote), separatorBefore: true },
  ]
}

function diagramMenuItems(run: Run, kind: 'mermaid' | 'chart'): MenuItem[] {
  const isMermaid = kind === 'mermaid'
  const templates = isMermaid ? MERMAID_TEMPLATES : CHARTJS_TEMPLATES
  return [
    {
      id: kind,
      label: t(isMermaid ? 'workspace.mermaid_diagram' : 'workspace.chartjs_diagram'),
      submenu: ({ closeMenu }: { closeMenu: () => void }) => (
        <SubmenuList
          closeMenu={closeMenu}
          width={isMermaid ? MERMAID_MENU_WIDTH : CHART_MENU_WIDTH}
          items={templates.map((tpl) => ({
            id: tpl.id,
            label: t(tpl.labelKey),
            onSelect: run(insertDiagramCode(kind, tpl.code)),
          }))}
        />
      ),
    },
  ]
}

function taskStatusMenuItems(run: Run): MenuItem[] {
  return [
    {
      id: 'task-extended',
      label: t('common.task_list'),
      submenu: ({ closeMenu }: { closeMenu: () => void }) => (
        <SubmenuList
          closeMenu={closeMenu}
          width={TASK_MENU_WIDTH}
          items={[
            { id: 'task-in-progress', label: t('workspace.task_in_progress'), onSelect: run(insertTaskWithStatus('/')) },
            { id: 'task-cancelled', label: t('workspace.task_cancelled'), onSelect: run(insertTaskWithStatus('-')) },
            { id: 'task-question', label: t('workspace.task_question'), onSelect: run(insertTaskWithStatus('?')) },
            { id: 'task-important', label: t('workspace.task_important'), onSelect: run(insertTaskWithStatus('!')) },
          ]}
        />
      ),
    },
  ]
}

function blockMenuItems(run: Run): MenuItem[] {
  return [
    ...diagramMenuItems(run, 'mermaid'),
    ...diagramMenuItems(run, 'chart'),
    { id: 'advanced-code', label: t('workspace.enhanced_code_block'), onSelect: run(insertAdvancedCodeBlock) },
    { id: 'js-example', label: t('workspace.runnable_js_block'), onSelect: run(insertRunnableJsBlock) },
    { id: 'callout', label: t('workspace.callout'), onSelect: run(insertCallout) },
    { id: 'details', label: t('workspace.details_block'), onSelect: run(insertDetails) },
    { id: 'tabs', label: t('common.tabs'), onSelect: run(insertTabs) },
    { id: 'toc', label: t('common.table_of_contents'), onSelect: run(insertTableOfContents) },
    { id: 'deflist', label: t('workspace.definition_list'), onSelect: run(insertDefinitionList) },
    { id: 'abbr', label: t('workspace.abbreviation'), onSelect: run(insertAbbreviation) },
    ...taskStatusMenuItems(run),
    { id: 'front-matter', label: 'Front Matter', onSelect: run(insertFrontMatter), separatorBefore: true },
    { id: 'note-template', label: t('workspace.insert_note_template'), onSelect: run(insertNoteTemplate), separatorBefore: true },
  ]
}

export function useToolbarMenus(runCommand: ((command: (target: EditorView) => boolean) => void) | undefined, view: EditorView | null | undefined) {
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null)
  const headingRef = useRef<HTMLButtonElement>(null)
  const inlineRef = useRef<HTMLButtonElement>(null)
  const noteRef = useRef<HTMLButtonElement>(null)
  const blockRef = useRef<HTMLButtonElement>(null)
  const emojiRef = useRef<HTMLButtonElement>(null)

  const toggleMenu = (menu: MenuName) => {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  const run: Run = (command) => () => {
    if (runCommand) {
      runCommand(command)
      return
    }
    if (!view) return
    command(view)
    view.focus()
  }

  return {
    headingRef, inlineRef, noteRef, blockRef, emojiRef,
    openMenu, setOpenMenu, toggleMenu,
    run,
    headingItems: headingMenuItems(run),
    inlineItems: inlineMenuItems(run),
    emojiItems: emojiMenuItems(run),
    noteItems: noteMenuItems(run),
    blockItems: blockMenuItems(run),
  }
}

export type ToolbarBundle = ReturnType<typeof useToolbarMenus> & { mobile: boolean }