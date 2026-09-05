import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsDownUp, ChevronsUpDown, FolderPlus, Settings2 } from 'lucide-react';
import { LIMITS } from '@shared/constants';
import { cn } from '../../../../lib/cn';
import { IconButton, SectionLabel } from '../../../../components/primitives';
import { Tooltip } from '../../../../components/overlay';
import { useUi } from '../../../../store/ui';
import { useFolderTree } from '../../../../store/notes/selectors';
import { useNotes } from '../../../../store/notes';
import { folderDescendantIds, folderPath, openFolderView } from '../../../../lib/folders';
import { FolderPicker } from '../../../folders';
import { CalendarTree, TodoTree } from '../../../sidebar/calendar-tree';
import { t } from '../../../../lib/i18n';
import { leftDropTarget } from '../sidebar-drop';
import { FolderRow } from './row';

export function FolderSection() {
    const tree = useFolderTree();
    const folders = useNotes((s) => s.folders ?? []);
    const createFolder = useNotes((s) => s.createFolder);
    const patchFolder = useNotes((s) => s.patchFolder);
    const expandFolder = useUi((s) => s.expandFolder);
    const [isCreating, setIsCreating] = useState(false);
    const openPanel = useUi((s) => s.openPanel);
    const creatingRef = useRef(false);
    const createdTimerRef = useRef<number>(0);
    const [createdFolderId, setCreatedFolderId] = useState<string | null>(null);
    const movingIdsRef = useRef(new Set<string>());
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [movingId, setMovingId] = useState<string | null>(null);
    const [isRootDropping, setIsRootDropping] = useState(false);
    useEffect(() => () => window.clearTimeout(createdTimerRef.current), []);
    const create = (parentId: string | null) => {
        if (creatingRef.current)
            return;
        creatingRef.current = true;
        setIsCreating(true);
        const startingUi = useUi.getState();
        const startingNavigation = {
            view: startingUi.view,
            folderId: startingUi.folderId,
            tag: startingUi.tag,
            activeNoteId: startingUi.activeNoteId,
        };
        try {
            const folderId = createFolder({ parentId });
            if (!folderId)
                return;
            window.clearTimeout(createdTimerRef.current);
            setCreatedFolderId(folderId);
            createdTimerRef.current = window.setTimeout(() => setCreatedFolderId(null), 1000);
            const currentUi = useUi.getState();
            if (currentUi.view === startingNavigation.view &&
                currentUi.folderId === startingNavigation.folderId &&
                currentUi.tag === startingNavigation.tag &&
                currentUi.activeNoteId === startingNavigation.activeNoteId) {
                if (parentId)
                    expandFolder(parentId);
                openFolderView(useNotes.getState().folders ?? [], folderId);
                setRenamingId(folderId);
            }
        }
        finally {
            queueMicrotask(() => {
                creatingRef.current = false;
                setIsCreating(false);
            });
        }
    };
    const move = (id: string, parentId: string | null, beforeId: string | null) => {
        if (movingIdsRef.current.has(id))
            return false;
        movingIdsRef.current.add(id);
        try {
            if (!patchFolder(id, { parentId, beforeId }))
                return false;
            if (parentId)
                expandFolder(parentId);
            return true;
        }
        catch {
            return false;
        }
        finally {
            movingIdsRef.current.delete(id);
        }
    };
    const movingFolder = movingId ? folders.find((folder) => folder.id === movingId) ?? null : null;
    const excludedMoveTargets = useMemo(() => {
        if (!movingId)
            return undefined;
        const excluded = folderDescendantIds(folders, movingId);
        const movingDepth = Math.max(0, folderPath(folders, movingId).length - 1);
        const relativeSubtreeDepth = Math.max(0, ...[...excluded].map((id) => Math.max(0, folderPath(folders, id).length - 1 - movingDepth)));
        for (const candidate of folders) {
            const movedRootDepth = folderPath(folders, candidate.id).length;
            if (movedRootDepth + relativeSubtreeDepth >= LIMITS.folderDepthMax)
                excluded.add(candidate.id);
        }
        return excluded;
    }, [folders, movingId]);
    const expandedFolders = useUi((s) => s.expandedFolders);
    const parentFolderIds = useMemo(() => {
        return folders.filter((f) => folders.some((child) => child.parentId === f.id)).map((f) => f.id);
    }, [folders]);
    const allExpanded = parentFolderIds.length > 0 && parentFolderIds.every((id) => expandedFolders.includes(id));

    const toggleAllExpanded = () => {
        if (allExpanded) {
            useUi.setState({
                expandedFolders: expandedFolders.filter((id) => !parentFolderIds.includes(id)),
            });
        } else {
            useUi.setState({
                expandedFolders: Array.from(new Set([...expandedFolders, ...parentFolderIds])),
            });
        }
    };
    return (<>
      <section id="sidebar-folders" className={cn('mt-4 rounded-[var(--r-md)]', isRootDropping && 'ring-1 ring-[var(--accent)]')} onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('application/x-inkstone-folder'))
                return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setIsRootDropping(true);
        }} onDragLeave={(event) => {
            if (leftDropTarget(event))
                setIsRootDropping(false);
        }} onDrop={(event) => {
            const folderId = event.dataTransfer.getData('application/x-inkstone-folder');
            if (!folderId)
                return;
            event.preventDefault();
            setIsRootDropping(false);
            void move(folderId, null, null);
        }}>
      <div className="group/head flex items-center justify-between pr-1">
        <SectionLabel>{t("navigation.folder")}</SectionLabel>
        <div className="flex items-center gap-0.5">
          {parentFolderIds.length > 0 && (
            <Tooltip label={allExpanded ? t("folders.collapse_all") : t("folders.expand_all")} side="left">
              <IconButton
                label={allExpanded ? t("folders.collapse_all") : t("folders.expand_all")}
                size="sm"
                onClick={toggleAllExpanded}
                className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100"
              >
                {allExpanded ? <ChevronsDownUp size={13}/> : <ChevronsUpDown size={13}/>}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip label={t("folders.manage_folders")} side="left">
            <IconButton label={t("folders.manage_folders")} size="sm" onClick={() => openPanel('folders')} className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100">
              <Settings2 size={13}/>
            </IconButton>
          </Tooltip>
          <Tooltip label={t("common.new_folder")} side="right">
            <IconButton label={t("common.new_folder")} size="sm" disabled={isCreating} onClick={() => void create(null)} className="opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100">
              <FolderPlus size={13}/>
            </IconButton>
          </Tooltip>
        </div>
      </div>

      <CalendarTree />
      <TodoTree />

      {tree.length === 0 ? (<button type="button" disabled={isCreating} onClick={() => void create(null)} className="mt-0.5 flex h-10 w-full items-center gap-2 rounded-[var(--r-md)] px-2 text-[length:var(--text-12)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] disabled:pointer-events-none disabled:opacity-45 md:h-[30px]">
          <FolderPlus size={13}/>{t("sidebar.create_first_folder")}</button>) : (<div role="tree" aria-label={t("navigation.folder")} className="mt-0.5 space-y-px">
          {tree.map((node, index) => (<FolderRow key={node.id} node={node} siblings={tree} index={index} parentNode={null} parentSiblings={[]} onCreateChild={create} onMove={move} onChooseParent={setMovingId} createdFolderId={createdFolderId} renamingId={renamingId} onStartRename={setRenamingId} onFinishRename={() => setRenamingId(null)}/>))}
        </div>)}
      </section>
      <FolderPicker open={Boolean(movingFolder)} title={t("folders.choose_parent")} folders={folders} currentId={movingFolder?.parentId ?? null} excludedIds={excludedMoveTargets} onSelect={(parentId) => {
            if (movingId)
                void move(movingId, parentId, null);
        }} onClose={() => setMovingId(null)}/>
    </>);
}

