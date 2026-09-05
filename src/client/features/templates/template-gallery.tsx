import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, FolderPlus, Globe, Hash, LayoutTemplate, Pin, Plus, Star, Trash2, Upload } from 'lucide-react';
import type { CommunityTemplate, NoteTemplate, NoteTemplateCategory } from '@shared/types';
import { api } from '../../lib/api';
import { Z_INDEX } from '../../lib/z-index';
import { createNoteFromTemplate } from '../../lib/template-notes';
import { compareTemplates, templateOrderValue, useNoteTemplates } from '../../store/note-templates';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { Button } from '../../components/primitives';
import { Menu, Tooltip, confirm, useDialogFocus, useEscape, useLockScroll, type MenuItem } from '../../components/overlay';
import { t } from '../../lib/i18n';
import { GALLERY_PERSIST_KEY, loadGalleryPersist, type GalleryFilter, type GalleryPersistedState } from './gallery-persist';
import { exportTemplateLibrary, copyTemplateLibraryJson } from './gallery-export';
import { useGalleryKeyboard } from './gallery-keyboard';
import { GalleryHeader } from './gallery-header';
import { FilterChip, SidebarButton, CategoryRow } from './gallery-controls';
import { TemplateCard } from './template-card';
import { TemplateEditorModal, TemplateRenameDialog, MoveTemplateDialog, CategoryDialog, ImportTemplatesModal, BatchMoveDialog } from './gallery-modals';
import { CommunityPanel } from './community-panel';
import { KeyboardHelpModal, PublishTemplateDialog } from './misc-modals';


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
    const [community, setCommunity] = useState<CommunityTemplate[]>([]);
    const [isCommunityLoading, setIsCommunityLoading] = useState(false);
    const [isCommunityError, setIsCommunityError] = useState(false);
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
        setIsBatchMoving(false);
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

    const moreItems: MenuItem[] = [
        { id: 'export', label: t("templates.export_library"), icon: <Download size={13}/>, onSelect: () => exportTemplateLibrary() },
        { id: 'copy-json', label: t("templates.copy_json"), icon: <Copy size={13}/>, onSelect: () => void copyTemplateLibraryJson() },
        { id: 'import', label: t("templates.import_templates"), icon: <Upload size={13}/>, separatorBefore: true, onSelect: () => setIsImportOpen(true) },
    ];
    const handleKeyDown = useGalleryKeyboard({ editing, renaming, moving, categoryDialog, isImportOpen, isBatchMoving, publishing, isHelpOpen, setIsHelpOpen, toggleSelectMode, searchRef, selectMode, setSelectMode, visible, setSelectedIds, toggleSelectAll, focusedId, gridRef, toggleSelect, setFocusedId });
    return createPortal(<div className="app-viewport-fixed fixed z-[var(--z-palette)] flex items-end justify-center md:items-center md:p-6">
        <div className="anim-fade absolute inset-0 bg-[var(--scrim)]" onClick={onClose} aria-hidden="true"/>
        <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t("templates.template_library")} tabIndex={-1} onKeyDown={handleKeyDown} className="anim-pop relative flex h-[min(88dvh,var(--app-viewport-height,100dvh))] w-full max-w-[940px] flex-col overflow-hidden rounded-t-[var(--r-2xl)] border border-b-0 border-[var(--border-default)] bg-[var(--bg-overlay)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-modal)] outline-none md:rounded-[var(--r-2xl)] md:border-b md:pb-0">
            <GalleryHeader query={query} onQueryChange={setQuery} searchRef={searchRef} selectMode={selectMode} onToggleSelectMode={toggleSelectMode} onOpenHelp={() => setIsHelpOpen(true)} onNewTemplate={() => setEditing('new')} moreButtonRef={moreButtonRef} onOpenMore={() => setIsMoreOpen(true)} onClose={onClose}/>

            <div className="hidden shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-1.5 text-[length:var(--text-10\.5)] text-[var(--text-quaternary)] md:flex">
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
                        <span className="text-[length:var(--text-10\.5)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">{t("templates.categories")}</span>
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
                        <div className="mt-3 mb-1 px-2 text-[length:var(--text-10\.5)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">{t("templates.tags")}</div>
                        <div className="space-y-0.5">
                            {tagList.map(([tag, count]) => (<SidebarButton key={tag} icon={<Hash size={14}/>} label={tag} count={count} active={filter.kind === 'tag' && filter.tag === tag} onClick={() => toggleTagFilter(tag)}/>))}
                        </div>
                    </>)}
                    <button type="button" onClick={() => setCategoryDialog({ mode: 'create' })} className="mt-2 flex h-8 w-full items-center gap-1.5 rounded-[var(--r-md)] px-2 text-[length:var(--text-12)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
                        <Plus size={13}/>{t("templates.new_category")}
                    </button>
                </aside>

                <main className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
                    {filter.kind === 'community' && <CommunityPanel items={community} loading={isCommunityLoading} isError={isCommunityError} myId={currentUserId} onRefresh={() => void refreshCommunity()} onUse={useCommunityTemplate} onImport={importCommunityTemplate} onUnpublish={(item) => void unpublishCommunityTemplate(item)}/>}
                    {filter.kind !== 'community' && visible.some((item) => item.isPinned) && (<div className="mb-3 flex items-center gap-1.5 text-[length:var(--text-10\.5)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
                        <Pin size={11}/>{t("notes.pin")}
                    </div>)}
                    {filter.kind !== 'community' && visible.length === 0 ? (<div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
                        <LayoutTemplate size={26} className="text-[var(--text-quaternary)]"/>
                        <p className="text-[length:var(--text-13)] font-medium text-[var(--text-secondary)]">
                            {query.trim() ? t("templates.no_matching_templates") : t("templates.no_templates")}
                        </p>
                        <p className="text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]">{t("templates.no_templates_hint")}</p>
                    </div>) : filter.kind !== 'community' && (<div ref={gridRef} className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                        {visible.map((template) => (<TemplateCard key={template.id} template={template} categoryName={categoryName(template.categoryId)} selectMode={selectMode} selected={selectedIds.has(template.id)} focused={focusedId === template.id} dragging={draggingId === template.id} dropHint={dropHint?.id === template.id ? dropHint.after : null} onToggleSelect={() => toggleSelect(template.id)} onDragStart={(id) => setDraggingId(id)} onDragOver={(id, after) => setDropHint({ id, after })} onDrop={(template, after) => handleCardDrop(template, after)} onDragEnd={() => {
                            setDraggingId(null);
                            setDropHint(null);
                        }} onUse={() => useTemplate(template)} onEdit={() => setEditing(template)} onRename={() => setRenaming(template)} onDuplicate={() => useNoteTemplates.getState().duplicateTemplate(template.id)} onMove={() => setMoving(template)} onDelete={() => void deleteTemplate(template)} onPublish={() => setPublishing(template)} onTogglePin={() => togglePin(template.id)} onToggleStar={() => toggleStar(template.id)}/>))}
                    </div>)}
                </main>
            </div>

            {selectMode && (<div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-overlay)] px-4 py-2.5">
                <span className="text-[length:var(--text-12\.5)] font-semibold text-[var(--text-secondary)]">{t("templates.selected_count_value0", { value0: selectedIds.size })}</span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={toggleSelectAll}>{allVisibleSelected ? t("templates.clear_selection") : t("templates.select_all")}</Button>
                    <Button size="sm" variant="secondary" icon={<Star size={13}/>} disabled={selectedIds.size === 0} onClick={batchToggleStar}>{allSelectedStarred ? t("common.remove_from_favorites") : t("navigation.favorites")}</Button>
                    <Button size="sm" variant="secondary" icon={<FolderPlus size={13}/>} disabled={selectedIds.size === 0} onClick={() => setIsBatchMoving(true)}>{t("templates.move_to_category")}</Button>
                    <Button size="sm" variant="danger" icon={<Trash2 size={13}/>} disabled={!hasDeletableSelection} onClick={() => void batchDelete()}>{t("templates.delete_template")}</Button>
                    <Button size="sm" variant="ghost" onClick={exitSelectMode}>{t("templates.exit_select_mode")}</Button>
                </div>
            </div>)}
        </div>

        {editing && <TemplateEditorModal template={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)}/>}
        {renaming && <TemplateRenameDialog template={renaming} onClose={() => setRenaming(null)}/>}
        {moving && <MoveTemplateDialog template={moving} categories={categories} onClose={() => setMoving(null)}/>}
        {categoryDialog && <CategoryDialog dialog={categoryDialog} onClose={() => setCategoryDialog(null)}/>}
        {isImportOpen && <ImportTemplatesModal onClose={() => setIsImportOpen(false)}/>}
        {isBatchMoving && <BatchMoveDialog categories={categories} onMove={batchMove} onClose={() => setIsBatchMoving(false)}/>}
        {isHelpOpen && <KeyboardHelpModal onClose={() => setIsHelpOpen(false)}/>}
        {publishing && <PublishTemplateDialog template={publishing} category={publishing.categoryId === null ? t("templates.uncategorized") : categoryName(publishing.categoryId)} onClose={() => setPublishing(null)} onPublished={() => {
            setPublishing(null);
            if (filter.kind === 'community') void refreshCommunity();
        }}/>}
        <Menu anchor={moreButtonRef} open={isMoreOpen} onClose={() => setIsMoreOpen(false)} items={moreItems} align="end" width={200} zIndex={Z_INDEX.menuHigh}/>
    </div>, document.body);
}

