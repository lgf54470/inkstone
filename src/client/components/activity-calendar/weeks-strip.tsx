import type { JSX } from 'react';
import * as React from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';
import { Tooltip } from '../overlay';
import { HEAT_PERCENTS, type WeekCell } from './strip';

interface WeeksStripProps {
    stripWeeks: WeekCell[][];
    expandedWeek: number | null;
    shownWeek: number | null;
    expandedDay: string | null;
    shownDay: string | null;
    isExpandedWeekNotes: boolean;
    weekCells: WeekCell[] | undefined;
    weekCellsTotal: number;
    weekdayLabels: string[];
    flashRef: React.RefObject<HTMLDivElement | null>;
    onStripWeekClick: (event: React.MouseEvent, weekIndex: number) => void;
    onToggleDay: (key: string) => void;
    onToggleWeekNotes: () => void;
    onActivateDay: (key: string, diaryId: string | null) => void;
    onNoteClick: (noteId: string) => void;
    onJumpToDay: (key: string) => void;
    isWeekRangeActive: (week: WeekCell[]) => boolean;
    isLatestOutside: (key: string) => boolean;
    gapLabel: (key: string) => string;
    flaggedLabel: (key: string) => string;
}

export function WeeksStrip({ stripWeeks, expandedWeek, shownWeek, expandedDay, shownDay, isExpandedWeekNotes, weekCells, weekCellsTotal, weekdayLabels, flashRef, onStripWeekClick, onToggleDay, onToggleWeekNotes, onActivateDay, onNoteClick, onJumpToDay, isWeekRangeActive, isLatestOutside, gapLabel, flaggedLabel }: WeeksStripProps): JSX.Element {
    return (<div ref={flashRef} className="mt-1.5 px-0.5">
            <div className="px-0.5 pb-1 text-[length:var(--text-9)] font-medium text-[var(--text-quaternary)]">{t("sidebar.calendar_week_strip_value0", { value0: stripWeeks.length })}</div>
            <div className="flex gap-[2px]">
                {stripWeeks.map((week, weekIndex) => (<button key={weekIndex} type="button" aria-expanded={expandedWeek === weekIndex} aria-pressed={isWeekRangeActive(week)} aria-label={t("sidebar.calendar_expand_week_value0", { value0: week[0]?.key.slice(5), value1: week[6]?.key.slice(5) })} onClick={(event) => onStripWeekClick(event, weekIndex)} className={cn('flex min-w-0 flex-1 flex-col gap-[2px] rounded-[var(--r-3)] p-px transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', expandedWeek === weekIndex && 'bg-[var(--accent-soft)]')}>
                    {week.map((cell) => (<Tooltip key={cell.key} label={flaggedLabel(cell.key)}>
                        <span aria-hidden="true" className={cn('aspect-square w-full rounded-[var(--r-2)]', cell.today && 'ring-1 ring-inset ring-[var(--accent)]', cell.selected && !cell.today && 'ring-1 ring-inset ring-[var(--accent)]/70', isLatestOutside(cell.key) && 'border border-dashed border-[var(--accent)]/80')} style={cell.level > 0 ? { backgroundColor: `color-mix(in oklab, var(--accent) ${HEAT_PERCENTS[cell.level]}%, transparent)` } : { backgroundColor: 'var(--bg-inset)' }}/>
                    </Tooltip>))}
                </button>))}
            </div>
            <div className={cn('grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-out', expandedWeek !== null ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <div aria-hidden={expandedWeek === null} inert={expandedWeek === null} className="min-h-0 overflow-hidden">
                    <div className="mt-1.5 space-y-px rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-1">
                        {shownWeek !== null && stripWeeks[shownWeek] && stripWeeks[shownWeek].map((cell, dayIndex) => (<div key={cell.key}>
                            <div className="flex items-center gap-0.5">
                                <button type="button" aria-label={gapLabel(cell.key)} onClick={() => onActivateDay(cell.key, cell.diaryId)} className={cn('flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', cell.selected && 'bg-[var(--accent-soft)]', isLatestOutside(cell.key) && 'border border-dashed border-[var(--accent)]/80')}>
                                    <span className="w-3 shrink-0 text-center text-[length:var(--text-9\.5)] font-medium text-[var(--text-quaternary)]">{weekdayLabels[dayIndex]}</span>
                                    <span className="shrink-0 text-[length:var(--text-10\.5)] tabular text-[var(--text-secondary)]">{cell.key.slice(5)}</span>
                                    {cell.today && (<span aria-hidden="true" className="size-[5px] shrink-0 rounded-full bg-[var(--accent)]"/>)}
                                    <span className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
                                        {cell.diaryId && (<span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-1.5 py-px text-[length:var(--text-9)] font-medium text-[var(--accent)]">
                                            <span aria-hidden="true" className="size-[3px] rounded-full bg-[var(--accent)]"/>{t("sidebar.diary_tag")}
                                        </span>)}
                                        {cell.count > 0 && (<span className="text-[length:var(--text-9\.5)] tabular text-[var(--text-quaternary)]">{cell.count}</span>)}
                                    </span>
                                </button>
                                {cell.notes.length > 0 && (<button type="button" aria-expanded={expandedDay === cell.key} aria-label={t("sidebar.calendar_expand_day")} onClick={() => onToggleDay(cell.key)} className={cn('flex size-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', expandedDay === cell.key && 'text-[var(--text-secondary)]')}>
                                    <ChevronDown size={10} className={cn('transition-transform duration-[var(--dur-fast)]', expandedDay === cell.key && 'rotate-180')}/>
                                </button>)}
                            </div>
                            <div className={cn('grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-out', expandedDay === cell.key ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                                <div aria-hidden={expandedDay !== cell.key} inert={expandedDay !== cell.key} className="min-h-0 overflow-hidden">
                                    <div className="space-y-px py-0.5 pl-3.5 pr-1">
                                        {shownDay === cell.key && cell.notes.map((note) => (<button key={note.id} type="button" onClick={() => onNoteClick(note.id)} className="flex h-6 w-full items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                                            <FileText size={9} className="shrink-0 text-[var(--text-quaternary)]"/>
                                            <span className="min-w-0 flex-1 truncate text-[length:var(--text-10\.5)] text-[var(--text-secondary)]">{note.title}</span>
                                        </button>))}
                                    </div>
                                </div>
                            </div>
                        </div>))}
                    {weekCellsTotal > 0 && (<>
                        <div className="my-0.5 border-t border-[var(--border-subtle)]"/>
                        <div className="flex items-center">
                            <button type="button" aria-expanded={isExpandedWeekNotes} aria-label={t("sidebar.calendar_week_notes_value0", { value0: weekCellsTotal })} onClick={() => onToggleWeekNotes()} className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-[var(--r-sm)] px-1.5 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                                <FileText size={10} className="shrink-0 text-[var(--text-quaternary)]"/>
                                <span className="text-[length:var(--text-10\.5)] text-[var(--text-secondary)]">{t("sidebar.calendar_week_notes_value0", { value0: weekCellsTotal })}</span>
                                <ChevronDown size={10} className={cn('ml-auto text-[var(--text-quaternary)] transition-transform duration-[var(--dur-fast)]', isExpandedWeekNotes && 'rotate-180')}/>
                            </button>
                        </div>
                        <div className={cn('grid transition-[grid-template-rows] duration-[var(--dur-base)] ease-out', isExpandedWeekNotes ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                            <div aria-hidden={!isExpandedWeekNotes} inert={!isExpandedWeekNotes} className="min-h-0 overflow-hidden">
                                <div className="space-y-1 py-0.5">
                                    {weekCells!.map((cell, dayIndex) => (cell.notes.length > 0 ? (<div key={cell.key}>
                                        <button type="button" aria-label={t("sidebar.calendar_jump_to_day")} onClick={() => onJumpToDay(cell.key)} className="flex w-full items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-0.5 text-left text-[length:var(--text-9\.5)] font-medium text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                                            <span>{weekdayLabels[dayIndex]}</span>
                                            <span className="tabular">{cell.key.slice(5)}</span>
                                            <span className="ml-auto tabular">{cell.notes.length}</span>
                                        </button>
                                        {cell.notes.map((note) => (<button key={note.id} type="button" onClick={() => onNoteClick(note.id)} className="flex h-6 w-full items-center gap-1.5 rounded-[var(--r-sm)] py-0.5 pr-1.5 pl-5 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                                            <FileText size={9} className="shrink-0 text-[var(--text-quaternary)]"/>
                                            <span className="min-w-0 flex-1 truncate text-[length:var(--text-10\.5)] text-[var(--text-secondary)]">{note.title}</span>
                                        </button>))}
                                    </div>) : null))}
                                </div>
                            </div>
                        </div>
                    </>)}
                    </div>
                </div>
            </div>
        </div>);
}
