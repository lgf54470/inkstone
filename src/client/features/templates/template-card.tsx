import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, FilePlus2, FolderPlus, MoreHorizontal, Pencil, Pin, PinOff, Send, Star, Trash2 } from 'lucide-react';
import type { NoteTemplate } from '@shared/types';
import { Z_INDEX } from '../../lib/z-index';
import { cn } from '../../lib/cn';
import { IconButton } from '../../components/primitives';
import { Menu, Tooltip, useContextMenu, type MenuItem } from '../../components/overlay';
import { t } from '../../lib/i18n';

export function TemplateCard({ template, categoryName, selectMode, selected, focused, dragging, dropHint, onToggleSelect, onDragStart, onDragOver, onDrop, onDragEnd, onUse, onEdit, onRename, onDuplicate, onMove, onDelete, onPublish, onTogglePin, onToggleStar }: {
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
    const [isMenuOpen, setIsMenuOpen] = useState(false);
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
        setIsMenuOpen(false);
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
                <h3 className="min-w-0 flex-1 truncate text-[length:var(--text-13)] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{template.name}</h3>
                {template.isStarred && <Star size={11} className="shrink-0 fill-current text-[var(--warning)]"/>}
                {template.builtin && <span className="shrink-0 rounded-full bg-[var(--bg-raised)] px-1.5 py-px text-[length:var(--text-10)] font-medium text-[var(--text-quaternary)]">{t("templates.builtin")}</span>}
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
                        setIsMenuOpen(true);
                    }} className="size-6 text-[var(--text-tertiary)]">
                        <MoreHorizontal size={13}/>
                    </IconButton>
                </Tooltip>
            </div>
        </div>
        {template.description && <p className="relative z-[var(--z-sticky)] mt-1.5 line-clamp-2 text-[length:var(--text-11\.5)] leading-relaxed text-[var(--text-tertiary)]">{template.description}</p>}
        {template.tags.length > 0 && (<div className="relative z-[var(--z-sticky)] mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
            {template.tags.map((tag) => (<span key={tag} className="rounded-full bg-[var(--bg-raised)] px-1.5 py-px text-[length:var(--text-10)] text-[var(--text-tertiary)]">#{tag}</span>))}
        </div>)}
        <div className="relative z-[var(--z-sticky)] mt-auto flex items-center gap-2 pt-2.5">
            <span className="text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">{categoryName}</span>
            <span className="text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">·</span>
            <span className="text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">{t("templates.lines_count", { value0: lineCount })}</span>
            <span className="ml-auto text-[length:var(--text-10\.5)] font-medium text-[var(--accent)] opacity-0 transition-opacity group-hover:opacity-100">{t("templates.use_template")} →</span>
        </div>
        <Menu anchor={menuButtonRef} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} items={items} align="end" width={200} zIndex={Z_INDEX.hoverPinned}/>
        {contextMenu.point && <Menu anchor={contextMenu.point} open onClose={contextMenu.close} items={items} width={200} zIndex={Z_INDEX.hoverPinned}/>}
    </div>);
}

