import type { EditorView } from '@codemirror/view';
import { Blocks, Bold, Braces, ChevronDown, Code, Heading, Highlighter, Image as ImageIcon, Italic, Link2, List, ListOrdered, ListTodo, Minus, Network, Paperclip, Quote, Sigma, Smile, Strikethrough, Table } from 'lucide-react';
import { IconButton } from '../../components/primitives';
import { Menu, Tooltip } from '../../components/overlay';
import { cn } from '../../lib/cn';
import { insertCodeBlock, insertHorizontalRule, insertLink, insertTable, insertText, toggleBold, toggleBulletList, toggleInlineCode, toggleItalic, toggleOrderedList, toggleQuote, toggleStrikethrough, toggleTaskList } from '../../editor/commands';
import { useToolbarMenus, type ToolbarBundle } from './use-editor-toolbar';
import { t } from '../../lib/i18n';

export interface EditorToolbarProps {
  runCommand?: (command: (target: EditorView) => boolean) => void;
  view?: EditorView | null;
  onPickImage: () => void;
  onPickFile?: () => void;
  mobile?: boolean;
}

function ToolButton({ label, combo, onClick, children }: { label: string; combo?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip label={label} combo={combo}>
      <IconButton label={label} size="sm" onClick={onClick} className="size-9 md:size-7">
        {children}
      </IconButton>
    </Tooltip>
  );
}

function MenuButton({ buttonRef, label, open, onClick, children, mobile }: { buttonRef: React.RefObject<HTMLButtonElement | null>; label: string; open: boolean; onClick: () => void; children: React.ReactNode; mobile: boolean }) {
  return (
    <Tooltip label={label}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-[var(--r-md)] px-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]', mobile ? 'h-9' : 'h-7')}
      >
        {children}
        <ChevronDown size={10} className="opacity-60" />
      </button>
    </Tooltip>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px shrink-0 bg-[var(--border-subtle)]" />;
}

function TextStyleButtons({ b }: { b: ToolbarBundle }) {
  return (
    <>
      <ToolButton label={t('common.bold')} combo="mod+b" onClick={b.run(toggleBold)}><Bold size={14} /></ToolButton>
      <ToolButton label={t('common.italic')} combo="mod+i" onClick={b.run(toggleItalic)}><Italic size={14} /></ToolButton>
      <ToolButton label={t('common.strikethrough')} combo="mod+shift+x" onClick={b.run(toggleStrikethrough)}><Strikethrough size={14} /></ToolButton>
      <ToolButton label={t('common.inline_code')} combo="mod+e" onClick={b.run(toggleInlineCode)}><Code size={14} /></ToolButton>
      <MenuButton buttonRef={b.inlineRef} label={t('workspace.more_inline_styles')} mobile={b.mobile} open={b.openMenu === 'inline'} onClick={() => b.toggleMenu('inline')}>
        <Highlighter size={14} />
      </MenuButton>
    </>
  );
}

function ListButtons({ b }: { b: ToolbarBundle }) {
  return (
    <>
      <ToolButton label={t('common.unordered_list')} combo="mod+shift+8" onClick={b.run(toggleBulletList)}><List size={14} /></ToolButton>
      <ToolButton label={t('common.ordered_list')} combo="mod+shift+7" onClick={b.run(toggleOrderedList)}><ListOrdered size={14} /></ToolButton>
      <ToolButton label={t('common.task_list')} combo="mod+shift+9" onClick={b.run(toggleTaskList)}><ListTodo size={14} /></ToolButton>
      <ToolButton label={t('common.quote')} combo="mod+shift+." onClick={b.run(toggleQuote)}><Quote size={14} /></ToolButton>
      <MenuButton buttonRef={b.emojiRef} label={t('common.emoji')} mobile={b.mobile} open={b.openMenu === 'emoji'} onClick={() => b.toggleMenu('emoji')}>
        <Smile size={14} />
      </MenuButton>
    </>
  );
}

function InsertButtons({ b, onPickImage, onPickFile }: { b: ToolbarBundle; onPickImage: () => void; onPickFile?: () => void }) {
  return (
    <>
      <ToolButton label={t('workspace.link')} onClick={b.run(insertLink())}><Link2 size={14} /></ToolButton>
      <ToolButton label={t('workspace.insert_image')} onClick={onPickImage}><ImageIcon size={14} /></ToolButton>
      <ToolButton label={t('workspace.insert_file')} onClick={() => onPickFile?.()}><Paperclip size={14} /></ToolButton>
      <MenuButton buttonRef={b.noteRef} label={t('workspace.note_syntax')} mobile={b.mobile} open={b.openMenu === 'note'} onClick={() => b.toggleMenu('note')}>
        <Network size={14} />
      </MenuButton>
    </>
  );
}

function BlockButtons({ b }: { b: ToolbarBundle }) {
  return (
    <>
      <ToolButton label={t('workspace.code_block')} onClick={b.run(insertCodeBlock)}><Braces size={14} /></ToolButton>
      <ToolButton label={t('workspace.table')} onClick={b.run(insertTable)}><Table size={14} /></ToolButton>
      <ToolButton label={t('workspace.math')} onClick={b.run(insertText('$$\n\n$$\n', 3))}><Sigma size={14} /></ToolButton>
      <ToolButton label={t('workspace.divider')} onClick={b.run(insertHorizontalRule)}><Minus size={14} /></ToolButton>
      <MenuButton buttonRef={b.blockRef} label={t('workspace.more_blocks')} mobile={b.mobile} open={b.openMenu === 'block'} onClick={() => b.toggleMenu('block')}>
        <Blocks size={14} />
      </MenuButton>
    </>
  );
}

function ToolbarMenus({ b }: { b: ToolbarBundle }) {
  return (
    <>
      <Menu anchor={b.headingRef} open={b.openMenu === 'heading'} onClose={() => b.setOpenMenu(null)} items={b.headingItems} width={168} label={t('workspace.title_level')} />
      <Menu anchor={b.inlineRef} open={b.openMenu === 'inline'} onClose={() => b.setOpenMenu(null)} items={b.inlineItems} width={184} label={t('workspace.more_inline_styles')} />
      <Menu anchor={b.emojiRef} open={b.openMenu === 'emoji'} onClose={() => b.setOpenMenu(null)} items={b.emojiItems} width={180} label={t('common.emoji')} />
      <Menu anchor={b.noteRef} open={b.openMenu === 'note'} onClose={() => b.setOpenMenu(null)} items={b.noteItems} width={184} label={t('workspace.note_syntax')} />
      <Menu anchor={b.blockRef} open={b.openMenu === 'block'} onClose={() => b.setOpenMenu(null)} items={b.blockItems} width={192} label={t('workspace.more_blocks')} />
    </>
  );
}

export function EditorToolbar({ runCommand, view, onPickImage, onPickFile, mobile = false }: EditorToolbarProps) {
  const menus = useToolbarMenus(runCommand, view);
  const b: ToolbarBundle = { ...menus, mobile };

  return (
    <div className={cn('flex shrink-0 items-center overflow-x-auto border-b border-[var(--border-subtle)] px-2 no-scrollbar', mobile ? 'h-11 gap-1' : 'h-9 gap-0.5')}>
      <Tooltip label={t('workspace.title_748d7d')}>
        <button
          ref={b.headingRef}
          type="button"
          onClick={() => b.toggleMenu('heading')}
          aria-label={t('workspace.title_level')}
          aria-haspopup="menu"
          aria-expanded={b.openMenu === 'heading'}
          className={cn('inline-flex items-center gap-0.5 rounded-[var(--r-md)] px-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]', mobile ? 'h-9' : 'h-7')}
        >
          <Heading size={14} />
          <ChevronDown size={10} className="opacity-60" />
        </button>
      </Tooltip>

      <Divider />

      <TextStyleButtons b={b} />

      <Divider />

      <ListButtons b={b} />

      <Divider />

      <InsertButtons b={b} onPickImage={onPickImage} onPickFile={onPickFile} />

      <Divider />

      <BlockButtons b={b} />

      <ToolbarMenus b={b} />
    </div>
  );
}