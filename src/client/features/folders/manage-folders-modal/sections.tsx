import {
  Check, Download, ExternalLink, FolderClosed, FolderPlus, Inbox,
  LayoutTemplate, Palette, Pencil, Search, Trash2, X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Folder, NoteTemplate } from '@shared/types';
import { Tooltip } from '../../../components/overlay';
import { Button, IconButton } from '../../../components/primitives';
import { errorMessage } from '../../../lib/errors';
import { exportFolderAsZip } from '../../../lib/export-folder';
import { t } from '../../../lib/i18n';
import type { ToastItem } from '../../../store/ui';
import { FolderColorPicker, FolderIconBadge, FolderIconPicker } from './pickers';

export type ToastFn = (input: Omit<ToastItem, 'id' | 'duration' | 'tone'> & { tone?: ToastItem['tone']; duration?: number }) => string;

export interface FolderRowActions {
  isIconPickerOpen: (folder: Folder) => boolean;
  isColorPickerOpen: (folder: Folder) => boolean;
  onToggleIconPicker: (id: string) => void;
  onToggleColorPicker: (id: string) => void;
  onStartRename: (folder: Folder) => void;
  onRenameChange: (value: string) => void;
  onSaveRename: (id: string) => void;
  onCancelRename: () => void;
  onToggleInbox: (folder: Folder) => void;
  onOpen: (folder: Folder) => void;
  onBindTemplate: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onPickColor: (id: string, color: string | null) => void;
  onPickIcon: (id: string, icon: string | null) => void;
  toast: ToastFn;
}

export async function exportFolderZip(folderId: string, toast: ToastFn): Promise<void> {
  try {
    const res = await exportFolderAsZip(folderId);
    if (res.count === 0) {
      toast({ title: t('folders.export_zip_empty'), tone: 'default' });
    } else {
      toast({ title: t('folders.export_zip_success', { value0: res.count }), tone: 'success' });
    }
  } catch (err) {
    toast({
      title: t('common.export_failed'),
      description: errorMessage(err),
      tone: 'danger',
    });
  }
}

function RowActionButton({ label, icon, className, onClick }: {
  label: string;
  icon: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <IconButton label={label} size='sm' className={className} onClick={onClick}>
        {icon}
      </IconButton>
    </Tooltip>
  );
}

export function FolderControlsBar({ query, onQueryChange, emptyFolders, isCreating, onClean, onAdd }: {
  query: string;
  onQueryChange: (value: string) => void;
  emptyFolders: Folder[];
  isCreating: boolean;
  onClean: () => void;
  onAdd: () => void;
}) {
  return (
    <div className='flex items-center gap-2'>
      <div className='relative flex-1'>
        <Search
          size={14}
          className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]'
        />
        <input
          type='text'
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('folders.search')}
          className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] pl-9 pr-3 text-[length:var(--text-12\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-focus)]"
        />
      </div>
      {emptyFolders.length > 0 && !isCreating && (
        <Tooltip label={t('folders.clean_empty')}>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => void onClean()}
            className='h-8 shrink-0 text-[var(--danger)] hover:bg-[var(--danger-soft)]'
          >
            {t('folders.clean_empty_value0', { value0: emptyFolders.length })}
          </Button>
        </Tooltip>
      )}
      {!isCreating && (
        <Tooltip label={t('common.new_folder')}>
          <Button
            variant='primary'
            size='sm'
            icon={<FolderPlus size={14} className='shrink-0' />}
            onClick={onAdd}
            className='h-8 shrink-0'
          >
            {t('common.new_folder')}
          </Button>
        </Tooltip>
      )}
    </div>
  );
}

export function FolderCreateForm({ value, onChange, onSubmit, onCancel }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className='flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--accent-soft)]/25 p-2'
    >
      <FolderClosed size={16} className='ml-1 text-[var(--accent)] shrink-0' />
      <input
        autoFocus
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={t('common.new_folder')}
        className="h-8 flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[length:var(--text-12\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <Button
        variant='primary'
        size='sm'
        type='submit'
        disabled={!value.trim()}
        className='h-8 shrink-0'
      >
        {t('folders.create_new')}
      </Button>
      <Tooltip label={t('common.cancel')}>
        <IconButton
          label={t('common.cancel')}
          size='sm'
          type='button'
          onClick={onCancel}
        >
          <X size={14} />
        </IconButton>
      </Tooltip>
    </form>
  );
}

function FolderListEmpty({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="py-10 text-center text-[length:var(--text-12\.5)] text-[var(--text-quaternary)]">
      {hasQuery ? t('folders.no_match') : t('folders.no_folders')}
    </div>
  );
}

function FolderRenameInput({ value, onChange, onSave, onCancel }: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className='flex flex-1 items-center gap-1.5'>
      <input
        autoFocus
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave();
          if (e.key === 'Escape') onCancel();
        }}
        className="h-7 flex-1 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--bg-surface)] px-2 text-[length:var(--text-12\.5)] outline-none"
      />
      <Tooltip label={t('common.save')}>
        <IconButton
          label={t('common.save')}
          size='sm'
          onClick={onSave}
        >
          <Check size={13} className='text-[var(--accent)]' />
        </IconButton>
      </Tooltip>
      <Tooltip label={t('common.cancel')}>
        <IconButton
          label={t('common.cancel')}
          size='sm'
          onClick={onCancel}
        >
          <X size={13} />
        </IconButton>
      </Tooltip>
    </div>
  );
}

function FolderNameDisplay({ path, isInbox, boundTemplate, count }: {
  path: string;
  isInbox: boolean;
  boundTemplate: NoteTemplate | null;
  count: number;
}) {
  return (
    <div className='min-w-0 flex-1'>
      <div className='flex items-center gap-2'>
        <span className='truncate text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
          {path}
        </span>
        {isInbox && (
          <span className="inline-flex items-center gap-1 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[length:var(--text-10\.5)] font-medium text-[var(--accent)]">
            <Inbox size={10.5} />
            {t('folders.inbox')}
          </span>
        )}
        {boundTemplate && (
          <span
            title={`${t('folders.default_template')}: ${boundTemplate.name}`}
            className="inline-flex items-center gap-1 rounded bg-[var(--accent-soft)]/60 px-1.5 py-0.5 text-[length:var(--text-10\.5)] font-medium text-[var(--accent)]"
          >
            <LayoutTemplate size={10} />
            <span className='max-w-[100px] truncate'>{boundTemplate.name}</span>
          </span>
        )}
        <span className='shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {t('folders.notes_count', { value0: count })}
        </span>
      </div>
    </div>
  );
}

function FolderActionButtons({ folder, isInbox, isColorPickerOpen, boundTemplate, actions }: {
  folder: Folder;
  isInbox: boolean;
  isColorPickerOpen: boolean;
  boundTemplate: NoteTemplate | null;
  actions: FolderRowActions;
}) {
  return (
    <div className='flex shrink-0 items-center gap-0.5 opacity-85 group-hover:opacity-100'>
      <RowActionButton
        label={isInbox ? t('folders.unset_inbox') : t('folders.set_as_inbox')}
        icon={<Inbox size={13} />}
        className={isInbox ? 'text-[var(--accent)]' : undefined}
        onClick={() => actions.onToggleInbox(folder)}
      />
      <RowActionButton
        label={t('folders.open_folder')}
        icon={<ExternalLink size={13} />}
        onClick={() => actions.onOpen(folder)}
      />
      <RowActionButton
        label={t('sidebar.rename')}
        icon={<Pencil size={13} />}
        onClick={() => actions.onStartRename(folder)}
      />
      <RowActionButton
        label={t('folders.color')}
        icon={<Palette size={13} />}
        className={folder.color || isColorPickerOpen ? 'text-[var(--accent)]' : undefined}
        onClick={() => actions.onToggleColorPicker(folder.id)}
      />
      <RowActionButton
        label={boundTemplate ? `${t('folders.default_template')}: ${boundTemplate.name}` : t('folders.bind_template')}
        icon={<LayoutTemplate size={13} />}
        className={boundTemplate ? 'text-[var(--accent)]' : undefined}
        onClick={() => actions.onBindTemplate(folder)}
      />
      <RowActionButton
        label={t('folders.export_zip')}
        icon={<Download size={13} />}
        onClick={() => void exportFolderZip(folder.id, actions.toast)}
      />
      <RowActionButton
        label={t('common.delete')}
        icon={<Trash2 size={13} />}
        className='text-[var(--text-tertiary)] hover:text-[var(--danger)]'
        onClick={() => actions.onDelete(folder)}
      />
    </div>
  );
}

interface FolderRowProps {
  folder: Folder;
  path: string;
  count: number;
  isRenaming: boolean;
  isInbox: boolean;
  isColorPickerOpen: boolean;
  isIconPickerOpen: boolean;
  boundTemplate: NoteTemplate | null;
  renameValue: string;
  actions: FolderRowActions;
}

function FolderRow({ folder, path, count, isRenaming, isInbox, isColorPickerOpen, isIconPickerOpen, boundTemplate, renameValue, actions }: FolderRowProps) {
  return (
    <div className='py-0.5'>
      <div className='group flex items-center justify-between gap-3 rounded-[var(--r-md)] p-2 transition-colors hover:bg-[var(--bg-hover)]'>
        <div className='flex min-w-0 flex-1 items-center gap-2.5'>
          <FolderIconBadge folder={folder} isOpen={actions.isIconPickerOpen(folder)} onToggle={() => actions.onToggleIconPicker(folder.id)} />
          {isRenaming ? (
            <FolderRenameInput value={renameValue} onChange={actions.onRenameChange} onSave={() => actions.onSaveRename(folder.id)} onCancel={actions.onCancelRename} />
          ) : (
            <FolderNameDisplay path={path} isInbox={isInbox} boundTemplate={boundTemplate} count={count} />
          )}
        </div>
        {!isRenaming && (
          <FolderActionButtons folder={folder} isInbox={isInbox} isColorPickerOpen={isColorPickerOpen} boundTemplate={boundTemplate} actions={actions} />
        )}
      </div>
      {isColorPickerOpen && (
        <FolderColorPicker folder={folder} onPick={(color) => actions.onPickColor(folder.id, color)} />
      )}
      {isIconPickerOpen && (
        <FolderIconPicker folder={folder} onPick={(icon) => actions.onPickIcon(folder.id, icon)} />
      )}
    </div>
  );
}

export function FolderRowList({ choices, folderCounts, folderTemplates, templates, renamingId, inboxFolderId, colorPickerFolderId, iconPickerFolderId, renameValue, query, actions }: {
  choices: { folder: Folder; path: string }[];
  folderCounts: ReadonlyMap<string, number>;
  folderTemplates: Record<string, string>;
  templates: NoteTemplate[];
  renamingId: string | null;
  inboxFolderId: string | null;
  colorPickerFolderId: string | null;
  iconPickerFolderId: string | null;
  renameValue: string;
  query: string;
  actions: FolderRowActions;
}) {
  return (
    <div className='max-h-[420px] overflow-y-auto space-y-1 divide-y divide-[var(--border-subtle)]/50'>
      {choices.map(({ folder, path }) => {
        const count = folderCounts.get(folder.id) ?? 0;
        const boundTemplateId = folderTemplates[folder.id];
        const boundTemplate = boundTemplateId ? templates.find((template) => template.id === boundTemplateId) ?? null : null;
        return (
          <FolderRow
            key={folder.id}
            folder={folder}
            path={path}
            count={count}
            isRenaming={renamingId === folder.id}
            isInbox={inboxFolderId === folder.id}
            isColorPickerOpen={colorPickerFolderId === folder.id}
            isIconPickerOpen={iconPickerFolderId === folder.id}
            boundTemplate={boundTemplate}
            renameValue={renameValue}
            actions={actions}
          />
        );
      })}
      {choices.length === 0 && <FolderListEmpty hasQuery={Boolean(query.trim())} />}
    </div>
  );
}