import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Kbd } from '../../components/primitives';
import { Modal } from '../../components/overlay';
import { hotkeyText, listHotkeys } from '../../lib/hotkeys';
import { t, type MessageKey } from "../../lib/i18n";

const EDITOR_SHORTCUTS: {
    combo: string;
    description: () => string;
}[] = [
    { combo: 'mod+b', description: () => t("common.bold") },
    { combo: 'mod+i', description: () => t("common.italic") },
    { combo: 'mod+e', description: () => t("common.inline_code") },
    { combo: 'mod+shift+x', description: () => t("common.strikethrough") },
    { combo: 'mod+shift+h', description: () => t("common.highlight") },
    { combo: 'mod+1', description: () => t("command.heading_1_same_pattern_for_2_6") },
    { combo: 'mod+shift+8', description: () => t("common.unordered_list") },
    { combo: 'mod+shift+7', description: () => t("common.ordered_list") },
    { combo: 'mod+shift+9', description: () => t("common.task_list") },
    { combo: 'mod+shift+.', description: () => t("common.quote") },
    { combo: 'mod+shift+enter', description: () => t("command.check_uncheck_tasks") },
    { combo: 'alt+arrowup', description: () => t("command.move_line_up") },
    { combo: 'alt+arrowdown', description: () => t("command.move_line_down") },
    { combo: 'mod+shift+k', description: () => t("command.delete_line") },
    { combo: 'mod+f', description: () => t("command.find_and_replace_in_this_note") },
    { combo: 'mod+z', description: () => t("common.undo") },
    { combo: 'mod+shift+z', description: () => t("command.redo") },
];
const INPUT_HINTS: {
    keys: string[];
    description: () => string;
}[] = [
    { keys: ['[', '['], description: () => t("command.link_to_another_note_autocomplete") },
    { keys: ['#'], description: () => t("command.insert_tag_autocomplete") },
    { keys: ['`', '`', '`'], description: () => t("command.code_block_language_autocomplete") },
    { keys: ['↵'], description: () => t("command.continue_lists_automatically_press_enter_on_an_empty_item_to_exit") },
    { keys: ['Tab'], description: () => t("command.jump_to_the_next_cell_in_the_table") },
];
const CALENDAR_YEAR_HINTS: {
    keys: string[];
    description: () => string;
    keywordKey: MessageKey;
}[] = [
    {
        keys: ['←', '→'],
        description: () => t("command.calendar_year_weekday_move"),
        keywordKey: "command.calendar_year_weekday_move_keywords",
    },
    {
        keys: ['Enter'],
        description: () => t("command.calendar_year_weekday_filter"),
        keywordKey: "command.calendar_year_weekday_filter_keywords",
    },
    {
        keys: ['Esc'],
        description: () => t("command.calendar_year_weekday_exit"),
        keywordKey: "command.calendar_year_weekday_exit_keywords",
    },
    {
        keys: ['↑', '↓'],
        description: () => t("command.calendar_year_month_move"),
        keywordKey: "command.calendar_year_month_move_keywords",
    },
];
interface ShortcutRow {
    combo?: string;
    keys?: string[];
    description: string;
    keywords?: string[];
}
function rowMatches(row: ShortcutRow, query: string): boolean {
    if (row.description.toLowerCase().includes(query))
        return true;
    const combo = row.combo ?? row.keys?.join(' ') ?? '';
    if (combo.toLowerCase().includes(query))
        return true;
    return (row.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(query));
}
export function ShortcutsPanel({ onClose }: {
    onClose: () => void;
}) {
    const [query, setQuery] = useState('');
    const sections = useMemo(() => {
        const registered = listHotkeys();
        const map = new Map<string, ShortcutRow[]>();
        for (const hotkey of registered) {
            const group = hotkeyText(hotkey.group);
            const list = map.get(group) ?? [];
            list.push({ combo: hotkey.combo, description: hotkeyText(hotkey.description) });
            map.set(group, list);
        }
        const editGroup = t("common.edit");
        map.set(editGroup, [
            ...(map.get(editGroup) ?? []),
            ...EDITOR_SHORTCUTS.map((item) => ({ combo: item.combo, description: item.description() })),
        ]);
        const all: {
            group: string;
            rows: ShortcutRow[];
        }[] = [
            ...[...map.entries()].map(([group, rows]) => ({ group, rows })),
            {
                group: t("command.triggered_as_you_type"),
                rows: INPUT_HINTS.map((item) => ({ keys: item.keys, description: item.description() })),
            },
            {
                group: t("command.calendar_year_hints"),
                rows: CALENDAR_YEAR_HINTS.map((item) => ({ keys: item.keys, description: item.description(), keywords: t(item.keywordKey).split(',') })),
            },
        ];
        const q = query.trim().toLowerCase();
        if (!q)
            return all;
        const result: typeof all = [];
        for (const section of all) {
            if (section.group.toLowerCase().includes(q)) {
                result.push(section);
                continue;
            }
            const rows = section.rows.filter((row) => rowMatches(row, q));
            if (rows.length)
                result.push({ ...section, rows });
        }
        return result;
    }, [query]);
    const hasResults = sections.length > 0;
    return (<Modal open onClose={onClose} title={t("command.keyboard_shortcuts_021cf9")} description={t("command.use_nearly_every_action_without_touching_the_mouse")} width={720}>
      <div className="sticky top-0 z-10 -mx-4 bg-[var(--bg-overlay)] px-4 pt-0.5 pb-3 md:-mx-5 md:px-5">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--text-quaternary)]"/>
          <input data-autofocus aria-label={t("command.shortcuts_filter_placeholder")} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Escape' && query.trim()) {
                    event.preventDefault();
                    event.stopPropagation();
                    setQuery('');
                }
            }} placeholder={t("command.shortcuts_filter_placeholder")} className="h-9 w-full rounded-[var(--r-md)] border border-transparent bg-[var(--bg-inset)] pr-8 pl-8 text-[12.5px] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-ring)] focus:outline-none"/>
          {query && (<button type="button" aria-label={t("command.shortcuts_clear_filter")} onClick={() => setQuery('')} className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]">
              <X size={13}/>
            </button>)}
        </div>
      </div>
      {hasResults ? (<div className="grid grid-cols-1 gap-x-8 gap-y-5 pr-1 md:max-h-[52vh] md:grid-cols-2 md:overflow-y-auto">
        {sections.map((section) => (section.rows.length > 0 && <section key={section.group}>
            <h3 className="mb-2 text-[10.5px] font-semibold tracking-[0.07em] text-[var(--text-quaternary)]">
              {section.group}
            </h3>
            <ul className="space-y-0.5">
              {section.rows.map((item, index) => (<li key={`${item.combo ?? item.keys?.join('')}-${index}`} className="flex min-h-10 items-center justify-between gap-4 rounded-[var(--r-sm)] px-1.5 py-[5px] transition-colors hover:bg-[var(--bg-hover)] md:min-h-0">
                  <span className="min-w-0 text-[12.5px] leading-snug text-[var(--text-secondary)] md:truncate">
                    {item.description}
                  </span>
                  {item.combo ? <Kbd combo={item.combo}/> : <Kbd keys={item.keys}/>}
                </li>))}
            </ul>
          </section>))}
      </div>) : (<div className="px-2 py-10 text-center text-[12.5px] text-[var(--text-tertiary)]">
          {t("command.shortcuts_no_results")}
        </div>)}
    </Modal>);
}
