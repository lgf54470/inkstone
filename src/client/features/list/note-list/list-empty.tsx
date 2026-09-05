import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { prettyCombo } from '../../../lib/hotkeys';
import { Empty } from '../../../components/feedback';
import { daysBetweenKeys } from '../../../lib/time';
import { useUi } from '../../../store/ui';
import { useSession } from '../../../store/session';
import { createContextualNote } from '../../../store/notes/selectors';
import { useNotes } from '../../../store/notes';
import { CALENDAR_TREE, calendarPeriodLabel, calendarPeriodsForDate, filterTodoNotes, isTodoFolderId, isVirtualFolderId, type CalendarNode, parseVirtualId, resolveTodoTag, TODO_TREE, virtualAncestorIds, virtualId, virtualNearestNeighbors, virtualPeriodKeyRange } from '../../../lib/calendar-tree';
import { t, useLocale } from '../../../lib/i18n';

export function ListEmpty({ view, folderId, filtering, dayFiltering, tagFiltering, latestEdit, onJumpToLatest, weekFiltered, onJumpToLatestWeek }: {
    view: string;
    folderId: string | null;
    filtering: boolean;
    dayFiltering: boolean;
    tagFiltering: boolean;
    latestEdit: { key: string; label: string } | null;
    onJumpToLatest: () => void;
    weekFiltered: boolean;
    onJumpToLatestWeek: () => void;
}) {
    const openView = useUi((s) => s.openView);
    const todoTagText = resolveTodoTag(useSession((s) => s.settings.notes?.todoTag), useLocale());
    const shortcut = (combo: string) => prettyCombo(combo).join('+');
    if (filtering) {
        return <Empty art="search" title={t("notes.no_matching_notes")} description={t("notes.try_another_search_or_press_shortcut_to_search_everywhere", { shortcut: shortcut('mod+k') })}/>;
    }
    if (dayFiltering) {
        return <Empty art="search" title={weekFiltered ? t("notes.no_notes_in_this_week") : t("notes.no_notes_on_this_day")} description={latestEdit ? t("notes.no_notes_in_range_value0", { value0: latestEdit.label }) : t("notes.no_notes_on_this_day_desc")} action={latestEdit ? (<div className="flex flex-col items-center gap-2">
            {weekFiltered && (<button type="button" onClick={onJumpToLatestWeek} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] px-3 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <CalendarDays size={13}/>{t("notes.view_latest_week")}
            </button>)}
            <button type="button" onClick={onJumpToLatest} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] px-3 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <CalendarDays size={13}/>{t("notes.view_latest_activity_value0", { value0: latestEdit.label })}
            </button>
        </div>) : undefined}/>;
    }
    if (tagFiltering) {
        return <Empty art="tag" title={t("notes.no_notes_match_selected_tags")} description={t("notes.adjust_selected_tags_or_switch_match_mode")}/>;
    }
    const isTodo = isTodoFolderId(folderId);
    const ns = isTodo ? TODO_TREE : CALENDAR_TREE;
    const period = isVirtualFolderId(folderId) ? parseVirtualId(folderId, ns) : null;
    if (period) {
        const notes = useNotes((s) => s.notes);
        const periodNotes = isTodo ? filterTodoNotes(Object.values(notes ?? {}), todoTagText) : Object.values(notes ?? {});
        const label = calendarPeriodLabel(period);
        const range = virtualPeriodKeyRange(virtualId(period, ns), ns);
        const at = calendarPeriodsForDate(new Date());
        const target = period.kind === 'week' ? at.week : at.month;
        const openCalendarId = (id: string) => {
            const ancestors = virtualAncestorIds(id, ns);
            if (ancestors.length) {
                useUi.setState((state) => ({
                    expandedFolders: [...new Set([...state.expandedFolders, ...ancestors])],
                }));
            }
            openView('folder', { folderId: id });
        };
        const { prev, next } = virtualNearestNeighbors(period, periodNotes, ns);
        const targetStart = range?.start;
        let nearest: CalendarNode | null = null;
        if (prev && next && targetStart) {
            const prevStart = virtualPeriodKeyRange(prev.id, ns)?.start;
            const nextStart = virtualPeriodKeyRange(next.id, ns)?.start;
            nearest = prevStart && nextStart
                ? Math.abs(daysBetweenKeys(targetStart, prevStart)) <= Math.abs(daysBetweenKeys(targetStart, nextStart)) ? prev : next
                : prev;
        }
        else {
            nearest = prev ?? next;
        }
        const neighborLabel = (node: CalendarNode) => {
            const parsed = parseVirtualId(node.id, ns);
            return (parsed ? calendarPeriodLabel(parsed) : null) ?? node.name;
        };
        const neighborButton = (node: CalendarNode, leading: boolean) => (
            <button type="button" onClick={() => openCalendarId(node.id)} className="inline-flex h-7 items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-default)] px-2.5 text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                {leading && <ChevronLeft size={12}/>}{neighborLabel(node)} · {t("common.value0_notes", { value0: node.count })}{!leading && <ChevronRight size={12}/>}
            </button>);
        return <Empty art="folder" title={t("notes.no_notes_in_this_period")} description={range && label ? `${label} · ${t("notes.calendar_period_range_value0", { value0: `${range.start} ~ ${range.end}` })}` : undefined} action={<div className="flex flex-col items-center gap-2">
            {nearest && (<button type="button" onClick={() => openCalendarId(nearest.id)} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] px-3 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <CalendarDays size={13}/>{t("notes.jump_to_nearest_period")}
            </button>)}
            <button type="button" onClick={() => openCalendarId(virtualId(target, ns))} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] px-3 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <CalendarDays size={13}/>{t(period.kind === 'week' ? "notes.view_this_week" : "notes.view_this_month")}
            </button>
            <button type="button" onClick={() => void createContextualNote()} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] px-3 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <Plus size={13}/>{t("common.new_note")}
            </button>
            {(prev || next) && (<div className="flex items-center gap-1.5">
                {prev && neighborButton(prev, true)}
                {next && neighborButton(next, false)}
            </div>)}
        </div>}/>;
    }
    const config: Record<string, {
        art: 'notes' | 'starred' | 'trash' | 'archive' | 'folder' | 'tag';
        title: string;
        desc: string;
    }> = {
        all: { art: 'notes', title: t("notes.no_notes_yet"), desc: t("notes.press_shortcut_or_the_plus_button_to_write_your_first_note", { shortcut: shortcut('mod+n') }) },
        recent: { art: 'notes', title: t("notes.nothing_has_been_edited_recently"), desc: t("notes.write_something_and_it_will_appear_here") },
        starred: { art: 'starred', title: t("notes.no_favorites_yet"), desc: t("notes.right_click_a_note_or_press_shortcut_to_favorite_it", { shortcut: shortcut('mod+d') }) },
        pinned: { art: 'notes', title: t("notes.no_pinned_notes"), desc: t("notes.no_pinned_notes_desc") },
        shared: { art: 'notes', title: t("notes.no_shared_notes"), desc: t("notes.no_shared_notes_desc") },
        unfiled: { art: 'folder', title: t("notes.every_note_is_filed"), desc: t("notes.everything_is_neatly_organized") },
        archived: { art: 'archive', title: t("notes.archive_is_empty"), desc: t("notes.keep_notes_here_when_you_want_them_out_of_the_way_but_not_deleted") },
        trash: { art: 'trash', title: t("notes.trash_is_empty"), desc: t("notes.deleted_notes_remain_until_you_restore_or_clear_them") },
        folder: { art: 'folder', title: t("notes.this_folder_is_still_empty"), desc: t("notes.drag_notes_in_or_create_new_ones_here") },
        tag: { art: 'tag', title: t("notes.there_are_no_notes_with_this_tag"), desc: t("notes.write_tags_in_the_note_to_link_them_automatically") },
        untagged: { art: 'tag', title: t("tags.no_untagged_notes"), desc: t("tags.no_untagged_notes_desc") },
    };
    const item = config[view] ?? config.all!;
    return (<Empty art={item.art} title={item.title} description={item.desc} action={view !== 'trash' && view !== 'archived' ? (<button type="button" onClick={() => void createContextualNote()} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] px-3 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
            <Plus size={13}/>{t("common.new_note")}</button>) : undefined}/>);
}

