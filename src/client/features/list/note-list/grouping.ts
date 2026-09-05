import type { NoteSummary, SortKey } from '@shared/types'
import { groupLabel } from '../../../lib/time'
import { t } from '../../../lib/i18n'

interface GroupItem {
    note: NoteSummary;
    ranges: [
        number,
        number
    ][];
    position: number;
}
interface Group {
    key: string;
    label: string | null;
    items: GroupItem[];
}
export function groupNotes(items: GroupItem[], sort: SortKey, isTrash: boolean, now: number): Group[] {
    const pinned = isTrash ? [] : items.filter((i) => i.note.isPinned);
    const rest = isTrash ? items : items.filter((i) => !i.note.isPinned);
    const groups: Group[] = [];
    if (pinned.length)
        groups.push({ key: 'pinned', label: t("notes.pin"), items: pinned });
    if (sort === 'updated' || sort === 'created' || isTrash) {
        let currentKey: string | null = null;
        let bucket: Group | null = null;
        for (const item of rest) {
            const stamp = isTrash
                ? (item.note.deletedAt ?? item.note.updatedAt)
                : sort === 'created'
                    ? item.note.createdAt
                    : item.note.updatedAt;
            const label = groupLabel(stamp, now);
            if (label !== currentKey) {
                currentKey = label;
                bucket = { key: `${label}-${groups.length}`, label, items: [] };
                groups.push(bucket);
            }
            bucket?.items.push(item);
        }
    }
    else if (rest.length) {
        groups.push({ key: 'rest', label: pinned.length ? t("notes.other") : null, items: rest });
    }
    return groups.filter((g) => g.items.length);
}
