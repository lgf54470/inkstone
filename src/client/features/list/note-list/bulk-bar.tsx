import { useRef, useState } from 'react';
import { Archive, FolderInput, Pin, Star, Trash2, X } from 'lucide-react';
import { IconButton } from '../../../components/primitives';
import { Tooltip, confirm } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { useNotes } from '../../../store/notes';
import { FolderPicker } from '../../folders';
import { errorMessage } from '../../../lib/errors';
import { t } from '../../../lib/i18n';

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
    const clear = () => {
        const currentActiveId = useUi.getState().activeNoteId;
        setSelected(currentActiveId ? [currentActiveId] : []);
    };
    const performAll = async (fn: (id: string) => Promise<void>, label: string) => {
        for (const id of ids)
            await fn(id);
        toast({ title: t("notes.value0_value1_notes", { value0: label, value1: ids.length }), tone: 'success' });
        clear();
    };
    const runAll = async (task: () => Promise<void>) => {
        if (busyRef.current)
            return;
        busyRef.current = true;
        setIsBusy(true);
        try {
            await task();
        }
        catch (err) {
            toast({ title: t("common.action_failed"), description: errorMessage(err), tone: 'danger' });
        }
        finally {
            busyRef.current = false;
            setIsBusy(false);
        }
    };
    return (<div className="pointer-events-none absolute inset-x-0 bottom-0 z-[var(--z-menu)] flex justify-center pb-3">
      <div className="anim-rise pointer-events-auto flex items-center gap-1 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 pl-3 shadow-[var(--shadow-pop)]">
        <span className="mr-1 text-[length:var(--text-11\.5)] whitespace-nowrap text-[var(--text-secondary)]">{t("notes.selected")}<span className="tabular font-medium">{ids.length}</span>{t("notes.notes")}</span>
        <Tooltip label={allStarred ? t("common.remove_from_favorites") : t("navigation.favorites")}>
          <IconButton label={t("navigation.favorites")} size="sm" disabled={isBusy} onClick={() => void runAll(() => setStarredMany(ids, !allStarred))}>
            <Star size={13} className={allStarred ? 'fill-current' : undefined}/>
          </IconButton>
        </Tooltip>
        <Tooltip label={allPinned ? t("notes.unpin") : t("notes.pin")}>
          <IconButton label={allPinned ? t("notes.unpin") : t("notes.pin")} size="sm" disabled={isBusy} onClick={() => void runAll(() => setPinnedMany(ids, !allPinned))}>
            <Pin size={13} className={allPinned ? 'fill-current' : undefined}/>
          </IconButton>
        </Tooltip>
        <Tooltip label={t("notes.move_to_folder")}>
          <IconButton label={t("notes.move_to_folder")} size="sm" disabled={isBusy} onClick={() => setIsFolderPickerOpen(true)}>
            <FolderInput size={13}/>
          </IconButton>
        </Tooltip>
        <Tooltip label={t("navigation.archive")}>
          <IconButton label={t("navigation.archive")} size="sm" disabled={isBusy} onClick={() => void runAll(() => setArchivedMany(ids, true))}>
            <Archive size={13}/>
          </IconButton>
        </Tooltip>
        <Tooltip label={t("common.move_to_trash")}>
          <IconButton label={t("common.move_to_trash")} size="sm" disabled={isBusy} className="text-[var(--text-tertiary)] hover:text-[var(--danger)]" onClick={() => void runAll(async () => {
            const ok = await confirm({
                title: t("notes.move_value0_notes_to_trash", { value0: ids.length }),
                description: t("notes.restore_it_from_trash_at_any_time"),
                confirmLabel: t("common.move_to_trash"),
                tone: 'danger',
            });
            if (ok)
                await performAll((id) => deleteNote(id), t("notes.deleted"));
        })}>
            <Trash2 size={13}/>
          </IconButton>
        </Tooltip>
        <span className="mx-0.5 h-4 w-px bg-[var(--border-subtle)]"/>
        <Tooltip label={t("notes.deselect")}>
          <IconButton label={t("notes.deselect")} size="sm" disabled={isBusy} onClick={clear}>
            <X size={13}/>
          </IconButton>
        </Tooltip>
      </div>

      {isFolderPickerOpen && <FolderPicker open title={t("notes.move_to_folder")} folders={folders} currentId={commonFolderId} rootLabel={t("notes.remove_from_folder")} onSelect={(folderId) => void runAll(() => moveNotes(ids, folderId))} onClose={() => setIsFolderPickerOpen(false)}/>}
    </div>);
}

