import {
  Bold,
  Braces,
  Copy,
  FileCode,
  Heading,
  Highlighter,
  Italic,
  Languages,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Network,
  Pencil,
  Plus,
  Quote,
  Scissors,
  Sigma,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from 'lucide-react';
import type { MenuItem } from '../../../components/overlay';
import { t } from '../../../lib/i18n';
import { insertCallout, insertCodeBlock, insertLink, insertRuby, setHeading, toggleBold, toggleBulletList, toggleHighlight, toggleInlineCode, toggleInlineMath, toggleItalic, toggleOrderedList, toggleQuote, toggleStrikethrough, toggleUnderline, toggleSubscript, toggleSuperscript, toggleTaskList, toggleWikiLink } from '../../../editor/commands';
import type { MenuCtx } from './types';
import { SubmenuList } from './submenu';

export function buildEditorSelectionItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorContext, runStateCommand, handleCopy, handlePasteIntoEditor, handleCutFromEditor } = ctx;

  if (editorContext && editorContext.type === 'selection' && editorContext.selectedText) {
    const selected = editorContext.selectedText;
    return [
      {
        id: 'cut',
        label: t('contextmenu.cut'),
        icon: <Scissors size={14} />,
        combo: 'mod+x',
        onSelect: handleCutFromEditor,
      },
      {
        id: 'copy',
        label: t('contextmenu.copy'),
        icon: <Copy size={14} />,
        combo: 'mod+c',
        onSelect: () => handleCopy(selected),
      },
      {
        id: 'paste',
        label: t('contextmenu.paste'),
        icon: <Copy size={14} className="rotate-90" />,
        combo: 'mod+v',
        onSelect: handlePasteIntoEditor,
      },
      {
        id: 'format-sub',
        label: t('contextmenu.format'),
        icon: <Highlighter size={14} />,
        separatorBefore: true,
        submenu: ({ closeMenu }: { closeMenu: () => void }) => (
          <SubmenuList
            closeMenu={closeMenu}
            items={[
              { id: 'bold', label: t('common.bold'), icon: <Bold size={13} />, combo: 'mod+b', onSelect: () => runStateCommand(toggleBold) },
              { id: 'italic', label: t('common.italic'), icon: <Italic size={13} />, combo: 'mod+i', onSelect: () => runStateCommand(toggleItalic) },
              { id: 'strikethrough', label: t('common.strikethrough'), icon: <Strikethrough size={13} />, combo: 'mod+shift+x', onSelect: () => runStateCommand(toggleStrikethrough) },
              { id: 'underline', label: t('common.underline'), icon: <Underline size={13} />, combo: 'mod+u', onSelect: () => runStateCommand(toggleUnderline) },
              { id: 'highlight', label: t('common.highlight'), icon: <Highlighter size={13} />, combo: 'mod+shift+h', onSelect: () => runStateCommand(toggleHighlight) },
              { id: 'subscript', label: t('workspace.subscript'), icon: <Subscript size={13} />, onSelect: () => runStateCommand(toggleSubscript) },
              { id: 'superscript', label: t('workspace.superscript'), icon: <Superscript size={13} />, onSelect: () => runStateCommand(toggleSuperscript) },
              { id: 'ruby', label: t('workspace.ruby_annotation'), icon: <Languages size={13} />, onSelect: () => runStateCommand(insertRuby) },
              { id: 'code', label: t('common.inline_code'), icon: <FileCode size={13} />, combo: 'mod+e', onSelect: () => runStateCommand(toggleInlineCode) },
              { id: 'math', label: t('workspace.inline_math'), icon: <Sigma size={13} />, onSelect: () => runStateCommand(toggleInlineMath) },
            ]}
          />
        ),
      },
      {
        id: 'headings-sub',
        label: t('contextmenu.headings'),
        icon: <Heading size={14} />,
        submenu: ({ closeMenu }: { closeMenu: () => void }) => (
          <SubmenuList
            closeMenu={closeMenu}
            items={[1, 2, 3, 4, 5, 6].map((lvl) => ({
              id: `h${lvl}`,
              label: t('workspace.heading_value0', { value0: lvl }),
              combo: `mod+${lvl}`,
              onSelect: () => runStateCommand(setHeading(lvl)),
            }))}
          />
        ),
      },
      {
        id: 'lists-sub',
        label: t('contextmenu.lists_quotes'),
        icon: <List size={14} />,
        submenu: ({ closeMenu }: { closeMenu: () => void }) => (
          <SubmenuList
            closeMenu={closeMenu}
            items={[
              { id: 'bullet', label: t('common.unordered_list'), icon: <List size={13} />, combo: 'mod+shift+8', onSelect: () => runStateCommand(toggleBulletList) },
              { id: 'ordered', label: t('common.ordered_list'), icon: <ListOrdered size={13} />, combo: 'mod+shift+7', onSelect: () => runStateCommand(toggleOrderedList) },
              { id: 'task', label: t('common.task_list'), icon: <ListTodo size={13} />, combo: 'mod+shift+9', onSelect: () => runStateCommand(toggleTaskList) },
              { id: 'quote', label: t('common.quote'), icon: <Quote size={13} />, combo: 'mod+shift+.', onSelect: () => runStateCommand(toggleQuote) },
              { id: 'callout', label: t('workspace.callout'), icon: <Sparkles size={13} />, onSelect: () => runStateCommand(insertCallout) },
            ]}
          />
        ),
      },
      {
        id: 'convert-sub',
        label: t('contextmenu.convert_to'),
        icon: <Link2 size={14} />,
        separatorBefore: true,
        submenu: ({ closeMenu }: { closeMenu: () => void }) => (
          <SubmenuList
            closeMenu={closeMenu}
            items={[
              { id: 'link', label: t('contextmenu.convert_to_link'), icon: <Link2 size={13} />, onSelect: () => runStateCommand(insertLink()) },
              { id: 'wikilink', label: t('contextmenu.convert_to_wikilink'), icon: <Network size={13} />, onSelect: () => runStateCommand(toggleWikiLink) },
              { id: 'codeblock', label: t('contextmenu.convert_to_codeblock'), icon: <Braces size={13} />, onSelect: () => runStateCommand(insertCodeBlock) },
            ]}
          />
        ),
      },
    ];
  }
  return null;
}

export function buildPreviewSelectionItems(ctx: MenuCtx): MenuItem[] | null {
  const { previewContext, content, onJumpToLine, createNote, handleCopy } = ctx;

  if (previewContext && previewContext.type === 'selection' && previewContext.selectedText) {
    const selected = previewContext.selectedText;
    return [
      {
        id: 'copy',
        label: t('contextmenu.copy'),
        icon: <Copy size={14} />,
        combo: 'mod+c',
        onSelect: () => handleCopy(selected),
      },
      {
        id: 'preview-locate',
        label: t('contextmenu.preview_jump_to_editor'),
        icon: <Pencil size={14} />,
        separatorBefore: true,
        onSelect: () => {
          if (previewContext.sourceLine !== undefined) {
            onJumpToLine(previewContext.sourceLine);
          } else {
            const idx = content.indexOf(selected);
            if (idx >= 0) {
              const line = content.slice(0, idx).split('\n').length - 1;
              onJumpToLine(line);
            }
          }
        },
      },
      {
        id: 'create-from-selection',
        label: t('contextmenu.preview_create_note_from_selection'),
        icon: <Plus size={14} />,
        onSelect: () => {
          void createNote({ title: selected, open: true });
        },
      },
    ];
  }
  return null;
}

