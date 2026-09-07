import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Archive, FolderInput, Pin, Star, Trash2, X } from 'lucide-react';
import type { Folder } from '@shared/types';
import { IconButton } from '../../../components/primitives';
import { Tooltip, confirm } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { useNotes } from '../../../store/notes';
import { FolderPicker } from '../../folders';
import { errorMessage } from '../../../lib/errors';
import { t } from '../../../lib/i18n';

type ToastFn = (input: { title: string; description?: string; tone?: 'default' | 'success' | 'danger' | 'warning' }) => string;

function clearSelection(setSelected: (ids: string[]) => void): void {
  const currentActiveId = useUi.getState().activeNoteId;
  setSelected(currentActiveId ? [currentActiveId] : []);
}

async function performBulkAction(ids: string[], fn: (id: string) => Promise<unknown>, label: string, toast: ToastFn, clear: () => void): Promise<void> {
  for (const id of ids)
    await fn(id);
  toast({ title: t('notes.value0_value1_notes', { value0: label, value1: ids.length }), tone: 'success' });
  clear();
}

async function runBusy(busyRef: { current: boolean }, setIsBusy: (value: boolean) => void, toast: ToastFn, task: () => Promise<void>): Promise<void> {
  if (busyRef.current)
    return;
  busyRef.current = true;
  setIsBusy(true);
  try {
    await task();
  }
  catch (err) {
    toast({ title: t('common.action_failed'), description: errorMessage(err), tone: 'danger' });
  }
  finally {
    busyRef.current = false;
    setIsBusy(false);
  }
}

interface BulkAction {
  key: string;
  label: string;
  icon: ReactNode;
  className?: string;
  onClick: () => void;
}

function BulkToolbar({ count, actions, isBusy, onClear, isFolderPickerOpen, folders, commonFolderId, onSelectFolder, onCloseFolderPicker }: {
  count: number;
  actions: BulkAction[];
  isBusy: boolean;
  onClear: () => void;
  isFolderPickerOpen: boolean;
  folders: Folder[];
  commonFolderId: string | null | undefined;
  onSelectFolder: (folderId: string | null) => void;
  onCloseFolderPicker: () => void;
}) {
  return (<div className='pointer-events-none absolute inset-x-0 bottom-0 z-[var(--z-menu)] flex justify-center pb-3'>
    <div className='anim-rise pointer-events-auto flex items-center gap-1 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 pl-3 shadow-[var(--shadow-pop)]'>
    <span className="mr-1 text-[length:var(--text-11\.5)] whitespace-nowrap text-[var(--text-secondary)]">{t("notes.selected")}<span className='tabular font-medium'>{count}</span>{t("notes.notes")}</span>
    {actions.map((action) => (
      <Tooltip key={action.key} label={action.label}>
      <IconButton label={action.label} size='sm' disabled={isBusy} className={action.className} onClick={action.onClick}>
        {action.icon}
      </IconButton>
      </Tooltip>
    ))}
    <span className='mx-0.5 h-4 w-px bg-[var(--border-subtle)]'/>
    <Tooltip label={t('notes.deselect')}>
      <IconButton label={t('notes.deselect')} size='sm' disabled={isBusy} onClick={onClear}>
      <X size={13}/>
      </IconButton>
    </Tooltip>
    </div>
    {isFolderPickerOpen && <FolderPicker open title={t("notes.move_to_folder")} folders={folders} currentId={commonFolderId} rootLabel={t("notes.remove_from_folder")} onSelect={onSelectFolder} onClose={onCloseFolderPicker}/>}
  </div>);
}

export function BulkBar() {
  const selectedIds = useUi((s) => s.selectedIds);
  const setSelected = useUi((s) => s.setSelected);
  const deleteNote = useNotes((s) => s.deleteNote);
  const setArchivedMany = useNotes((s) => s.setArchivedMany);
  const setStarredMany = useNotes((s) => s.setStarredMany);
  const setPinnedMany = useNotes((s) => s.setPinnedMany);
  const moveNotes = useNotes((s) => s.moveNotes);
  const folders = useNotes((s) => s.folders);
  const notes = useNotes((s) => s.notes);
  const toast = useUi((s) => s.toast);
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
  const busyRef = useRef(false);
  const [isBusy, setIsBusy] = useState(false);
  const ids = selectedIds.filter((id) => notes[id]);
  if (ids.length < 2)
    return null;
  const allStarred = ids.every((id) => notes[id]?.isStarred);
  const allPinned = ids.every((id) => notes[id]?.isPinned);
  const firstFolderId = notes[ids[0]!]?.folderId ?? null;
  const commonFolderId = ids.every((id) => notes[id]?.folderId === firstFolderId) ? firstFolderId : undefined;
  const clear = () => clearSelection(setSelected);
  const runAll = (task: () => Promise<void>) => runBusy(busyRef, setIsBusy, toast, task);
  const trashSelected = async () => {
    const ok = await confirm({
      title: t('notes.move_value0_notes_to_trash', { value0: ids.length }),
      description: t('notes.restore_it_from_trash_at_any_time'),
      confirmLabel: t('common.move_to_trash'),
      tone: 'danger',
    });
    if (ok)
      await performBulkAction(ids, (id) => deleteNote(id), t('notes.deleted'), toast, clear);
  };
  const actions: BulkAction[] = [
    { key: 'star', label: allStarred ? t('common.remove_from_favorites') : t('navigation.favorites'), icon: <Star size={13} className={allStarred ? 'fill-current' : undefined}/>, onClick: () => void runAll(() => setStarredMany(ids, !allStarred)) },
    { key: 'pin', label: allPinned ? t('notes.unpin') : t('notes.pin'), icon: <Pin size={13} className={allPinned ? 'fill-current' : undefined}/>, onClick: () => void runAll(() => setPinnedMany(ids, !allPinned)) },
    { key: 'move', label: t('notes.move_to_folder'), icon: <FolderInput size={13}/>, onClick: () => setIsFolderPickerOpen(true) },
    { key: 'archive', label: t('navigation.archive'), icon: <Archive size={13}/>, onClick: () => void runAll(() => setArchivedMany(ids, true)) },
    { key: 'trash', label: t('common.move_to_trash'), icon: <Trash2 size={13}/>, className: 'text-[var(--text-tertiary)] hover:text-[var(--danger)]', onClick: () => void runAll(trashSelected) },
  ];
  return <BulkToolbar count={ids.length} actions={actions} isBusy={isBusy} onClear={clear} isFolderPickerOpen={isFolderPickerOpen} folders={folders} commonFolderId={commonFolderId} onSelectFolder={(folderId) => void runAll(() => moveNotes(ids, folderId))} onCloseFolderPicker={() => setIsFolderPickerOpen(false)}/>;
}