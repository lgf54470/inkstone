/** Coordinates the client-side template library: built-in seeding, categories and CRUD. */
import { create } from 'zustand'
import type { NoteTemplate, NoteTemplateCategory } from '@shared/types'
import {
    BUILTIN_TEMPLATE_CATEGORIES,
    BUILTIN_TEMPLATE_DEFS,
    BUILTIN_TEMPLATE_TAG_LABELS,
    TEMPLATE_SEED_VERSION,
    type BuiltinTemplateDef,
    type TemplateLibraryExport,
} from '@shared/note-templates'
import { localDb, type TemplateLibraryData } from '../lib/db'
import { t } from "../lib/i18n";

export interface TemplateInput {
    name: string;
    description?: string;
    content: string;
    categoryId?: string | null;
    tags?: string[];
}

export function normalizeTags(tags: string[] | undefined): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of tags ?? []) {
        const tag = raw.trim();
        if (!tag || seen.has(tag) || result.length >= 8) continue;
        seen.add(tag);
        result.push(tag.slice(0, 30));
    }
    return result;
}

interface TemplateLibraryState {
    categories: NoteTemplateCategory[];
    templates: NoteTemplate[];
    hydrated: boolean;
    hydrate: () => Promise<void>;
    createCategory: (name: string) => string | null;
    renameCategory: (id: string, name: string) => boolean;
    deleteCategory: (id: string) => boolean;
    createTemplate: (input: TemplateInput) => string | null;
    updateTemplate: (id: string, patch: Partial<TemplateInput>) => boolean;
    deleteTemplate: (id: string) => boolean;
    duplicateTemplate: (id: string) => string | null;
    placeTemplate: (id: string, categoryId: string | null, index: number) => boolean;
    importTemplates: (data: TemplateLibraryExport) => { imported: number; skipped: number };
    toggleTemplatePin: (id: string) => void;
    toggleTemplateStar: (id: string) => void;
}

let hydratePromise: Promise<void> | null = null;

function builtinTags(def: BuiltinTemplateDef): string[] {
    return def.tags.map((key) => t(BUILTIN_TEMPLATE_TAG_LABELS[key]));
}

export function templateOrderValue(template: NoteTemplate): number {
    return template.position ?? Number.MAX_SAFE_INTEGER - template.updatedAt;
}

export function compareTemplates(a: NoteTemplate, b: NoteTemplate): number {
    return Number(b.isPinned) - Number(a.isPinned) ||
        Number(b.isStarred) - Number(a.isStarred) ||
        templateOrderValue(a) - templateOrderValue(b);
}

function buildBuiltinLibrary(): TemplateLibraryData {
    const now = Date.now();
    return {
        categories: BUILTIN_TEMPLATE_CATEGORIES.map((def, index) => ({
            id: def.id,
            name: t(def.nameKey),
            builtin: true,
            position: index,
            createdAt: now,
        })),
        templates: BUILTIN_TEMPLATE_DEFS.map((def, index) => ({
            id: def.id,
            categoryId: def.categoryId,
            name: t(def.nameKey),
            description: t(def.descriptionKey),
            content: t(def.contentKey),
            tags: builtinTags(def),
            builtin: true,
            isPinned: false,
            isStarred: false,
            position: index,
            createdAt: now,
            updatedAt: now,
        })),
        seedVersion: TEMPLATE_SEED_VERSION,
    };
}

function orderedCategories(categories: NoteTemplateCategory[]): NoteTemplateCategory[] {
    const builtinPositions = new Map(BUILTIN_TEMPLATE_CATEGORIES.map((def, index) => [def.id, index]));
    return [...categories].sort((a, b) => {
        const aPos = builtinPositions.get(a.id);
        const bPos = builtinPositions.get(b.id);
        if (aPos !== undefined && bPos !== undefined) return aPos - bPos;
        if (aPos !== undefined) return -1;
        if (bPos !== undefined) return 1;
        return a.createdAt - b.createdAt;
    });
}

/**
 * Merge newer built-in entries into an existing library without touching user
 * templates or user edits. Runs when the stored seed version is behind.
 */
function mergeBuiltinSeed(current: TemplateLibraryData): TemplateLibraryData {
    if (current.seedVersion >= TEMPLATE_SEED_VERSION) return current;
    const now = Date.now();
    const defById = new Map(BUILTIN_TEMPLATE_DEFS.map((def) => [def.id, def]));
    const existingTemplateIds = new Set(current.templates.map((item) => item.id));
    const existingCategoryIds = new Set(current.categories.map((item) => item.id));
    let isTouched = false;
    // Refresh catalog-sourced fields (name, description, content, tags) on
    // built-in entries the user never edited: user edits flip `builtin` to
    // false, so those are skipped and never overwritten by a re-seed.
    const refreshedTemplates = current.templates.map((item) => {
        const def = defById.get(item.id);
        if (!def || !item.builtin) return item;
        isTouched = true;
        return {
            ...item,
            name: t(def.nameKey),
            description: t(def.descriptionKey),
            content: t(def.contentKey),
            tags: builtinTags(def),
        };
    });
    const addedTemplates: NoteTemplate[] = [];
    for (const def of BUILTIN_TEMPLATE_DEFS) {
        if (existingTemplateIds.has(def.id)) continue;
        isTouched = true;
        addedTemplates.push({
            id: def.id,
            categoryId: def.categoryId,
            name: t(def.nameKey),
            description: t(def.descriptionKey),
            content: t(def.contentKey),
            tags: builtinTags(def),
            builtin: true,
            isPinned: false,
            isStarred: false,
            position: BUILTIN_TEMPLATE_DEFS.indexOf(def),
            createdAt: now,
            updatedAt: now,
        });
    }
    const addedCategories: NoteTemplateCategory[] = [];
    for (const def of BUILTIN_TEMPLATE_CATEGORIES) {
        if (existingCategoryIds.has(def.id)) continue;
        isTouched = true;
        addedCategories.push({
            id: def.id,
            name: t(def.nameKey),
            builtin: true,
            position: def.position,
            createdAt: now,
        });
    }
    if (!isTouched)
        return { ...current, seedVersion: TEMPLATE_SEED_VERSION };
    return {
        categories: orderedCategories([...current.categories, ...addedCategories]),
        templates: [...refreshedTemplates, ...addedTemplates],
        seedVersion: TEMPLATE_SEED_VERSION,
    };
}

function newLocalId(prefix: string): string {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    return `${prefix}-${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export const useNoteTemplates = create<TemplateLibraryState>((set, get) => ({
    categories: [],
    templates: [],
    hydrated: false,
    async hydrate() {
        if (hydratePromise) return hydratePromise;
        hydratePromise = (async () => {
            const stored = await localDb.loadTemplateLibrary();
            const next = stored
                ? mergeBuiltinSeed(stored)
                : buildBuiltinLibrary();
            if (next !== stored)
                await localDb.saveTemplateLibrary(next);
            set({
                categories: orderedCategories(next.categories),
                templates: next.templates,
                hydrated: true,
            });
        })().catch((error) => {
            hydratePromise = null;
            throw error;
        });
        return hydratePromise;
    },
    createCategory(name) {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const id = newLocalId('cat');
        const now = Date.now();
        set((state) => {
            const categories = [...state.categories, {
                id,
                name: trimmed.slice(0, 120),
                builtin: false,
                position: state.categories.length,
                createdAt: now,
            }];
            void localDb.saveTemplateLibrary(serializeLibrary(state.templates, categories));
            return { categories: orderedCategories(categories) };
        });
        return id;
    },
    renameCategory(id, name) {
        const trimmed = name.trim();
        const current = get().categories.find((item) => item.id === id);
        if (!current || current.builtin || !trimmed) return false;
        set((state) => {
            const categories = state.categories.map((item) => item.id === id
                ? { ...item, name: trimmed.slice(0, 120) }
                : item);
            void localDb.saveTemplateLibrary(serializeLibrary(state.templates, categories));
            return { categories };
        });
        return true;
    },
    deleteCategory(id) {
        const current = get().categories.find((item) => item.id === id);
        if (!current || current.builtin) return false;
        set((state) => {
            const categories = state.categories.filter((item) => item.id !== id);
            const templates = state.templates.map((item) => item.categoryId === id
                ? { ...item, categoryId: null }
                : item);
            void localDb.saveTemplateLibrary(serializeLibrary(templates, categories));
            return { categories, templates };
        });
        return true;
    },
    createTemplate(input) {
        const name = input.name.trim();
        if (!name || !input.content) return null;
        const id = newLocalId('tpl');
        const now = Date.now();
        set((state) => {
            const categoryId = input.categoryId ?? null;
            const siblings = state.templates.filter((item) => item.categoryId === categoryId);
            const nextPosition = siblings.length ? Math.max(...siblings.map((item) => templateOrderValue(item))) + 1 : 0;
            const templates = [...state.templates, {
                id,
                categoryId,
                name: name.slice(0, 120),
                description: (input.description ?? '').slice(0, 240),
                content: input.content,
                tags: normalizeTags(input.tags),
                builtin: false,
                isPinned: false,
                isStarred: false,
                position: nextPosition,
                createdAt: now,
                updatedAt: now,
            }];
            void localDb.saveTemplateLibrary(serializeLibrary(templates, state.categories));
            return { templates };
        });
        return id;
    },
    updateTemplate(id, patch) {
        const current = get().templates.find((item) => item.id === id);
        if (!current) return false;
        const name = patch.name?.trim();
        if (name !== undefined && !name) return false;
        set((state) => {
            const templates = state.templates.map((item) => item.id === id
                ? {
                    ...item,
                    // Customizing a built-in template hands ownership to the user,
                    // so it becomes deletable and drops the "built-in" badge.
                    builtin: false,
                    name: name !== undefined ? name.slice(0, 120) : item.name,
                    description: patch.description !== undefined
                        ? patch.description.slice(0, 240)
                        : item.description,
                    content: patch.content !== undefined ? patch.content : item.content,
                    categoryId: patch.categoryId !== undefined ? (patch.categoryId ?? null) : item.categoryId,
                    tags: patch.tags !== undefined ? normalizeTags(patch.tags) : item.tags,
                    updatedAt: Date.now(),
                }
                : item);
            void localDb.saveTemplateLibrary(serializeLibrary(templates, state.categories));
            return { templates };
        });
        return true;
    },
    deleteTemplate(id) {
        const current = get().templates.find((item) => item.id === id);
        if (!current || current.builtin) return false;
        set((state) => {
            const templates = state.templates.filter((item) => item.id !== id);
            void localDb.saveTemplateLibrary(serializeLibrary(templates, state.categories));
            return { templates };
        });
        return true;
    },
    duplicateTemplate(id) {
        const source = get().templates.find((item) => item.id === id);
        if (!source) return null;
        const copyId = newLocalId('tpl');
        const now = Date.now();
        set((state) => {
            const templates = [...state.templates, {
                ...source,
                id: copyId,
                name: `${source.name} (${t("common.copy")})`.slice(0, 120),
                builtin: false,
                isPinned: false,
                isStarred: false,
                position: state.templates.filter((item) => item.categoryId === source.categoryId)
                    .reduce((max, item) => Math.max(max, templateOrderValue(item)), -1) + 1,
                createdAt: now,
                updatedAt: now,
            }];
            void localDb.saveTemplateLibrary(serializeLibrary(templates, state.categories));
            return { templates };
        });
        return copyId;
    },
    placeTemplate(id, categoryId, index) {
        const moving = get().templates.find((item) => item.id === id);
        if (!moving) return false;
        const now = Date.now();
        set((state) => {
            const siblings = state.templates
                .filter((item) => item.categoryId === categoryId && item.id !== id)
                .sort((a, b) => templateOrderValue(a) - templateOrderValue(b));
            const clamped = Math.max(0, Math.min(siblings.length, index));
            const ordered = [...siblings.slice(0, clamped), { ...moving, categoryId }, ...siblings.slice(clamped)];
            const positionById = new Map(ordered.map((item, position) => [item.id, position]));
            const templates = state.templates.map((item) => positionById.has(item.id)
                ? { ...item, categoryId, position: positionById.get(item.id), updatedAt: now }
                : item);
            void localDb.saveTemplateLibrary(serializeLibrary(templates, state.categories));
            return { templates };
        });
        return true;
    },
    importTemplates(data) {
        let imported = 0;
        let skipped = 0;
        set((state) => {
            const knownCategoryIds = new Set(state.categories.map((item) => item.id));
            const nextCategories = [...state.categories];
            let nextPosition = Math.max(0, ...state.categories.map((item) => item.position)) + 1;
            for (const category of data.categories) {
                if (knownCategoryIds.has(category.id)) continue;
                knownCategoryIds.add(category.id);
                nextCategories.push({
                    ...category,
                    name: category.name.slice(0, 120),
                    position: nextPosition++,
                });
            }
            const knownTemplateIds = new Set(state.templates.map((item) => item.id));
            const nextTemplates = [...state.templates];
            for (const template of data.templates) {
                if (knownTemplateIds.has(template.id)) {
                    skipped++;
                    continue;
                }
                knownTemplateIds.add(template.id);
                imported++;
                nextTemplates.push({
                    ...template,
                    // Category ids are preserved when they exist locally (custom
                    // categories imported in the same batch included); unknown
                    // ids fall back to Uncategorized instead of dangling.
                    categoryId: knownCategoryIds.has(template.categoryId ?? '') ? template.categoryId : null,
                    name: template.name.slice(0, 120),
                    description: template.description.slice(0, 240),
                    tags: normalizeTags(template.tags),
                    isPinned: false,
                    isStarred: false,
                });
            }
            void localDb.saveTemplateLibrary(serializeLibrary(nextTemplates, nextCategories));
            return {
                categories: orderedCategories(nextCategories),
                templates: nextTemplates,
            };
        });
        return { imported, skipped };
    },
    toggleTemplatePin(id) {
        set((state) => {
            const templates = state.templates.map((item) => item.id === id
                ? { ...item, isPinned: !item.isPinned, updatedAt: Date.now() }
                : item);
            void localDb.saveTemplateLibrary(serializeLibrary(templates, state.categories));
            return { templates };
        });
    },
    toggleTemplateStar(id) {
        set((state) => {
            const templates = state.templates.map((item) => item.id === id
                ? { ...item, isStarred: !item.isStarred, updatedAt: Date.now() }
                : item);
            void localDb.saveTemplateLibrary(serializeLibrary(templates, state.categories));
            return { templates };
        });
    },
}));

function serializeLibrary(templates: NoteTemplate[], categories: NoteTemplateCategory[]): TemplateLibraryData {
    return {
        categories,
        templates,
        seedVersion: TEMPLATE_SEED_VERSION,
    };
}
