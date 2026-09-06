import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommunityTemplate, NoteTemplate, NoteTemplateCategory } from '@shared/types';
import { useSession } from '../../store/session';
import { useNoteTemplates } from '../../store/note-templates';
import { useEscape, useDialogFocus, useLockScroll } from '../../components/overlay';
import { api } from '../../lib/api';
import { GALLERY_PERSIST_KEY, loadGalleryPersist, type GalleryFilter, type GalleryPersistedState } from './gallery-persist';

export function useGalleryLocalState({ onClose }: { onClose: () => void }) {
    const panelRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const moreButtonRef = useRef<HTMLButtonElement>(null);
    const [persisted] = useState(loadGalleryPersist);
    const [filter, setFilter] = useState<GalleryFilter>(persisted.filter);
    const [query, setQuery] = useState(persisted.query);
    const [editing, setEditing] = useState<NoteTemplate | 'new' | null>(null);
    const [renaming, setRenaming] = useState<NoteTemplate | null>(null);
    const [moving, setMoving] = useState<NoteTemplate | null>(null);
    const [categoryDialog, setCategoryDialog] = useState<{ mode: 'create' } | { mode: 'rename'; category: NoteTemplateCategory } | null>(null);
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [selectMode, setSelectMode] = useState(persisted.selectMode);
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
    const [isBatchMoving, setIsBatchMoving] = useState(false);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropHint, setDropHint] = useState<{ id: string; after: boolean } | null>(null);
    const [dropCategory, setDropCategory] = useState<string | null>(null);
    const [publishing, setPublishing] = useState<NoteTemplate | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const currentUserId = useSession((s) => s.user?.id);
    useEscape(true, () => {
        if (selectMode) {
            setSelectedIds(new Set());
            setSelectMode(false);
        }
        else {
            onClose();
        }
    });
    useLockScroll(true);
    useDialogFocus(true, panelRef, searchRef);
    return { onClose, panelRef, searchRef, moreButtonRef, filter, setFilter, query, setQuery, editing, setEditing, renaming, setRenaming, moving, setMoving, categoryDialog, setCategoryDialog, isMoreOpen, setIsMoreOpen, isImportOpen, setIsImportOpen, isHelpOpen, setIsHelpOpen, selectMode, setSelectMode, selectedIds, setSelectedIds, isBatchMoving, setIsBatchMoving, focusedId, setFocusedId, draggingId, setDraggingId, dropHint, setDropHint, dropCategory, setDropCategory, publishing, setPublishing, gridRef, currentUserId };
}

export type GalleryLocalState = ReturnType<typeof useGalleryLocalState>;

export function useGalleryStoreState() {
    const categories = useNoteTemplates((s) => s.categories);
    const templates = useNoteTemplates((s) => s.templates);
    const hydrated = useNoteTemplates((s) => s.hydrated);
    const hydrate = useNoteTemplates((s) => s.hydrate);
    const togglePin = useNoteTemplates((s) => s.toggleTemplatePin);
    const toggleStar = useNoteTemplates((s) => s.toggleTemplateStar);
    useEffect(() => {
        if (!hydrated)
            void hydrate().catch((error) => {
                console.warn('[templates] failed to hydrate the template library', error)
            });
    }, [hydrated, hydrate]);
    return { categories, templates, hydrated, togglePin, toggleStar };
}

export function useGalleryEffects(state: GalleryLocalState, store: ReturnType<typeof useGalleryStoreState>) {
    const { filter, query, selectMode } = state;
    useEffect(() => {
        localStorage.setItem(GALLERY_PERSIST_KEY, JSON.stringify({ filter, query, selectMode } satisfies GalleryPersistedState));
    }, [filter, query, selectMode]);
    useEffect(() => {
        if (!store.hydrated)
            return;
        state.setFilter((current) => {
            if (current.kind === 'category' && !store.categories.some((item) => item.id === current.id))
                return { kind: 'all' };
            if (current.kind === 'tag' && !store.templates.some((item) => item.tags.includes(current.tag)))
                return { kind: 'all' };
            return current;
        });
    }, [store.categories, store.hydrated, store.templates]);
}

export function useGalleryCommunity(filter: GalleryFilter) {
    const [community, setCommunity] = useState<CommunityTemplate[]>([]);
    const [isCommunityLoading, setIsCommunityLoading] = useState(false);
    const [isCommunityError, setIsCommunityError] = useState(false);
    const communityLoadedRef = useRef(false);
    const refreshCommunity = useCallback(async () => {
        setIsCommunityLoading(true);
        setIsCommunityError(false);
        try {
            const { templates: items } = await api.communityTemplates.list();
            setCommunity(items);
        }
        catch {
            setIsCommunityError(true);
        }
        finally {
            setIsCommunityLoading(false);
        }
    }, []);
    useEffect(() => {
        if (filter.kind !== 'community' || communityLoadedRef.current)
            return;
        communityLoadedRef.current = true;
        void refreshCommunity();
    }, [filter.kind, refreshCommunity]);
    return { community, setCommunity, isCommunityLoading, isCommunityError, refreshCommunity };
}