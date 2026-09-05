import type { NoteSummary } from '@shared/types';

export function note(overrides: Partial<NoteSummary> = {}): NoteSummary {
    return {
        id: 'n1',
        title: 'Note',
        excerpt: '',
        folderId: null,
        tags: [],
        isPinned: false,
        isStarred: false,
        isArchived: false,
        wordCount: 0,
        charCount: 0,
        rev: 1,
        position: 0,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
        ...overrides,
    };
}
