import { Columns2, FolderClosed, MoreHorizontal, Pin, Share2, Star, Globe } from 'lucide-react';
import type { Folder } from '@shared/types';
import { cn } from '../../../lib/cn';
import { IconButton } from '../../../components/primitives';
import { Menu, Tooltip, type MenuItem } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { openFolderView } from '../../../lib/folders';
import { CreateFolderModal } from '../../folders';
import { BlogPublishModal } from '../../blog';
import { ShareEditModal, ShareNoteAnalyticsModal, ShareQrModal } from '../../share';
import { TagPill } from '../../../components/tag-pill';
import { removeTagFromNote } from '../../tags';
import { t } from '../../../lib/i18n';
import type { NoteRowState } from './note-row-state';
import type { NoteRowActions } from './note-row-actions';

interface FolderPillData {
    id: string;
    name: string;
    color?: string | null;
    icon?: string | null;
}

function useNoteRowHandlers(state: NoteRowState) {
    const { note, breakpoint, selectedIds, toggleSelected, openNote, onRangeSelect, menu, setIsMenuOpen } = state;
    const onDragStart = (event: React.DragEvent) => {
        event.dataTransfer.setData('application/x-inkstone-note', note.id);
        if (selectedIds.includes(note.id) && selectedIds.length > 1) {
            event.dataTransfer.setData('application/x-inkstone-notes', JSON.stringify(selectedIds));
        }
        event.dataTransfer.effectAllowed = 'move';
    };
    const onClick = (event: React.MouseEvent) => {
        if (event.altKey && breakpoint === 'desktop') {
            event.preventDefault();
            void openNote(note.id, { pane: 'secondary' });
            return;
        }
        if (event.metaKey || event.ctrlKey) {
            toggleSelected(note.id, true);
            return;
        }
        if (event.shiftKey) {
            event.preventDefault();
            onRangeSelect(note.id);
            return;
        }
        void openNote(note.id);
    };
    const onContextMenu = (event: React.MouseEvent) => {
        setIsMenuOpen(false);
        menu.onContextMenu(event);
    };
    return { onDragStart, onClick, onContextMenu };
}

function noteRowClassName(state: NoteRowState): string {
    const { density, selectionHighlighted, active, openInSecondary } = state;
    return cn('motion-note-row group relative cursor-default rounded-[var(--r-md)] border border-transparent px-2.5 pr-11 transition-[background-color,border-color,box-shadow,transform] duration-[var(--dur-fast)] md:pr-10', density === 'compact' ? 'py-[7px]' : 'py-2.5', selectionHighlighted
        ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]/40'
        : active
            ? 'border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]'
            : openInSecondary
                ? 'border-[var(--accent)]/35 bg-[var(--accent-soft)]/45'
            : 'hover:bg-[var(--bg-hover)]');
}

function FolderPillButton({ folder, folders, size, pillClass }: { folder: FolderPillData; folders: Folder[]; size: number; pillClass: string }) {
    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                openFolderView(folders, folder.id);
            }}
            title={folder.name}
            className={pillClass}
        >
            {folder.color ? (
                <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: folder.color }}
                />
            ) : folder.icon ? (
                <span className="shrink-0 text-[length:var(--text-10)] leading-none">{folder.icon}</span>
            ) : (
                <FolderClosed size={size} className="shrink-0 opacity-70" />
            )}
            <span className="truncate">{folder.name}</span>
        </button>
    );
}

function NoteRowTitleLine({ state }: { state: NoteRowState }) {
    const { note, density, active, titleParts, showFolderPill, noteFolder, folders, computedIsShared, isBlogPublished } = state;
    return (
        <div className="flex items-center gap-1.5">
            {note.isPinned && <Pin size={10} className="anim-mark-enter shrink-0 text-[var(--accent)]"/>}
            <h3 className={cn('min-w-0 flex-1 truncate text-[length:var(--text-13)] leading-snug', active
                ? 'font-semibold text-[var(--accent)]'
                : 'font-medium text-[var(--text-primary)]')}>
                {titleParts.map((part, i) => part.hit ? (<mark key={i} className="ink-hit">
                    {part.text}
                </mark>) : (<span key={i}>{part.text}</span>))}
            </h3>
            {showFolderPill && noteFolder && density === 'compact' && (
                <FolderPillButton
                    folder={noteFolder}
                    folders={folders}
                    size={9}
                    pillClass="inline-flex max-w-[120px] shrink-0 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-1.5 py-px text-[length:var(--text-10)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                />
            )}
            {note.isStarred && <Star size={10} className="anim-mark-enter shrink-0 fill-current text-[var(--warning)]"/>}
            {computedIsShared && (
                <span title={t("workspace.share")} className="inline-flex items-center">
                    <Share2 size={10} className="anim-mark-enter shrink-0 text-[var(--accent)]" />
                </span>
            )}
            {isBlogPublished && (
                <span title={t("blog.published")} className="inline-flex items-center">
                    <Globe size={10} className="anim-mark-enter shrink-0 text-[var(--accent)]" />
                </span>
            )}
        </div>
    );
}

function NoteRowMeta({ state }: { state: NoteRowState }) {
    const { note, showFolderPill, noteFolder, folders, tagColors } = state;
    return (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 overflow-hidden">
            {showFolderPill && noteFolder && (
                <FolderPillButton
                    folder={noteFolder}
                    folders={folders}
                    size={10}
                    pillClass="inline-flex max-w-[140px] items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-2 py-0.5 text-[length:var(--text-10\.5)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                />
            )}
            {note.tags.map((tag) => (
                <TagPill
                    key={tag}
                    tag={tag}
                    color={tagColors.get(tag)}
                    size="sm"
                    removable
                    onClick={(event) => {
                        event?.stopPropagation();
                        useUi.getState().openView('tag', { tag });
                    }}
                    onRemove={(event) => {
                        event?.stopPropagation();
                        void removeTagFromNote(note.id, tag);
                    }}
                />
            ))}
        </div>
    );
}

function NoteRowMain({ state }: { state: NoteRowState }) {
    const { density, note, showFolderPill, noteFolder } = state;
    return (
        <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
                <NoteRowTitleLine state={state}/>
                {density === 'comfortable' && note.excerpt && (<p className="truncate-2 mt-1 text-[length:var(--text-11\.5)] leading-[1.5] text-[var(--text-tertiary)]">
                    {note.excerpt}
                </p>)}
                {density === 'comfortable' && (note.tags.length > 0 || (showFolderPill && noteFolder)) && (
                    <NoteRowMeta state={state}/>
                )}
            </div>
        </div>
    );
}

function NoteRowSideButtons({ state }: { state: NoteRowState }) {
    const { breakpoint, openInSecondary, openNote, note, menuButtonRef, menu, setIsMenuOpen } = state;
    return (<>
        {breakpoint === 'desktop' && (<Tooltip label={t("notes.open_to_side")} side="left">
            <IconButton label={t("notes.open_to_side")} size="sm" active={openInSecondary} onClick={(event) => {
                event.stopPropagation();
                void openNote(note.id, { pane: 'secondary' });
            }} className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" >
                <Columns2 size={14}/>
            </IconButton>
        </Tooltip>)}
        {breakpoint === 'mobile' && (<Tooltip label={t("common.more_actions")} side="left">
            <IconButton ref={menuButtonRef} label={t("common.more_actions")} size="sm" onClick={(event) => {
                event.stopPropagation();
                menu.close();
                setIsMenuOpen(true);
            }} className="absolute top-1.5 right-1.5">
                <MoreHorizontal size={16}/>
            </IconButton>
        </Tooltip>)}
    </>);
}

function NoteRowOverlays({ state, actions, items }: { state: NoteRowState; actions: NoteRowActions; items: MenuItem[] }) {
    const { menu, menuButtonRef, isMenuOpen, setIsMenuOpen, isCreateFolderOpen, setIsCreateFolderOpen, isShareModalOpen, setIsShareModalOpen, note } = state;
    return (<>
        {menu.point && <Menu anchor={menu.point} open onClose={menu.close} items={items}/>}
        <Menu anchor={menuButtonRef} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} items={items} align="end" width={240}/>
        {isCreateFolderOpen && (
            <CreateFolderModal
                open={isCreateFolderOpen}
                onClose={() => setIsCreateFolderOpen(false)}
                onCreated={(folderId) => {
                    actions.handleSelectFolder(folderId);
                }}
            />
        )}
        {isShareModalOpen && (
            <ShareEditModal
                open={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                noteId={note.id}
                noteTitle={note.title || t("common.untitled_note")}
            />
        )}
    </>);
}

function NoteRowModalOverlays({ state }: { state: NoteRowState }) {
    const { qrModalData, setQrModalData, isAnalyticsOpen, setIsAnalyticsOpen, isBlogPublishOpen, setIsBlogPublishOpen, note, noteBlogPost } = state;
    return (<>
        {qrModalData && (
            <ShareQrModal
                open={Boolean(qrModalData)}
                onClose={() => setQrModalData(null)}
                url={qrModalData.url}
                title={qrModalData.title}
                slug={qrModalData.slug}
            />
        )}
        {isAnalyticsOpen && (
            <ShareNoteAnalyticsModal
                open={isAnalyticsOpen}
                onClose={() => setIsAnalyticsOpen(false)}
                noteId={note.id}
            />
        )}
        {isBlogPublishOpen && (
            <BlogPublishModal
                open={isBlogPublishOpen}
                onClose={() => setIsBlogPublishOpen(false)}
                noteId={note.id}
                post={noteBlogPost}
            />
        )}
    </>);
}

// containIntrinsicSize hints reserve the row height before content renders
// under content-visibility: auto; one value per density.
const ROW_INTRINSIC_COMPACT = 'auto 42px'
const ROW_INTRINSIC_COMFORTABLE = 'auto 72px'

export function NoteRowRoot({ state, actions, items }: { state: NoteRowState; actions: NoteRowActions; items: MenuItem[] }) {
    const handlers = useNoteRowHandlers(state);
    return (<>
        <div id={`note-option-${state.note.id}`} role="option" aria-selected={state.active || state.selected} aria-posinset={state.position} aria-setsize={state.total} tabIndex={-1} data-note-id={state.note.id} draggable style={{ contentVisibility: 'auto', containIntrinsicSize: state.density === 'compact' ? ROW_INTRINSIC_COMPACT : ROW_INTRINSIC_COMFORTABLE }} onDragStart={handlers.onDragStart} onClick={handlers.onClick} onContextMenu={handlers.onContextMenu} className={noteRowClassName(state)}>
            <NoteRowMain state={state}/>
            <NoteRowSideButtons state={state}/>
        </div>
        <NoteRowOverlays state={state} actions={actions} items={items}/>
        <NoteRowModalOverlays state={state}/>
    </>);
}