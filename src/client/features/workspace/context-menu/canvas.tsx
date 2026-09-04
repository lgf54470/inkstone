import { EditorSelection } from '@codemirror/state';
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
  Link2,
  ListTodo,
  ListTree,
  Minus,
  Paperclip,
  Pencil,
  Plus,
  Quote,
  Redo2,
  Sigma,
  Smile,
  Sparkles,
  Table as TableIcon,
  Undo2,
} from 'lucide-react';
import type { MenuItem } from '../../../components/overlay';
import { t } from '../../../lib/i18n';
import { preferredScrollBehavior } from '../../../lib/motion';
import { insertAdvancedCodeBlock, insertCallout, insertCodeBlock, insertDetails, insertFrontMatter, insertHorizontalRule, insertLink, insertDiagramCode, CHARTJS_TEMPLATES, COMMON_EMOJIS, MERMAID_TEMPLATES, insertAbbreviation, insertDefinitionList, insertEmoji, insertNoteTemplate, insertRunnableJsBlock, insertTable, insertTableOfContents, insertTabs, insertTaskWithStatus, toggleInlineMath } from '../../../editor/commands';
import type { MenuCtx } from './types';
import { SubmenuList } from './submenu';

export function buildEditorBlankItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, previewContext, onPickImage, onPickFile, runStateCommand, handlePasteIntoEditor } = ctx;

  if (editorView && (!previewContext || previewContext.type === 'empty')) {
    return [
      {
        id: 'undo',
        label: t('contextmenu.undo'),
        icon: <Undo2 size={14} />,
        combo: 'mod+z',
        onSelect: () => document.execCommand('undo'),
      },
      {
        id: 'redo',
        label: t('contextmenu.redo'),
        icon: <Redo2 size={14} />,
        combo: 'mod+shift+z',
        onSelect: () => document.execCommand('redo'),
      },
      {
        id: 'paste',
        label: t('contextmenu.paste'),
        icon: <Copy size={14} className="rotate-90" />,
        combo: 'mod+v',
        onSelect: handlePasteIntoEditor,
      },
      {
        id: 'select-all',
        label: t('contextmenu.select_all'),
        icon: <CheckSquare size={14} />,
        combo: 'mod+a',
        onSelect: () => {
          editorView.dispatch({ selection: EditorSelection.range(0, editorView.state.doc.length) });
        },
      },
      {
        id: 'insert-sub',
        label: t('contextmenu.insert'),
        icon: <Plus size={14} />,
        separatorBefore: true,
        submenu: ({ closeMenu }: { closeMenu: () => void }) => (
          <SubmenuList
            closeMenu={closeMenu}
            width={200}
            items={[
              { id: 'link', label: t('workspace.link'), icon: <Link2 size={13} />, onSelect: () => runStateCommand(insertLink()) },
              { id: 'image', label: t('workspace.insert_image'), icon: <ImageIcon size={13} />, onSelect: () => onPickImage?.() },
              { id: 'file', label: t('workspace.insert_file'), icon: <Paperclip size={13} />, onSelect: () => onPickFile?.() },
              { id: 'table', label: t('workspace.table'), icon: <TableIcon size={13} />, onSelect: () => runStateCommand(insertTable) },
              { id: 'codeblock', label: t('workspace.code_block'), icon: <Braces size={13} />, onSelect: () => runStateCommand(insertCodeBlock) },
              { id: 'advanced-code', label: t('workspace.enhanced_code_block'), icon: <FileCode size={13} />, onSelect: () => runStateCommand(insertAdvancedCodeBlock) },
              { id: 'js-example', label: t('workspace.runnable_js_block'), icon: <FileCode size={13} />, onSelect: () => runStateCommand(insertRunnableJsBlock) },
              { id: 'math', label: t('workspace.math'), icon: <Sigma size={13} />, onSelect: () => runStateCommand(toggleInlineMath) },
              {
                id: 'mermaid',
                label: t('workspace.mermaid_diagram'),
                icon: <Sparkles size={13} />,
                submenu: ({ closeMenu: closeSub }: { closeMenu: () => void }) => (
                  <SubmenuList
                    closeMenu={() => {
                      closeSub();
                      closeMenu();
                    }}
                    width={190}
                    items={MERMAID_TEMPLATES.map((tpl) => ({
                      id: tpl.id,
                      label: t(tpl.labelKey),
                      onSelect: () => runStateCommand(insertDiagramCode('mermaid', tpl.code)),
                    }))}
                  />
                ),
              },
              {
                id: 'chartjs',
                label: t('workspace.chartjs_diagram'),
                icon: <BarChart2 size={13} />,
                submenu: ({ closeMenu: closeSub }: { closeMenu: () => void }) => (
                  <SubmenuList
                    closeMenu={() => {
                      closeSub();
                      closeMenu();
                    }}
                    width={180}
                    items={CHARTJS_TEMPLATES.map((tpl) => ({
                      id: tpl.id,
                      label: t(tpl.labelKey),
                      onSelect: () => runStateCommand(insertDiagramCode('chart', tpl.code)),
                    }))}
                  />
                ),
              },
              { id: 'callout', label: t('workspace.callout'), icon: <Quote size={13} />, onSelect: () => runStateCommand(insertCallout) },
              { id: 'divider', label: t('workspace.divider'), icon: <Minus size={13} />, onSelect: () => runStateCommand(insertHorizontalRule) },
              { id: 'details', label: t('workspace.details_block'), icon: <ChevronDown size={13} />, onSelect: () => runStateCommand(insertDetails) },
              { id: 'tabs', label: t('common.tabs'), icon: <Columns2 size={13} />, onSelect: () => runStateCommand(insertTabs) },
              { id: 'toc', label: t('common.table_of_contents'), icon: <ListTree size={13} />, onSelect: () => runStateCommand(insertTableOfContents) },
              { id: 'deflist', label: t('workspace.definition_list'), icon: <BookOpen size={13} />, onSelect: () => runStateCommand(insertDefinitionList) },
              { id: 'abbr', label: t('workspace.abbreviation'), icon: <HelpCircle size={13} />, onSelect: () => runStateCommand(insertAbbreviation) },
              {
                id: 'tasks-status',
                label: t('common.task_list'),
                icon: <ListTodo size={13} />,
                submenu: ({ closeMenu: closeSub }) => (
                  <SubmenuList
                    closeMenu={() => {
                      closeSub();
                      closeMenu();
                    }}
                    width={180}
                    items={[
                      { id: 'task-in-progress', label: t('workspace.task_in_progress'), onSelect: () => runStateCommand(insertTaskWithStatus('/')) },
                      { id: 'task-cancelled', label: t('workspace.task_cancelled'), onSelect: () => runStateCommand(insertTaskWithStatus('-')) },
                      { id: 'task-question', label: t('workspace.task_question'), onSelect: () => runStateCommand(insertTaskWithStatus('?')) },
                      { id: 'task-important', label: t('workspace.task_important'), onSelect: () => runStateCommand(insertTaskWithStatus('!')) },
                    ]}
                  />
                ),
              },
              {
                id: 'emoji',
                label: t('common.emoji'),
                icon: <Smile size={13} />,
                submenu: ({ closeMenu: closeSub }) => (
                  <SubmenuList
                    closeMenu={() => {
                      closeSub();
                      closeMenu();
                    }}
                    width={180}
                    items={COMMON_EMOJIS.map((item) => ({
                      id: item.code,
                      label: `${item.emoji}  ${item.code}`,
                      onSelect: () => runStateCommand(insertEmoji(item.emoji)),
                    }))}
                  />
                ),
              },
              { id: 'frontmatter', label: 'Front Matter', icon: <FileText size={13} />, onSelect: () => runStateCommand(insertFrontMatter) },
              { id: 'template', label: t('workspace.insert_note_template'), icon: <Calendar size={13} />, onSelect: () => runStateCommand(insertNoteTemplate) },
            ]}
          />
        ),
      },
    ];
  }
  return null;
}

export function buildPreviewCanvasItems(ctx: MenuCtx): MenuItem[] {
  const { content, onSwitchLayout, currentLayout, previewScrollerRef, onExport, handleCopy } = ctx;

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
    {
      id: 'copy-full-md',
      label: t('contextmenu.preview_copy_markdown'),
      icon: <Copy size={14} />,
      separatorBefore: true,
      onSelect: () => handleCopy(content),
    },
    ...(onExport
      ? [
          {
            id: 'export-sub',
            label: t('workspace.export'),
            icon: <Download size={14} />,
            submenu: ({ closeMenu }: { closeMenu: () => void }) => (
              <SubmenuList
                closeMenu={closeMenu}
                items={[
                  { id: 'export-md', label: t('workspace.export_markdown'), icon: <FileText size={13} />, onSelect: () => onExport('md') },
                  { id: 'export-html', label: t('workspace.export_html'), icon: <FileCode size={13} />, onSelect: () => onExport('html') },
                  { id: 'export-pdf', label: t('workspace.export_pdf'), icon: <FileDown size={13} />, onSelect: () => onExport('pdf') },
                ]}
              />
            ),
          },
        ]
      : []),
    {
      id: 'scroll-top',
      label: t('contextmenu.preview_scroll_top'),
      icon: <Minus size={14} className="rotate-90" />,
      separatorBefore: true,
      onSelect: () => {
        previewScrollerRef?.current?.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
      },
    },
    {
      id: 'scroll-bottom',
      label: t('contextmenu.preview_scroll_bottom'),
      icon: <Minus size={14} className="-rotate-90" />,
      onSelect: () => {
        if (previewScrollerRef?.current) {
          previewScrollerRef.current.scrollTo({
            top: previewScrollerRef.current.scrollHeight,
            behavior: preferredScrollBehavior(),
          });
        }
      },
    },
  ];
}

