export type GalleryFilter =
    | { kind: 'all' }
    | { kind: 'favorites' }
    | { kind: 'uncategorized' }
    | { kind: 'community' }
    | { kind: 'category'; id: string }
    | { kind: 'tag'; tag: string };

export const GALLERY_PERSIST_KEY = 'inkstone.template-gallery.v1';

export interface GalleryPersistedState {
    filter: GalleryFilter;
    query: string;
    selectMode: boolean;
}

export function loadGalleryPersist(): GalleryPersistedState {
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

export interface TemplateDraft {
    name: string;
    description: string;
    content: string;
    categoryId: string | null;
    tags: string[];
}

export const EMPTY_DRAFT: TemplateDraft = { name: '', description: '', content: '', categoryId: null, tags: [] };

export function splitTagInput(value: string): string[] {
    // The fullwidth comma (\uFF0C) is the typographic default for Chinese input.
    return value.replaceAll('\uFF0C', ',').split(/[\s,]+/).filter(Boolean);
}

