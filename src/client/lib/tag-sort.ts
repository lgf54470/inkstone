import { compareTagNames } from '@shared/markdown-utils';

/** Rank a tag name against a query: exact match, then prefix, then earlier substring. */
function tagSearchScore(name: string, query: string): number {
    const lower = name.toLocaleLowerCase();
    if (lower === query)
        return 0;
    const index = lower.indexOf(query);
    if (index === 0)
        return 1;
    return index < 0 ? Number.MAX_SAFE_INTEGER : 2 + index;
}

/** Sort tags for a picker: by query relevance when searching, otherwise by note count (then name). */
export function sortTagsForPicker<T extends { name: string; count: number }>(tags: readonly T[], query: string): T[] {
    const q = query.trim().toLocaleLowerCase();
    const matches = q ? tags.filter((tag) => tag.name.toLocaleLowerCase().includes(q)) : [...tags];
    return matches.sort((a, b) => {
        if (q) {
            const diff = tagSearchScore(a.name, q) - tagSearchScore(b.name, q);
            if (diff !== 0)
                return diff;
        }
        return b.count - a.count || compareTagNames(a.name, b.name);
    });
}