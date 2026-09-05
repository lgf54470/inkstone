import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Download, FilePlus2, FolderPlus, Globe, Hash, HelpCircle, LayoutTemplate, MoreHorizontal, Pencil, Pin, PinOff, Plus, RotateCw, Search, Send, SquareCheck, Star, Trash2, Upload, X, } from 'lucide-react';
import type { CommunityTemplate, NoteTemplate, NoteTemplateCategory } from '@shared/types';
import { buildTemplateLibraryExport, parseTemplateLibraryExport } from '@shared/note-templates';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Z_INDEX } from '../../lib/z-index';
import { createNoteFromTemplate } from '../../lib/template-notes';
import { compareTemplates, templateOrderValue, useNoteTemplates } from '../../store/note-templates';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button, IconButton, Kbd } from '../../components/primitives';
import { Field, Input, Select, Textarea } from '../../components/form';
import { Menu, Modal, Tooltip, confirm, useContextMenu, useDialogFocus, useEscape, useLockScroll, type MenuItem } from '../../components/overlay';
import { t } from '../../lib/i18n';

type GalleryFilter =
    | { kind: 'all' }
    | { kind: 'favorites' }
    | { kind: 'uncategorized' }
    | { kind: 'community' }
    | { kind: 'category'; id: string }
    | { kind: 'tag'; tag: string };

const GALLERY_PERSIST_KEY = 'inkstone.template-gallery.v1';

interface GalleryPersistedState {
    filter: GalleryFilter;
    query: string;
    selectMode: boolean;
}

function loadGalleryPersist(): GalleryPersistedState {
    const fallback: GalleryPersistedState = { filter: { kind: 'all' }, query: '', selectMode: false };
    try {
        const raw = localStorage.getItem(GALLERY_PERSIST_KEY);
        if (!raw) return fallback;
        const value = JSON.parse(raw) as Partial<GalleryPersistedState>;
        const filter = value.filter;
        if (!filter || !['all', 'favorites', 'uncategorized', 'community', 'category', 'tag'].includes(filter.kind)) return fallback;
        if (filter.kind === 'category' && typeof filter.id !== 'string') return fallback;
        if (filter.kind === 'tag' && typeof filter.tag !== 'string') return fallback;
        return {
            filter,
            query: typeof value.query === 'string' ? value.query.slice(0, 200) : '',
            selectMode: value.selectMode === true,
        };
    }
    catch {
        return fallback;
    }
}

interface TemplateDraft {
    name: string;
    description: string;
    content: string;
    categoryId: string | null;
    tags: string[];
}

const EMPTY_DRAFT: TemplateDraft = { name: '', description: '', content: '', categoryId: null, tags: [] };

function splitTagInput(value: string): string[] {
    // The fullwidth comma (\uFF0C) is the typographic default for Chinese input.
    return value.replaceAll('\uFF0C', ',').split(/[\s,]+/).filter(Boolean);
}

export function TemplateGallery({ onClose }: {
    onClose: () => void;
}) {
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
    const [moreOpen, setMoreOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [selectMode, setSelectMode] = useState(persisted.selectMode);
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
    const [batchMoving, setBatchMoving] = useState(false);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropHint, setDropHint] = useState<{ id: string; after: boolean } | null>(null);
    const [dropCategory, setDropCategory] = useState<string | null>(null);
    const [publishing, setPublishing] = useState<NoteTemplate | null>(null);
    const [community, setCommunity] = useState<CommunityTemplate[]>([]);
    const [communityLoading, setCommunityLoading] = useState(false);
    const [communityError, setCommunityError] = useState(false);
    const communityLoadedRef = useRef(false);
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

    const categories = useNoteTemplates((s) => s.categories);
    const templates = useNoteTemplates((s) => s.templates);
    const hydrated = useNoteTemplates((s) => s.hydrated);
    const hydrate = useNoteTemplates((s) => s.hydrate);
    const togglePin = useNoteTemplates((s) => s.toggleTemplatePin);
    const toggleStar = useNoteTemplates((s) => s.toggleTemplateStar);

    useEffect(() => {
        if (!hydrated)
            void hydrate().catch(() => {});
    }, [hydrated, hydrate]);

    useEffect(() => {
        localStorage.setItem(GALLERY_PERSIST_KEY, JSON.stringify({ filter, query, selectMode } satisfies GalleryPersistedState));
    }, [filter, query, selectMode]);

    useEffect(() => {
        if (!hydrated) return;
        setFilter((current) => {
            if (current.kind === 'category' && !categories.some((item) => item.id === current.id))
                return { kind: 'all' };
            if (current.kind === 'tag' && !templates.some((item) => item.tags.includes(current.tag)))
                return { kind: 'all' };
            return current;
        });
    }, [categories, hydrated, templates]);

    const refreshCommunity = useCallback(async () => {
        setCommunityLoading(true);
        setCommunityError(false);
        try {
            const { templates: items } = await api.communityTemplates.list();
            setCommunity(items);
        }
        catch {
            setCommunityError(true);
        }
        finally {
            setCommunityLoading(false);
        }
    }, []);

    useEffect(() => {
        if (filter.kind !== 'community' || communityLoadedRef.current) return;
        communityLoadedRef.current = true;
        void refreshCommunity();
    }, [filter.kind, refreshCommunity]);

    const counts = useMemo(() => {
        const byCategory = new Map<string, number>();
        const byTag = new Map<string, number>();
        let uncategorized = 0;
        let starred = 0;
        for (const template of templates) {
            if (template.categoryId === null) uncategorized++;
            else byCategory.set(template.categoryId, (byCategory.get(template.categoryId) ?? 0) + 1);
            if (template.isStarred) starred++;
            for (const tag of template.tags)
                byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
        }
        return { byCategory, byTag, uncategorized, starred };
    }, [templates]);

    const tagList = useMemo(() => [...counts.byTag.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [counts.byTag]);

    const visible = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        const matchesQuery = (template: NoteTemplate) => !normalized ||
            template.name.toLocaleLowerCase().includes(normalized) ||
            template.description.toLocaleLowerCase().includes(normalized) ||
            template.content.toLocaleLowerCase().includes(normalized) ||
            template.tags.some((tag) => tag.toLocaleLowerCase().includes(normalized));
        const list = templates.filter((template) => {
            if (filter.kind === 'favorites') return template.isStarred && matchesQuery(template);
            if (filter.kind === 'uncategorized') return template.categoryId === null && matchesQuery(template);
            if (filter.kind === 'community') return matchesQuery(template);
            if (filter.kind === 'category') return template.categoryId === filter.id && matchesQuery(template);
            if (filter.kind === 'tag') return template.tags.includes(filter.tag) && matchesQuery(template);
            return matchesQuery(template);
        });
        return [...list].sort(compareTemplates);
    }, [filter, query, templates]);

    const toggleTagFilter = useCallback((tag: string) => {
        setFilter((current) => current.kind === 'tag' && current.tag === tag
            ? { kind: 'all' }
            : { kind: 'tag', tag });
    }, []);

    const useTemplate = useCallback((template: NoteTemplate) => {
        void (async () => {
            const id = await createNoteFromTemplate(template);
            if (id)
                onClose();
        })();
    }, [onClose]);

    const exportLibrary = useCallback(() => {
        const state = useNoteTemplates.getState();
        const data = buildTemplateLibraryExport(state.categories, state.templates);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `inkstone-templates-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        useUi.getState().toast({ title: t("templates.exported_value0_templates", { value0: data.templates.length }), tone: 'success' });
    }, []);

    const copyLibraryJson = useCallback(() => {
        const state = useNoteTemplates.getState();
        const data = buildTemplateLibraryExport(state.categories, state.templates);
        const text = JSON.stringify(data, null, 2);
        if (navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(text).then(() => {
                useUi.getState().toast({ title: t("templates.copied_to_clipboard"), tone: 'success' });
            });
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        useUi.getState().toast({ title: t("templates.copied_to_clipboard"), tone: 'success' });
    }, []);

    const moreItems: MenuItem[] = [
        { id: 'export', label: t("templates.export_library"), icon: <Download size={13}/>, onSelect: exportLibrary },
        { id: 'copy-json', label: t("templates.copy_json"), icon: <Copy size={13}/>, onSelect: copyLibraryJson },
        { id: 'import', label: t("templates.import_templates"), icon: <Upload size={13}/>, separatorBefore: true, onSelect: () => setImportOpen(true) },
    ];

    const deleteTemplate = useCallback(async (template: NoteTemplate) => {
        const ok = await confirm({
            title: t("templates.delete_template"),
            description: t("templates.delete_template_confirm"),
            confirmLabel: t("templates.delete_template"),
            tone: 'danger',
        });
        if (ok)
            useNoteTemplates.getState().deleteTemplate(template.id);
    }, []);

    const deleteCategory = useCallback(async (category: NoteTemplateCategory) => {
        const ok = await confirm({
            title: t("templates.delete_category"),
            description: t("templates.delete_category_confirm", { value0: category.name }),
            confirmLabel: t("templates.delete_category"),
            tone: 'danger',
        });
        if (ok) {
            useNoteTemplates.getState().deleteCategory(category.id);
            setFilter((current) => current.kind === 'category' && current.id === category.id
                ? { kind: 'all' }
                : current);
        }
    }, []);

    const categoryName = useCallback((id: string | null) => {
        if (id === null) return t("templates.uncategorized");
        return categories.find((item) => item.id === id)?.name ?? t("templates.uncategorized");
    }, [categories]);

    const selectedTemplates = useMemo(() => templates.filter((item) => selectedIds.has(item.id)), [selectedIds, templates]);

    const exitSelectMode = useCallback(() => {
        setSelectedIds(new Set());
        setSelectMode(false);
        setFocusedId(null);
    }, []);

    const toggleSelectMode = useCallback(() => {
        setSelectMode((current) => !current);
        setSelectedIds(new Set());
        setFocusedId(null);
    }, []);

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const visibleSelected = useMemo(() => visible.filter((item) => selectedIds.has(item.id)), [selectedIds, visible]);
    const allVisibleSelected = visible.length > 0 && visibleSelected.length === visible.length;
    const allSelectedStarred = selectedTemplates.length > 0 && selectedTemplates.every((item) => item.isStarred);
    const hasDeletableSelection = selectedTemplates.some((item) => !item.builtin);

    const toggleSelectAll = useCallback(() => {
        setSelectedIds((current) => {
            if (visible.length > 0 && visible.every((item) => current.has(item.id)))
                return new Set();
            return new Set(visible.map((item) => item.id));
        });
    }, [visible]);

    const batchToggleStar = useCallback(() => {
        const store = useNoteTemplates.getState();
        const star = !allSelectedStarred;
        let changed = 0;
        for (const template of selectedTemplates) {
            if (template.isStarred !== star) {
                store.toggleTemplateStar(template.id);
                changed++;
            }
        }
        useUi.getState().toast({
            title: t(star ? "templates.batch_starred_value0" : "templates.batch_unstarred_value0", { value0: changed }),
            tone: 'success',
        });
    }, [allSelectedStarred, selectedTemplates]);

    const batchMove = useCallback((categoryId: string | null) => {
        const store = useNoteTemplates.getState();
        let moved = 0;
        for (const template of selectedTemplates) {
            if (template.categoryId !== categoryId && store.updateTemplate(template.id, { categoryId }))
                moved++;
        }
        setSelectedIds(new Set());
        setBatchMoving(false);
        useUi.getState().toast({ title: t("templates.batch_moved_value0", { value0: moved }), tone: 'success' });
    }, [selectedTemplates]);

    const batchDelete = useCallback(async () => {
        const deletable = selectedTemplates.filter((item) => !item.builtin);
        const ok = await confirm({
            title: t("templates.delete_template"),
            description: t("templates.batch_delete_confirm_value0", { value0: deletable.length }),
            confirmLabel: t("templates.delete_template"),
            tone: 'danger',
        });
        if (!ok)
            return;
        const store = useNoteTemplates.getState();
        let deleted = 0;
        for (const template of deletable) {
            if (store.deleteTemplate(template.id))
                deleted++;
        }
        setSelectedIds(new Set());
        useUi.getState().toast({ title: t("templates.batch_deleted_value0", { value0: deleted }), tone: 'success' });
    }, [selectedTemplates]);

    const handleCardDrop = useCallback((target: NoteTemplate, after: boolean) => {
        const source = templates.find((item) => item.id === draggingId);
        if (!source || source.id === target.id) {
            setDraggingId(null);
            setDropHint(null);
            return;
        }
        const siblings = templates
            .filter((item) => item.categoryId === target.categoryId && item.id !== source.id)
            .sort((a, b) => templateOrderValue(a) - templateOrderValue(b));
        let index = siblings.findIndex((item) => item.id === target.id);
        if (index < 0) index = siblings.length;
        if (after) index += 1;
        useNoteTemplates.getState().placeTemplate(source.id, target.categoryId, index);
        setDraggingId(null);
        setDropHint(null);
    }, [draggingId, templates]);

    const handleCategoryDrop = useCallback((categoryId: string | null) => {
        const source = templates.find((item) => item.id === draggingId);
        if (source) {
            const index = templates.filter((item) => item.categoryId === categoryId && item.id !== source.id).length;
            useNoteTemplates.getState().placeTemplate(source.id, categoryId, index);
        }
        setDraggingId(null);
        setDropHint(null);
        setDropCategory(null);
    }, [draggingId, templates]);

    const importCommunityTemplate = useCallback((item: CommunityTemplate) => {
        const match = categories.find((category) => category.name.toLocaleLowerCase() === item.category.toLocaleLowerCase());
        useNoteTemplates.getState().createTemplate({
            name: item.name,
            description: item.description,
            content: item.content,
            categoryId: match?.id ?? null,
            tags: item.tags,
        });
        useUi.getState().toast({ title: t("templates.community_imported"), tone: 'success' });
    }, [categories]);

    const useCommunityTemplate = useCallback((item: CommunityTemplate) => {
        void (async () => {
            const id = await createNoteFromTemplate({
                id: item.id,
                categoryId: null,
                name: item.name,
                description: item.description,
                content: item.content,
                tags: item.tags,
                builtin: false,
                isPinned: false,
                isStarred: false,
                createdAt: item.createdAt,
                updatedAt: item.createdAt,
            });
            if (id)
                onClose();
        })();
    }, [onClose]);

    const unpublishCommunityTemplate = useCallback(async (item: CommunityTemplate) => {
        const ok = await confirm({
            title: t("templates.community_unpublish"),
            description: t("templates.community_unpublish_confirm"),
            confirmLabel: t("templates.community_unpublish"),
            tone: 'danger',
        });
        if (!ok)
            return;
        try {
            await api.communityTemplates.remove(item.id);
            setCommunity((current) => current.filter((entry) => entry.id !== item.id));
            useUi.getState().toast({ title: t("templates.community_unpublished"), tone: 'success' });
        }
        catch {
            useUi.getState().toast({ title: t("common.action_failed"), tone: 'danger' });
        }
    }, []);

    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
        if (editing || renaming || moving || categoryDialog || importOpen || batchMoving || publishing || helpOpen)
            return;
        const target = event.target as HTMLElement;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable)
            return;
        if (event.key === '?') {
            event.preventDefault();
            setHelpOpen(true);
            return;
        }
        if (event.key === '/') {
            event.preventDefault();
            searchRef.current?.focus();
            return;
        }
        if (event.key === 's' || event.key === 'S') {
            event.preventDefault();
            toggleSelectMode();
            return;
        }
        if (event.key === 'a' || event.key === 'A') {
            event.preventDefault();
            if (!selectMode) {
                setSelectMode(true);
                setSelectedIds(new Set(visible.map((item) => item.id)));
            }
            else {
                toggleSelectAll();
            }
            return;
        }
        if (event.key === ' ' && selectMode) {
            const activeId = focusedId ?? (document.activeElement instanceof HTMLElement
                ? document.activeElement.closest('[data-template-id]')?.getAttribute('data-template-id')
                : null);
            if (activeId) {
                event.preventDefault();
                toggleSelect(activeId);
            }
            return;
        }
        if (visible.length === 0)
            return;
        const columns = gridRef.current
            ? getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').length
            : 1;
        const activeId = focusedId ?? (document.activeElement instanceof HTMLElement
            ? document.activeElement.closest('[data-template-id]')?.getAttribute('data-template-id')
            : null);
        const currentIndex = activeId ? visible.findIndex((item) => item.id === activeId) : -1;
        let nextIndex = -1;
        if (event.key === 'ArrowRight') nextIndex = currentIndex < 0 ? 0 : Math.min(visible.length - 1, currentIndex + 1);
        else if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : Math.min(visible.length - 1, currentIndex + columns);
        else if (event.key === 'ArrowLeft') nextIndex = currentIndex < 0 ? visible.length - 1 : Math.max(0, currentIndex - 1);
        else if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? visible.length - 1 : Math.max(0, currentIndex - columns);
        else return;
        event.preventDefault();
        const next = visible[nextIndex];
        if (!next)
            return;
        setFocusedId(next.id);
        requestAnimationFrame(() => {
            gridRef.current?.querySelector(`[data-template-id="${next.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
    }, [batchMoving, categoryDialog, editing, focusedId, helpOpen, importOpen, moving, publishing, renaming, selectMode, toggleSelect, toggleSelectAll, toggleSelectMode, visible]);

    return createPortal(<div className="app-viewport-fixed fixed z-[var(--z-palette)] flex items-end justify-center md:items-center md:p-6">
        <div className="anim-fade absolute inset-0 bg-[var(--scrim)]" onClick={onClose} aria-hidden="true"/>
        <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t("templates.template_library")} tabIndex={-1} onKeyDown={handleKeyDown} className="anim-pop relative flex h-[min(88dvh,var(--app-viewport-height,100dvh))] w-full max-w-[940px] flex-col overflow-hidden rounded-t-[var(--r-2xl)] border border-b-0 border-[var(--border-default)] bg-[var(--bg-overlay)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-modal)] outline-none md:rounded-[var(--r-2xl)] md:border-b md:pb-0">
            <header className="flex shrink-0 items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-2.5">
                <LayoutTemplate size={16} className="shrink-0 text-[var(--text-quaternary)]"/>
                <h2 className="shrink-0 text-[14px] font-semibold tracking-[-0.012em] text-[var(--text-primary)]">{t("templates.template_library")}</h2>
                <div className="relative min-w-0 flex-1">
                    <Search size={13} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--text-quaternary)]"/>
                    <input ref={searchRef} aria-label={t("templates.search_templates")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("templates.search_templates")} className="h-10 w-full rounded-[var(--r-md)] border border-transparent bg-[var(--bg-inset)] pr-8 pl-8 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-ring)] focus:outline-none"/>
                    {query && (<button type="button" aria-label={t("common.clear")} onClick={() => setQuery('')} className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]">
                        <X size={13}/>
                    </button>)}
                </div>
                <Tooltip label={t("templates.select_mode")}>
                    <IconButton label={t("templates.select_mode")} size="sm" active={selectMode} onClick={toggleSelectMode} className="shrink-0">
                        <SquareCheck size={15}/>
                    </IconButton>
                </Tooltip>
                <Tooltip label={t("templates.keyboard_shortcuts")}>
                    <IconButton label={t("templates.keyboard_shortcuts")} size="sm" onClick={() => setHelpOpen(true)} className="shrink-0">
                        <HelpCircle size={15}/>
                    </IconButton>
                </Tooltip>
                <Tooltip label={t("templates.new_template")}>
                    <Button size="sm" variant="primary" icon={<Plus size={14}/>} onClick={() => setEditing('new')} className="shrink-0">
                        <span className="hidden sm:inline">{t("templates.new_template")}</span>
                        <span className="sm:hidden">{t("common.new_note")}</span>
                    </Button>
                </Tooltip>
                <span className="hidden md:inline-flex"><Kbd keys={['Esc']}/></span>
                <Tooltip label={t("templates.export_library")} side="left">
                    <IconButton ref={moreButtonRef} label={t("templates.export_library")} size="sm" onClick={() => setMoreOpen(true)}>
                        <MoreHorizontal size={15}/>
                    </IconButton>
                </Tooltip>
                <Tooltip label={t("common.close")} side="left">
                    <IconButton label={t("common.close")} size="sm" onClick={onClose}>
                        <X size={15}/>
                    </IconButton>
                </Tooltip>
            </header>

            <div className="hidden shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-1.5 text-[10.5px] text-[var(--text-quaternary)] md:flex">
                <span>{t("templates.kbd_hint")}</span>
                {selectMode && <span className="text-[var(--accent)]">{t("templates.select_hint")}</span>}
            </div>

            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--border-subtle)] px-3 py-2 md:hidden">
                <FilterChip label={t("templates.all_templates")} count={templates.length} active={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}/>
                <FilterChip label={t("templates.favorites")} count={counts.starred} active={filter.kind === 'favorites'} onClick={() => setFilter({ kind: 'favorites' })}/>
                <FilterChip label={t("templates.community")} count={community.length} active={filter.kind === 'community'} onClick={() => setFilter({ kind: 'community' })}/>
                {counts.uncategorized > 0 && <FilterChip label={t("templates.uncategorized")} count={counts.uncategorized} active={filter.kind === 'uncategorized'} onClick={() => setFilter({ kind: 'uncategorized' })}/>}
                {categories.map((category) => (<FilterChip key={category.id} label={category.name} count={counts.byCategory.get(category.id) ?? 0} active={filter.kind === 'category' && filter.id === category.id} onClick={() => setFilter({ kind: 'category', id: category.id })} dropTarget={draggingId !== null && dropCategory === category.id} onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDropCategory(category.id);
                }} onDragLeave={() => setDropCategory((current) => current === category.id ? null : current)} onDrop={(event) => {
                    event.preventDefault();
                    handleCategoryDrop(category.id);
                }}/>))}
                {tagList.map(([tag, count]) => (<FilterChip key={`tag-${tag}`} label={`#${tag}`} count={count} active={filter.kind === 'tag' && filter.tag === tag} onClick={() => toggleTagFilter(tag)}/>))}
                <FilterChip label={t("templates.new_category")} count={null} active={false} onClick={() => setCategoryDialog({ mode: 'create' })}/>
            </div>

            <div className="flex min-h-0 flex-1">
                <aside aria-label={t("templates.categories")} className="hidden w-[218px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border-subtle)] p-2 md:flex">
                    <SidebarButton icon={<LayoutTemplate size={14}/>} label={t("templates.all_templates")} count={templates.length} active={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}/>
                    <SidebarButton icon={<Star size={14}/>} label={t("templates.favorites")} count={counts.starred} active={filter.kind === 'favorites'} onClick={() => setFilter({ kind: 'favorites' })}/>
                    <SidebarButton icon={<Globe size={14}/>} label={t("templates.community")} count={community.length} active={filter.kind === 'community'} onClick={() => setFilter({ kind: 'community' })}/>
                    {counts.uncategorized > 0 && <SidebarButton icon={<FolderPlus size={14}/>} label={t("templates.uncategorized")} count={counts.uncategorized} active={filter.kind === 'uncategorized'} onClick={() => setFilter({ kind: 'uncategorized' })}/>}
                    <div className="mt-3 mb-1 flex items-center justify-between px-2">
                        <span className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">{t("templates.categories")}</span>
                        <Tooltip label={t("templates.new_category")} side="right">
                            <button type="button" aria-label={t("templates.new_category")} onClick={() => setCategoryDialog({ mode: 'create' })} className="flex size-6 items-center justify-center rounded-md text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
                                <Plus size={13}/>
                            </button>
                        </Tooltip>
                    </div>
                    <div className="space-y-0.5">
                        {categories.map((category) => (<CategoryRow key={category.id} category={category} count={counts.byCategory.get(category.id) ?? 0} active={filter.kind === 'category' && filter.id === category.id} dropTarget={draggingId !== null && dropCategory === category.id} onSelect={() => setFilter({ kind: 'category', id: category.id })} onRename={() => setCategoryDialog({ mode: 'rename', category })} onDelete={() => void deleteCategory(category)} onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setDropCategory(category.id);
                        }} onDragLeave={() => setDropCategory((current) => current === category.id ? null : current)} onDrop={(event) => {
                            event.preventDefault();
                            handleCategoryDrop(category.id);
                        }}/>))}
                    </div>
                    {tagList.length > 0 && (<>
                        <div className="mt-3 mb-1 px-2 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">{t("templates.tags")}</div>
                        <div className="space-y-0.5">
                            {tagList.map(([tag, count]) => (<SidebarButton key={tag} icon={<Hash size={14}/>} label={tag} count={count} active={filter.kind === 'tag' && filter.tag === tag} onClick={() => toggleTagFilter(tag)}/>))}
                        </div>
                    </>)}
                    <button type="button" onClick={() => setCategoryDialog({ mode: 'create' })} className="mt-2 flex h-8 w-full items-center gap-1.5 rounded-[var(--r-md)] px-2 text-[12px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
                        <Plus size={13}/>{t("templates.new_category")}
                    </button>
                </aside>

                <main className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
                    {filter.kind === 'community' && <CommunityPanel items={community} loading={communityLoading} error={communityError} myId={currentUserId} onRefresh={() => void refreshCommunity()} onUse={useCommunityTemplate} onImport={importCommunityTemplate} onUnpublish={(item) => void unpublishCommunityTemplate(item)}/>}
                    {filter.kind !== 'community' && visible.some((item) => item.isPinned) && (<div className="mb-3 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
                        <Pin size={11}/>{t("notes.pin")}
                    </div>)}
                    {filter.kind !== 'community' && visible.length === 0 ? (<div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
                        <LayoutTemplate size={26} className="text-[var(--text-quaternary)]"/>
                        <p className="text-[13px] font-medium text-[var(--text-secondary)]">
                            {query.trim() ? t("templates.no_matching_templates") : t("templates.no_templates")}
                        </p>
                        <p className="text-[11.5px] text-[var(--text-quaternary)]">{t("templates.no_templates_hint")}</p>
                    </div>) : filter.kind !== 'community' && (<div ref={gridRef} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                        {visible.map((template) => (<TemplateCard key={template.id} template={template} categoryName={categoryName(template.categoryId)} selectMode={selectMode} selected={selectedIds.has(template.id)} focused={focusedId === template.id} dragging={draggingId === template.id} dropHint={dropHint?.id === template.id ? dropHint.after : null} onToggleSelect={() => toggleSelect(template.id)} onDragStart={(id) => setDraggingId(id)} onDragOver={(id, after) => setDropHint({ id, after })} onDrop={(template, after) => handleCardDrop(template, after)} onDragEnd={() => {
                            setDraggingId(null);
                            setDropHint(null);
                        }} onUse={() => useTemplate(template)} onEdit={() => setEditing(template)} onRename={() => setRenaming(template)} onDuplicate={() => useNoteTemplates.getState().duplicateTemplate(template.id)} onMove={() => setMoving(template)} onDelete={() => void deleteTemplate(template)} onPublish={() => setPublishing(template)} onTogglePin={() => togglePin(template.id)} onToggleStar={() => toggleStar(template.id)}/>))}
                    </div>)}
                </main>
            </div>

            {selectMode && (<div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-overlay)] px-4 py-2.5">
                <span className="text-[12.5px] font-semibold text-[var(--text-secondary)]">{t("templates.selected_count_value0", { value0: selectedIds.size })}</span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={toggleSelectAll}>{allVisibleSelected ? t("templates.clear_selection") : t("templates.select_all")}</Button>
                    <Button size="sm" variant="secondary" icon={<Star size={13}/>} disabled={selectedIds.size === 0} onClick={batchToggleStar}>{allSelectedStarred ? t("common.remove_from_favorites") : t("navigation.favorites")}</Button>
                    <Button size="sm" variant="secondary" icon={<FolderPlus size={13}/>} disabled={selectedIds.size === 0} onClick={() => setBatchMoving(true)}>{t("templates.move_to_category")}</Button>
                    <Button size="sm" variant="danger" icon={<Trash2 size={13}/>} disabled={!hasDeletableSelection} onClick={() => void batchDelete()}>{t("templates.delete_template")}</Button>
                    <Button size="sm" variant="ghost" onClick={exitSelectMode}>{t("templates.exit_select_mode")}</Button>
                </div>
            </div>)}
        </div>

        {editing && <TemplateEditorModal template={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)}/>}
        {renaming && <TemplateRenameDialog template={renaming} onClose={() => setRenaming(null)}/>}
        {moving && <MoveTemplateDialog template={moving} categories={categories} onClose={() => setMoving(null)}/>}
        {categoryDialog && <CategoryDialog dialog={categoryDialog} onClose={() => setCategoryDialog(null)}/>}
        {importOpen && <ImportTemplatesModal onClose={() => setImportOpen(false)}/>}
        {batchMoving && <BatchMoveDialog categories={categories} onMove={batchMove} onClose={() => setBatchMoving(false)}/>}
        {helpOpen && <KeyboardHelpModal onClose={() => setHelpOpen(false)}/>}
        {publishing && <PublishTemplateDialog template={publishing} category={publishing.categoryId === null ? t("templates.uncategorized") : categoryName(publishing.categoryId)} onClose={() => setPublishing(null)} onPublished={() => {
            setPublishing(null);
            if (filter.kind === 'community') void refreshCommunity();
        }}/>}
        <Menu anchor={moreButtonRef} open={moreOpen} onClose={() => setMoreOpen(false)} items={moreItems} align="end" width={200} zIndex={Z_INDEX.menuHigh}/>
    </div>, document.body);
}

function FilterChip({ label, count, active, onClick, dropTarget, onDragOver, onDragLeave, onDrop }: {
    label: string;
    count: number | null;
    active: boolean;
    onClick: () => void;
    dropTarget?: boolean;
    onDragOver?: (event: React.DragEvent) => void;
    onDragLeave?: () => void;
    onDrop?: (event: React.DragEvent) => void;
}) {
    return (<button type="button" aria-pressed={active} onClick={onClick} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={cn('flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] transition-colors', active ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]', dropTarget && 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]')}>
        {count === null && <Plus size={11}/>}
        <span className="whitespace-nowrap">{label}</span>
        {count !== null && <span className="text-[10.5px] tabular opacity-70">{count}</span>}
    </button>);
}

function SidebarButton({ icon, label, count, active, onClick }: {
    icon: React.ReactNode;
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
}) {
    return (<button type="button" aria-pressed={active} onClick={onClick} className={cn('flex h-9 w-full items-center gap-2.5 rounded-[var(--r-md)] px-2 text-left text-[12.5px] transition-colors', active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')}>
        <span className={cn('shrink-0', active ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]')}>{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-[11px] tabular text-[var(--text-quaternary)]">{count}</span>
    </button>);
}

function CategoryRow({ category, count, active, dropTarget, onSelect, onRename, onDelete, onDragOver, onDragLeave, onDrop }: {
    category: NoteTemplateCategory;
    count: number;
    active: boolean;
    dropTarget?: boolean;
    onSelect: () => void;
    onRename: () => void;
    onDelete: () => void;
    onDragOver?: (event: React.DragEvent) => void;
    onDragLeave?: () => void;
    onDrop?: (event: React.DragEvent) => void;
}) {
    return (<div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={cn('group flex h-9 items-center rounded-[var(--r-md)] transition-colors', active || dropTarget ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-hover)]')}>
        <button type="button" aria-pressed={active} onClick={onSelect} className={cn('flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-[var(--r-md)] px-2 text-left text-[12.5px] transition-colors', active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]')}>
            <span className={cn('text-[13px] leading-none', active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]')}>◈</span>
            <span className="min-w-0 flex-1 truncate">{category.name}</span>
            <span className="shrink-0 text-[11px] tabular text-[var(--text-quaternary)]">{count}</span>
        </button>
        {!category.builtin && (<div className="flex shrink-0 items-center pr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Tooltip label={t("templates.rename_category")} side="top">
                <IconButton label={t("templates.rename_category")} size="sm" onClick={onRename} className="size-6 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]">
                    <Pencil size={11}/>
                </IconButton>
            </Tooltip>
            <Tooltip label={t("templates.delete_category")} side="top">
                <IconButton label={t("templates.delete_category")} size="sm" onClick={onDelete} className="size-6 text-[var(--text-quaternary)] hover:text-[var(--danger)]">
                    <Trash2 size={11}/>
                </IconButton>
            </Tooltip>
        </div>)}
    </div>);
}

function TemplateCard({ template, categoryName, selectMode, selected, focused, dragging, dropHint, onToggleSelect, onDragStart, onDragOver, onDrop, onDragEnd, onUse, onEdit, onRename, onDuplicate, onMove, onDelete, onPublish, onTogglePin, onToggleStar }: {
    template: NoteTemplate;
    categoryName: string;
    selectMode: boolean;
    selected: boolean;
    focused: boolean;
    dragging?: boolean;
    dropHint?: boolean | null;
    onToggleSelect: () => void;
    onDragStart?: (id: string) => void;
    onDragOver?: (id: string, after: boolean) => void;
    onDrop?: (template: NoteTemplate, after: boolean) => void;
    onDragEnd?: () => void;
    onUse: () => void;
    onEdit: () => void;
    onRename: () => void;
    onDuplicate: () => void;
    onMove: () => void;
    onDelete: () => void;
    onPublish: () => void;
    onTogglePin: () => void;
    onToggleStar: () => void;
}) {
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const useButtonRef = useRef<HTMLButtonElement>(null);
    const contextMenu = useContextMenu();
    const [menuOpen, setMenuOpen] = useState(false);
    useEffect(() => {
        if (focused)
            useButtonRef.current?.focus({ preventScroll: true });
    }, [focused]);
    const lineCount = useMemo(() => template.content.split('\n').filter((line) => line.trim()).length, [template.content]);
    const items: MenuItem[] = [
        { id: 'edit', label: t("templates.edit_template"), icon: <Pencil size={13}/>, onSelect: onEdit },
        { id: 'rename', label: t("templates.rename_template"), icon: <FilePlus2 size={13}/>, onSelect: onRename },
        { id: 'duplicate', label: t("templates.duplicate_template"), icon: <Copy size={13}/>, onSelect: onDuplicate },
        {
            id: 'move',
            label: t("templates.move_to_category"),
            icon: <FolderPlus size={13}/>,
            separatorBefore: true,
            onSelect: onMove,
        },
        { id: 'publish', label: t("templates.publish_to_community"), icon: <Send size={13}/>, onSelect: onPublish },
        ...(!template.builtin
            ? [{
                id: 'delete',
                label: t("templates.delete_template"),
                icon: <Trash2 size={13}/>,
                tone: 'danger' as const,
                separatorBefore: true,
                onSelect: onDelete,
            }]
            : []),
    ];
    return (<div onContextMenu={(event) => {
        setMenuOpen(false);
        contextMenu.onContextMenu(event);
    }} data-template-id={template.id} draggable={!selectMode} onDragStart={(event) => {
        if (selectMode) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.setData('application/x-inkstone-template', template.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart?.(template.id);
    }} onDragOver={(event) => {
        if (dragging || selectMode) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const rect = event.currentTarget.getBoundingClientRect();
        onDragOver?.(template.id, event.clientY > rect.top + rect.height / 2);
    }} onDrop={(event) => {
        if (selectMode) return;
        event.preventDefault();
        onDrop?.(template, dropHint === true);
    }} onDragEnd={onDragEnd} className={cn('group relative flex min-h-[132px] flex-col rounded-[var(--r-lg)] border bg-[var(--bg-surface)] p-3.5 transition-[border-color,box-shadow,transform] duration-[var(--dur-fast)]', selectMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing', dragging && 'opacity-50', selected ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-sm)]' : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]', focused && 'ring-1 ring-[var(--accent)]', dropHint === true && 'shadow-[0_3px_0_0_var(--accent)]', dropHint === false && 'shadow-[0_-3px_0_0_var(--accent)]')}>
        <button ref={useButtonRef} type="button" onClick={(event) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                onToggleStar();
                return;
            }
            if (selectMode) {
                onToggleSelect();
                return;
            }
            onUse();
        }} aria-pressed={selectMode ? selected : undefined} aria-label={selectMode ? `${t("templates.select_template")}: ${template.name}` : `${t("templates.use_template")}: ${template.name}`} className="absolute inset-0 z-[var(--z-flat)] rounded-[var(--r-lg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"/>
        {selectMode && (<span aria-hidden="true" className="absolute top-3 left-3 z-[var(--z-menu)] flex size-4 items-center justify-center rounded border bg-[var(--bg-overlay)]">
            {selected && <Check size={12} className="text-[var(--accent)]"/>}
        </span>)}
        <div className="relative z-[var(--z-sticky)] flex items-start justify-between gap-2">
            <div className={cn('flex min-w-0 items-center gap-1.5', selectMode && 'pl-6')}>
                {template.isPinned && <Pin size={11} className="shrink-0 text-[var(--accent)]"/>}
                <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{template.name}</h3>
                {template.isStarred && <Star size={11} className="shrink-0 fill-current text-[var(--warning)]"/>}
                {template.builtin && <span className="shrink-0 rounded-full bg-[var(--bg-raised)] px-1.5 py-px text-[10px] font-medium text-[var(--text-quaternary)]">{t("templates.builtin")}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                <Tooltip label={template.isStarred ? t("common.remove_from_favorites") : t("navigation.favorites")} side="top">
                    <IconButton label={t("navigation.favorites")} size="sm" active={template.isStarred} onClick={(event) => {
                        event.stopPropagation();
                        onToggleStar();
                    }} className="size-6 text-[var(--text-tertiary)]">
                        {template.isStarred ? <Star size={12} className="fill-current"/> : <Star size={12}/>}
                    </IconButton>
                </Tooltip>
                <Tooltip label={template.isPinned ? t("notes.unpin") : t("notes.pin")} side="top">
                    <IconButton label={t("notes.pin")} size="sm" active={template.isPinned} onClick={(event) => {
                        event.stopPropagation();
                        onTogglePin();
                    }} className="size-6 text-[var(--text-tertiary)]">
                        {template.isPinned ? <PinOff size={12}/> : <Pin size={12}/>}
                    </IconButton>
                </Tooltip>
                <Tooltip label={t("common.more_actions")} side="top">
                    <IconButton ref={menuButtonRef} label={t("common.more_actions")} size="sm" onClick={(event) => {
                        event.stopPropagation();
                        setMenuOpen(true);
                    }} className="size-6 text-[var(--text-tertiary)]">
                        <MoreHorizontal size={13}/>
                    </IconButton>
                </Tooltip>
            </div>
        </div>
        {template.description && <p className="relative z-[var(--z-sticky)] mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">{template.description}</p>}
        {template.tags.length > 0 && (<div className="relative z-[var(--z-sticky)] mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
            {template.tags.map((tag) => (<span key={tag} className="rounded-full bg-[var(--bg-raised)] px-1.5 py-px text-[10px] text-[var(--text-tertiary)]">#{tag}</span>))}
        </div>)}
        <div className="relative z-[var(--z-sticky)] mt-auto flex items-center gap-2 pt-2.5">
            <span className="text-[10.5px] text-[var(--text-quaternary)]">{categoryName}</span>
            <span className="text-[10.5px] text-[var(--text-quaternary)]">·</span>
            <span className="text-[10.5px] text-[var(--text-quaternary)]">{t("templates.lines_count", { value0: lineCount })}</span>
            <span className="ml-auto text-[10.5px] font-medium text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100">{t("templates.use_template")} →</span>
        </div>
        <Menu anchor={menuButtonRef} open={menuOpen} onClose={() => setMenuOpen(false)} items={items} align="end" width={200} zIndex={Z_INDEX.hoverPinned}/>
        {contextMenu.point && <Menu anchor={contextMenu.point} open onClose={contextMenu.close} items={items} width={200} zIndex={Z_INDEX.hoverPinned}/>}
    </div>);
}

function TemplateEditorModal({ template, categories, onClose }: {
    template: NoteTemplate | null;
    categories: NoteTemplateCategory[];
    onClose: () => void;
}) {
    const [draft, setDraft] = useState<TemplateDraft>(template
        ? { name: template.name, description: template.description, content: template.content, categoryId: template.categoryId, tags: template.tags }
        : EMPTY_DRAFT);
    const [error, setError] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    useEffect(() => { nameRef.current?.focus(); }, []);
    const save = () => {
        if (!draft.name.trim()) {
            setError(true);
            return;
        }
        if (template)
            useNoteTemplates.getState().updateTemplate(template.id, draft);
        else
            useNoteTemplates.getState().createTemplate(draft);
        onClose();
    };
    return (<Modal open onClose={onClose} title={template ? t("templates.edit_template") : t("templates.create_template")} width={680} footer={<>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={save}>{template ? t("common.save") : t("templates.create_template")}</Button>
        </>}>
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("templates.template_name")} required>
                    <Input ref={nameRef} invalid={error} value={draft.name} onChange={(event) => {
                        setDraft({ ...draft, name: event.target.value });
                        setError(false);
                    }} placeholder={t("templates.template_name")}/>
                </Field>
                <Field label={t("templates.category")}>
                    <Select value={draft.categoryId ?? ''} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value || null })}>
                        <option value="">{t("templates.uncategorized")}</option>
                        {categories.map((category) => (<option key={category.id} value={category.id}>{category.name}</option>))}
                    </Select>
                </Field>
            </div>
            <Field label={t("templates.tags")} hint={t("templates.tag_hint")}>
                <Input value={draft.tags.join(', ')} onChange={(event) => setDraft({ ...draft, tags: splitTagInput(event.target.value) })} placeholder={t("templates.tag_hint")}/>
            </Field>
            <Field label={t("templates.description")}>
                <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t("templates.description")}/>
            </Field>
            <Field label={t("templates.template_content")} hint={t("templates.template_content_hint")}>
                <Textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} rows={16} spellCheck={false} className="min-h-[280px] font-mono text-[12.5px]"/>
            </Field>
        </div>
    </Modal>);
}

function TemplateRenameDialog({ template, onClose }: {
    template: NoteTemplate;
    onClose: () => void;
}) {
    const [name, setName] = useState(template.name);
    const [error, setError] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); }, []);
    const save = () => {
        if (!name.trim()) {
            setError(true);
            return;
        }
        useNoteTemplates.getState().updateTemplate(template.id, { name });
        onClose();
    };
    return (<Modal open onClose={onClose} title={t("templates.rename_template")} width={420} footer={<>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={save}>{t("common.save")}</Button>
        </>}>
        <Field label={t("templates.template_name")} required>
            <Input ref={inputRef} invalid={error} value={name} onChange={(event) => {
                setName(event.target.value);
                setError(false);
            }} onKeyDown={(event) => { if (event.key === 'Enter') save(); }} placeholder={t("templates.template_name")}/>
        </Field>
    </Modal>);
}

function MoveTemplateDialog({ template, categories, onClose }: {
    template: NoteTemplate;
    categories: NoteTemplateCategory[];
    onClose: () => void;
}) {
    const move = (categoryId: string | null) => {
        if (categoryId !== template.categoryId)
            useNoteTemplates.getState().updateTemplate(template.id, { categoryId });
        onClose();
    };
    return (<Modal open onClose={onClose} title={t("templates.move_to_category")} width={420}>
        <div className="space-y-1">
            <MoveChoice label={t("templates.uncategorized")} selected={template.categoryId === null} onClick={() => move(null)}/>
            {categories.map((category) => (<MoveChoice key={category.id} label={category.name} selected={template.categoryId === category.id} onClick={() => move(category.id)}/>))}
        </div>
    </Modal>);
}

function MoveChoice({ label, selected, onClick }: {
    label: string;
    selected: boolean;
    onClick: () => void;
}) {
    return (<button type="button" aria-pressed={selected} onClick={onClick} className={cn('flex min-h-10 w-full items-center gap-2.5 rounded-[var(--r-md)] px-2.5 text-left text-[13px] transition-colors', selected ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]')}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {selected && <Check size={14} className="shrink-0"/>}
    </button>);
}

function CategoryDialog({ dialog, onClose }: {
    dialog: { mode: 'create' } | { mode: 'rename'; category: NoteTemplateCategory };
    onClose: () => void;
}) {
    const [name, setName] = useState(dialog.mode === 'rename' ? dialog.category.name : '');
    const [error, setError] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { inputRef.current?.focus(); }, []);
    const save = () => {
        if (!name.trim()) {
            setError(true);
            return;
        }
        if (dialog.mode === 'rename')
            useNoteTemplates.getState().renameCategory(dialog.category.id, name);
        else
            useNoteTemplates.getState().createCategory(name);
        onClose();
    };
    return (<Modal open onClose={onClose} title={dialog.mode === 'rename' ? t("templates.rename_category") : t("templates.new_category")} width={420} footer={<>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={save}>{t("common.save")}</Button>
        </>}>
        <Field label={t("templates.category_name")} required>
            <Input ref={inputRef} invalid={error} value={name} onChange={(event) => {
                setName(event.target.value);
                setError(false);
            }} onKeyDown={(event) => { if (event.key === 'Enter') save(); }} placeholder={t("templates.category_name")}/>
        </Field>
    </Modal>);
}

function ImportTemplatesModal({ onClose }: {
    onClose: () => void;
}) {
    const [text, setText] = useState('');
    const [error, setError] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const importJson = () => {
        const data = parseTemplateLibraryExport(text);
        if (!data) {
            setError(true);
            return;
        }
        const { imported, skipped } = useNoteTemplates.getState().importTemplates(data);
        useUi.getState().toast({
            title: t("templates.imported_value0_skipped_value1", { value0: imported, value1: skipped }),
            tone: 'success',
        });
        onClose();
    };
    const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            setText(String(reader.result ?? ''));
            setError(false);
        };
        reader.readAsText(file);
        event.target.value = '';
    };
    return (<Modal open onClose={onClose} title={t("templates.import_title")} width={560} footer={<>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={importJson}>{t("templates.import_templates")}</Button>
        </>}>
        <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-[var(--text-tertiary)]">{t("templates.import_hint")}</p>
            <Textarea value={text} aria-invalid={error} onChange={(event) => {
                setText(event.target.value);
                setError(false);
            }} rows={10} spellCheck={false} placeholder={t("templates.import_paste_placeholder")} className="min-h-[180px] font-mono text-[12px]"/>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={pickFile}/>
            <Button variant="secondary" icon={<Upload size={13}/>} onClick={() => fileRef.current?.click()}>{t("templates.import_file")}</Button>
        </div>
    </Modal>);
}

function BatchMoveDialog({ categories, onMove, onClose }: {
    categories: NoteTemplateCategory[];
    onMove: (categoryId: string | null) => void;
    onClose: () => void;
}) {
    return (<Modal open onClose={onClose} title={t("templates.move_to_category")} width={420}>
        <div className="space-y-1">
            <MoveChoice label={t("templates.uncategorized")} selected={false} onClick={() => onMove(null)}/>
            {categories.map((category) => (<MoveChoice key={category.id} label={category.name} selected={false} onClick={() => onMove(category.id)}/>))}
        </div>
    </Modal>);
}

function CommunityPanel({ items, loading, error, myId, onRefresh, onUse, onImport, onUnpublish }: {
    items: CommunityTemplate[];
    loading: boolean;
    error: boolean;
    myId: string | undefined;
    onRefresh: () => void;
    onUse: (item: CommunityTemplate) => void;
    onImport: (item: CommunityTemplate) => void;
    onUnpublish: (item: CommunityTemplate) => void;
}) {
    if (loading && items.length === 0)
        return (<div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (<div key={index} className="min-h-[132px] animate-pulse rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-raised)]"/>))}
        </div>);
    if (error && items.length === 0)
        return (<div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
            <Globe size={26} className="text-[var(--text-quaternary)]"/>
            <p className="text-[13px] font-medium text-[var(--text-secondary)]">{t("templates.community_load_failed")}</p>
            <Button size="sm" variant="secondary" icon={<RotateCw size={13}/>} onClick={onRefresh}>{t("common.retry")}</Button>
        </div>);
    if (items.length === 0)
        return (<div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
            <Globe size={26} className="text-[var(--text-quaternary)]"/>
            <p className="text-[13px] font-medium text-[var(--text-secondary)]">{t("templates.community_empty")}</p>
            <p className="text-[11.5px] text-[var(--text-quaternary)]">{t("templates.community_empty_hint")}</p>
        </div>);
    return (<div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-[var(--text-quaternary)]">{t("templates.community_count_value0", { value0: items.length })}</p>
            <Button size="sm" variant="ghost" icon={<RotateCw size={13}/>} disabled={loading} onClick={onRefresh}>{t("common.refresh")}</Button>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (<CommunityCard key={item.id} item={item} mine={item.authorId === myId} onUse={() => onUse(item)} onImport={() => onImport(item)} onUnpublish={() => onUnpublish(item)}/>))}
        </div>
    </div>);
}

function CommunityCard({ item, mine, onUse, onImport, onUnpublish }: {
    item: CommunityTemplate;
    mine: boolean;
    onUse: () => void;
    onImport: () => void;
    onUnpublish: () => void;
}) {
    const lineCount = useMemo(() => item.content.split('\n').filter((line) => line.trim()).length, [item.content]);
    const date = useMemo(() => new Date(item.createdAt).toLocaleDateString(), [item.createdAt]);
    return (<div className="group relative flex min-h-[132px] flex-col rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 transition-[border-color,box-shadow] duration-[var(--dur-fast)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]">
        <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{item.name}</h3>
            {mine && <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-1.5 py-px text-[10px] font-medium text-[var(--accent)]">{t("templates.community_mine")}</span>}
        </div>
        {item.description && <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">{item.description}</p>}
        {item.tags.length > 0 && (<div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
            {item.tags.map((tag) => (<span key={tag} className="rounded-full bg-[var(--bg-raised)] px-1.5 py-px text-[10px] text-[var(--text-tertiary)]">#{tag}</span>))}
        </div>)}
        <div className="relative z-[var(--z-sticky)] mt-auto flex items-center gap-2 pt-2.5">
            <span className="text-[10.5px] text-[var(--text-quaternary)]">{item.authorName}</span>
            {item.category && <span className="text-[10.5px] text-[var(--text-quaternary)]">· {item.category}</span>}
            <span className="text-[10.5px] text-[var(--text-quaternary)]">· {t("templates.lines_count", { value0: lineCount })} · {date}</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
            <Button size="sm" variant="primary" icon={<FilePlus2 size={13}/>} onClick={onUse} className="min-w-0 flex-1">{t("templates.use_template")}</Button>
            <Tooltip label={t("templates.community_import")}>
                <IconButton label={t("templates.community_import")} size="sm" onClick={onImport}>
                    <Download size={13}/>
                </IconButton>
            </Tooltip>
            {mine && (<Tooltip label={t("templates.community_unpublish")}>
                <IconButton label={t("templates.community_unpublish")} size="sm" onClick={onUnpublish} className="text-[var(--text-tertiary)] hover:text-[var(--danger)]">
                    <Trash2 size={13}/>
                </IconButton>
            </Tooltip>)}
        </div>
    </div>);
}

function KeyboardHelpModal({ onClose }: {
    onClose: () => void;
}) {
    const rows: { label: string; keys: string[] }[] = [
        { label: t("templates.help_move"), keys: ['↑', '↓', '←', '→'] },
        { label: t("templates.help_use"), keys: ['Enter'] },
        { label: t("templates.help_star"), keys: ['Ctrl/⌘', 'Click'] },
        { label: t("templates.help_search"), keys: ['/'] },
        { label: t("templates.help_tab"), keys: ['Tab'] },
        { label: t("templates.help_esc"), keys: ['Esc'] },
        { label: t("templates.help_help"), keys: ['?'] },
    ];
    const selectRows: { label: string; keys: string[] }[] = [
        { label: t("templates.help_select_mode"), keys: ['s'] },
        { label: t("templates.help_select_click"), keys: ['Click'] },
        { label: t("templates.help_select_focused"), keys: ['Space'] },
        { label: t("templates.help_select_all"), keys: ['a'] },
    ];
    return (<Modal open onClose={onClose} title={t("templates.keyboard_shortcuts")} width={440}>
        <div className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row) => (<div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[12.5px] text-[var(--text-secondary)]">{row.label}</span>
                <Kbd keys={row.keys}/>
            </div>))}
            <div className="pt-2.5 pb-1 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">{t("templates.help_select_section")}</div>
            {selectRows.map((row) => (<div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[12.5px] text-[var(--text-secondary)]">{row.label}</span>
                <Kbd keys={row.keys}/>
            </div>))}
        </div>
    </Modal>);
}

function PublishTemplateDialog({ template, category, onClose, onPublished }: {
    template: NoteTemplate;
    category: string;
    onClose: () => void;
    onPublished: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const publish = async () => {
        if (busy)
            return;
        setBusy(true);
        try {
            await api.communityTemplates.publish({
                name: template.name,
                description: template.description,
                content: template.content,
                tags: template.tags,
                category,
            });
            useUi.getState().toast({ title: t("templates.community_published"), tone: 'success' });
            onPublished();
        }
        catch {
            useUi.getState().toast({ title: t("common.action_failed"), tone: 'danger' });
        }
        finally {
            setBusy(false);
        }
    };
    return (<Modal open onClose={onClose} title={t("templates.publish_to_community")} width={600} footer={<>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" icon={<Send size={13}/>} loading={busy} onClick={() => void publish()}>{t("templates.publish_to_community")}</Button>
        </>}>
        <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-[var(--text-tertiary)]">{t("templates.publish_hint")}</p>
            <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-3">
                <div className="flex items-center gap-1.5">
                    <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">{template.name}</h3>
                    <span className="shrink-0 text-[10.5px] text-[var(--text-quaternary)]">{category}</span>
                </div>
                {template.tags.length > 0 && (<div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {template.tags.map((tag) => (<span key={tag} className="rounded-full bg-[var(--bg-raised)] px-1.5 py-px text-[10px] text-[var(--text-tertiary)]">#{tag}</span>))}
                </div>)}
                {template.description && <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--text-tertiary)]">{template.description}</p>}
                <pre className="mt-2 max-h-[220px] overflow-y-auto text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{template.content}</pre>
            </div>
        </div>
    </Modal>);
}
