import { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  GitMerge,
  Hash,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Tag } from '@shared/types';
import { ORGANIZER_COLORS } from '@shared/organizer-colors';
import { Modal, confirm } from '../../components/overlay';
import { Button, IconButton } from '../../components/primitives';
import { useNotes } from '../../store/notes';
import { useUi } from '../../store/ui';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';
import {
  createTag,
  deleteTag,
  renameTag,
  setTagColor,
  toggleTagPinned,
} from './tagMutations';

export function ManageTagsModal({ onClose }: { onClose: () => void }) {
  const tags = useNotes((s) => s.tags ?? []);
  const openView = useUi((s) => s.openView);

  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [colorPickerTagId, setColorPickerTagId] = useState<string | null>(null);
  const [mergingSourceTag, setMergingSourceTag] = useState<Tag | null>(null);

  const unusedTags = useMemo(() => tags.filter((t) => t.count === 0), [tags]);

  const choices = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return tags
      .filter((tag) => !normalized || tag.name.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => {
        const aPinned = Boolean(a.isPinned);
        const bPinned = Boolean(b.isPinned);
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        return b.count - a.count || a.name.localeCompare(b.name);
      });
  }, [tags, query]);

  const handleCreate = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    const id = createTag(trimmed);
    if (id) {
      setNewTagName('');
      setIsCreating(false);
    }
  };

  const handleSaveRename = (tag: Tag) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== tag.name) {
      void renameTag(tag, trimmed);
    }
    setRenamingId(null);
  };

  const handleCleanUnused = async () => {
    if (!unusedTags.length) return;
    const ok = await confirm({
      title: t('tags.clean_unused'),
      description: t('tags.clean_unused_confirm_value0', { value0: unusedTags.length }),
      tone: 'danger',
      confirmLabel: t('common.delete'),
    });
    if (!ok) return;
    for (const tag of unusedTags) {
      void deleteTag(tag);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={t('tags.manage_tags')}
        description={t('tags.manage_description')}
        width={640}
      >
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('notes.tag_filter_search')}
                className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] pl-9 pr-3 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-ring)]"
              />
            </div>
            {unusedTags.length > 0 && !isCreating && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleCleanUnused()}
                className="h-8 shrink-0 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              >
                {t('tags.clean_unused_value0', { value0: unusedTags.length })}
              </Button>
            )}
            {!isCreating && (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} className="shrink-0" />}
                onClick={() => {
                  setIsCreating(true);
                  setNewTagName('');
                }}
                className="h-8 shrink-0"
              >
                {t('tags.new')}
              </Button>
            )}
          </div>

          {isCreating && (
            <form
              onSubmit={handleCreate}
              className="flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--accent-soft)]/25 p-2"
            >
              <Hash size={16} className="ml-1 shrink-0 text-[var(--accent)]" />
              <input
                autoFocus
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsCreating(false);
                }}
                placeholder={t('tags.new_placeholder')}
                className="h-8 flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={!newTagName.trim()}
                className="h-8 shrink-0"
              >
                {t('tags.create')}
              </Button>
              <IconButton
                label={t('common.cancel')}
                size="sm"
                type="button"
                onClick={() => setIsCreating(false)}
              >
                <X size={14} />
              </IconButton>
            </form>
          )}

          <div className="max-h-[420px] overflow-y-auto space-y-1 divide-y divide-[var(--border-subtle)]/50">
            {choices.map((tag) => {
              const isRenaming = renamingId === tag.id;
              const isColorPickerOpen = colorPickerTagId === tag.id;

              return (
                <div key={tag.id} className="group rounded-[var(--r-md)] p-2 transition-colors hover:bg-[var(--bg-hover)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setColorPickerTagId(isColorPickerOpen ? null : tag.id)
                        }
                        title={t('tags.color')}
                        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-transform hover:scale-105"
                        style={{ color: tag.color ?? 'var(--text-quaternary)' }}
                      >
                        <Hash
                          size={14}
                          className={tag.color ? 'drop-shadow-sm' : ''}
                          style={{ color: tag.color ?? 'var(--text-quaternary)' }}
                        />
                      </button>

                      {isRenaming ? (
                        <div className="flex flex-1 items-center gap-1.5">
                          <input
                            autoFocus
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(tag);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            className="h-7 flex-1 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--bg-surface)] px-2 text-[12.5px] outline-none"
                          />
                          <IconButton
                            label={t('common.save')}
                            size="sm"
                            onClick={() => handleSaveRename(tag)}
                          >
                            <Check size={13} className="text-[var(--accent)]" />
                          </IconButton>
                          <IconButton
                            label={t('common.cancel')}
                            size="sm"
                            onClick={() => setRenamingId(null)}
                          >
                            <X size={13} />
                          </IconButton>
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                              #{tag.name}
                            </span>
                            {tag.isPinned && (
                              <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--accent-soft)] text-[var(--accent)]">
                                <Pin size={10} className="fill-current" />
                                {t('tags.pinned')}
                              </span>
                            )}
                            <span className="shrink-0 text-[11px] text-[var(--text-quaternary)]">
                              {t('tags.notes_count', { value0: tag.count })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {!isRenaming && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-85 group-hover:opacity-100">
                        <IconButton
                          label={tag.isPinned ? t('notes.unpin') : t('notes.pin')}
                          size="sm"
                          onClick={() => void toggleTagPinned(tag)}
                        >
                          <Pin
                            size={13}
                            className={tag.isPinned ? 'fill-current text-[var(--accent)]' : ''}
                          />
                        </IconButton>
                        <IconButton
                          label={t('tags.merge_into')}
                          size="sm"
                          onClick={() => setMergingSourceTag(tag)}
                        >
                          <GitMerge size={13} />
                        </IconButton>
                        <IconButton
                          label={t('tags.open_tag')}
                          size="sm"
                          onClick={() => {
                            openView('tag', { tag: tag.name });
                            onClose();
                          }}
                        >
                          <ExternalLink size={13} />
                        </IconButton>
                        <IconButton
                          label={t('tags.rename')}
                          size="sm"
                          onClick={() => {
                            setRenamingId(tag.id);
                            setRenameValue(tag.name);
                          }}
                        >
                          <Pencil size={13} />
                        </IconButton>
                        <IconButton
                          label={t('tags.delete')}
                          size="sm"
                          className="text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                          onClick={() => void deleteTag(tag)}
                        >
                          <Trash2 size={13} />
                        </IconButton>
                      </div>
                    )}
                  </div>

                  {isColorPickerOpen && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
                      <button
                        type="button"
                        aria-label={t('tags.clear_color')}
                        title={t('tags.clear_color')}
                        onClick={() => {
                          void setTagColor(tag, null);
                          setColorPickerTagId(null);
                        }}
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
                          !tag.color
                            ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
                            : 'border-[var(--border-default)]'
                        )}
                      >
                        <Hash size={12} />
                      </button>
                      {ORGANIZER_COLORS.map((color) => {
                        const isSelected = tag.color === color;
                        return (
                          <button
                            key={color}
                            type="button"
                            aria-label={color}
                            title={color}
                            onClick={() => {
                              void setTagColor(tag, color);
                              setColorPickerTagId(null);
                            }}
                            className={cn(
                              'flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110',
                              isSelected && 'ring-2 ring-[var(--accent-ring)] ring-offset-1 ring-offset-[var(--bg-surface)]'
                            )}
                            style={{ backgroundColor: color }}
                          >
                            {isSelected && <Check size={12} className="text-white drop-shadow-sm" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {choices.length === 0 && (
              <div className="py-10 text-center text-[12.5px] text-[var(--text-quaternary)]">
                {t('tags.no_match')}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {mergingSourceTag && (
        <Modal
          open
          onClose={() => setMergingSourceTag(null)}
          title={t('tags.merge_into')}
          description={t('tags.merge_choose_target_desc', { value0: mergingSourceTag.name })}
          width={440}
        >
          <div className="space-y-3 pt-1">
            <div className="max-h-[320px] overflow-y-auto space-y-1 divide-y divide-[var(--border-subtle)]/50">
              {tags
                .filter((t) => t.id !== mergingSourceTag.id)
                .map((targetTag) => (
                  <button
                    key={targetTag.id}
                    type="button"
                    onClick={() => {
                      const src = mergingSourceTag;
                      setMergingSourceTag(null);
                      void renameTag(src, targetTag.name);
                    }}
                    className="flex w-full items-center justify-between rounded-[var(--r-sm)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <div className="flex items-center gap-2">
                      <Hash
                        size={13}
                        style={{ color: targetTag.color ?? 'var(--text-quaternary)' }}
                      />
                      <span className="text-[13px] font-medium text-[var(--text-primary)]">
                        #{targetTag.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--text-quaternary)]">
                      {t('tags.notes_count', { value0: targetTag.count })}
                    </span>
                  </button>
                ))}
              {tags.length <= 1 && (
                <div className="py-8 text-center text-[12px] text-[var(--text-quaternary)]">
                  {t('tags.no_other_tags_to_merge')}
                </div>
              )}
            </div>
            <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
              <Button size="sm" onClick={() => setMergingSourceTag(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
