import { memo, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  Hash,
  List,
  Plus,
  SlidersHorizontal,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  deleteFrontMatterProperty,
  parseFrontMatter,
  renameFrontMatterProperty,
  upsertFrontMatterProperty,
} from '@shared/markdown-utils';
import { TagPill } from '../../components/TagPill';
import { Tooltip } from '../../components/overlay';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';
import { useNotes } from '../../store/notes';
import { useUi } from '../../store/ui';

export interface NotePropertiesEditorProps {
  noteId: string | null;
  content: string;
  className?: string;
}

export const NotePropertiesEditor = memo(function NotePropertiesEditor({
  noteId,
  content,
  className,
}: NotePropertiesEditorProps) {
  const allStoreTags = useNotes((s) => s.tags ?? []);
  const tagColors = useMemo(
    () => new Map(allStoreTags.map((item) => [item.name, item.color])),
    [allStoreTags]
  );

  const frontMatter = useMemo(() => parseFrontMatter(content), [content]);
  const properties = useMemo(
    () => Object.entries(frontMatter.data),
    [frontMatter.data]
  );

  const [isExpanded, setIsExpanded] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [renamedKey, setRenamedKey] = useState('');

  const [isAddingProperty, setIsAddingProperty] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagText, setNewTagText] = useState('');

  const applyContentChange = (nextContent: string) => {
    if (!noteId || nextContent === content) return;
    useNotes.getState().editContent(noteId, nextContent);
  };

  const handleUpdate = (key: string, value: unknown) => {
    applyContentChange(upsertFrontMatterProperty(content, key, value));
  };

  const handleDelete = (key: string) => {
    applyContentChange(deleteFrontMatterProperty(content, key));
  };

  const handleRename = (oldKey: string, nextKey: string) => {
    const trimmed = nextKey.trim();
    if (!trimmed || trimmed === oldKey) {
      setEditingKey(null);
      return;
    }
    applyContentChange(renameFrontMatterProperty(content, oldKey, trimmed));
    setEditingKey(null);
  };

  const getTagsList = (val: unknown): string[] => {
    if (Array.isArray(val)) {
      return val.filter((item): item is string => typeof item === 'string').map((item) => item.replace(/^#/, ''));
    }
    if (typeof val === 'string' && val.trim()) {
      return val.replace(/^\[|\]$/g, '').split(/[,\s]+/).filter(Boolean).map((item) => item.replace(/^#/, ''));
    }
    return [];
  };

  const handleRemoveTag = (tagName: string) => {
    const currentTags = getTagsList(frontMatter.data.tags ?? frontMatter.data.tag);
    const nextTags = currentTags.filter((t) => t.toLowerCase() !== tagName.toLowerCase());
    handleUpdate('tags', nextTags);
  };

  const handleAddTag = (tagName: string) => {
    const clean = tagName.trim().replace(/^#/, '');
    if (!clean) {
      setIsAddingTag(false);
      return;
    }
    const currentTags = getTagsList(frontMatter.data.tags ?? frontMatter.data.tag);
    if (!currentTags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      handleUpdate('tags', [...currentTags, clean]);
    }
    setNewTagText('');
    setIsAddingTag(false);
  };

  const handleCommitNewProperty = () => {
    const k = newKey.trim();
    if (!k) {
      setIsAddingProperty(false);
      return;
    }
    let val: unknown = newValue.trim();
    if (k === 'tags' || k === 'tag') {
      val = val ? [String(val).replace(/^#/, '')] : [];
    } else if (val === 'true') {
      val = true;
    } else if (val === 'false') {
      val = false;
    }
    handleUpdate(k, val);
    setNewKey('');
    setNewValue('');
    setIsAddingProperty(false);
  };

  const renderPropertyIcon = (key: string, val: unknown) => {
    if (key === 'tags' || key === 'tag') return <Hash size={13} className="shrink-0 text-[var(--accent)]" />;
    if (typeof val === 'boolean') return <Check size={13} className="shrink-0 text-[var(--text-tertiary)]" />;
    if (Array.isArray(val)) return <List size={13} className="shrink-0 text-[var(--text-tertiary)]" />;
    if (key.includes('date') || key.includes('time') || key === 'created' || key === 'updated') {
      return <Calendar size={13} className="shrink-0 text-[var(--text-tertiary)]" />;
    }
    return <Type size={13} className="shrink-0 text-[var(--text-tertiary)]" />;
  };

  if (!properties.length && !isAddingProperty) {
    return (
      <div className={cn('mb-4 flex items-center justify-between rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-1.5 text-[11.5px] text-[var(--text-tertiary)]', className)}>
        <span className="flex items-center gap-1.5 font-medium">
          <SlidersHorizontal size={13} />
          {t('markdown.properties')}
        </span>
        <button
          type="button"
          onClick={() => {
            setIsExpanded(true);
            setIsAddingProperty(true);
          }}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
        >
          <Plus size={12} />
          {t('properties.add_property')}
        </button>
      </div>
    );
  }

  return (
    <div className={cn('mb-4 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 text-[12px]', className)}>
      <div className="flex items-center justify-between px-3 py-2 text-[var(--text-secondary)]">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 font-medium text-[var(--text-primary)] hover:opacity-80 transition-opacity"
        >
          <SlidersHorizontal size={13} className="text-[var(--text-tertiary)]" />
          <span>{t('markdown.properties')}</span>
          <span className="rounded-full bg-[var(--surface-tertiary)] px-1.5 py-0.2 text-[10.5px] font-normal text-[var(--text-tertiary)]">
            {properties.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ChevronDown size={14} className={cn('transition-transform duration-200', !isExpanded && '-rotate-90')} />
        </button>
      </div>

      {isExpanded && (
        <div className="border-t border-[var(--border-subtle)]">
          <div className="divide-y divide-[var(--border-subtle)]/50">
            {properties.map(([key, value]) => {
              const isTags = key === 'tags' || key === 'tag';
              const tagsList = isTags ? getTagsList(value) : [];

              return (
                <div
                  key={key}
                  className="group/row grid grid-cols-[140px_1fr_28px] items-center gap-2 px-3 py-1.5 transition-colors hover:bg-[var(--surface-hover)]/30"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {renderPropertyIcon(key, value)}
                    {editingKey === key ? (
                      <input
                        autoFocus
                        value={renamedKey}
                        onChange={(e) => setRenamedKey(e.target.value)}
                        onBlur={() => handleRename(key, renamedKey)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(key, renamedKey);
                          if (e.key === 'Escape') setEditingKey(null);
                        }}
                        className="w-full rounded bg-[var(--surface-primary)] px-1.5 py-0.5 text-[11.5px] text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent)]"
                      />
                    ) : (
                      <span
                        title={key}
                        onClick={() => {
                          setEditingKey(key);
                          setRenamedKey(key);
                        }}
                        className="cursor-pointer truncate font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {key}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    {isTags ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tagsList.map((tag) => (
                          <TagPill
                            key={tag}
                            tag={tag}
                            color={tagColors.get(tag)}
                            size="md"
                            removable
                            onClick={() => useUi.getState().openView('tag', { tag })}
                            onRemove={() => handleRemoveTag(tag)}
                          />
                        ))}

                        {isAddingTag ? (
                          <input
                            autoFocus
                            value={newTagText}
                            onChange={(e) => setNewTagText(e.target.value)}
                            onBlur={() => handleAddTag(newTagText)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddTag(newTagText);
                              if (e.key === 'Escape') setIsAddingTag(false);
                            }}
                            placeholder={t('tags.new_placeholder')}
                            className="h-6 w-24 rounded-full bg-[var(--surface-primary)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent)]"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingTag(true);
                              setNewTagText('');
                            }}
                            className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-[var(--border-default)] px-2 text-[11px] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          >
                            <Plus size={11} />
                            {t('properties.add_tag')}
                          </button>
                        )}
                      </div>
                    ) : typeof value === 'boolean' ? (
                      <button
                        type="button"
                        onClick={() => handleUpdate(key, !value)}
                        className={cn(
                          'inline-flex h-5 w-9 items-center rounded-full transition-colors p-0.5',
                          value ? 'bg-[var(--accent)]' : 'bg-[var(--surface-tertiary)]'
                        )}
                      >
                        <span
                          className={cn(
                            'size-4 rounded-full bg-white transition-transform',
                            value ? 'translate-x-4' : 'translate-x-0'
                          )}
                        />
                      </button>
                    ) : Array.isArray(value) ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {value.map((item, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded bg-[var(--surface-tertiary)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)]"
                          >
                            {String(item)}
                            <button
                              type="button"
                              onClick={() => {
                                const next = value.filter((_, i) => i !== idx);
                                handleUpdate(key, next);
                              }}
                              className="text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <input
                        defaultValue={value == null ? '' : String(value)}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val !== String(value ?? '')) {
                            handleUpdate(key, val);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-full rounded bg-transparent px-1.5 py-0.5 text-[12px] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-primary)] focus:bg-[var(--surface-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      />
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Tooltip label={t('properties.delete_property')} side="left">
                      <button
                        type="button"
                        aria-label={t('properties.delete_property')}
                        onClick={() => handleDelete(key)}
                        className="rounded p-1 text-[var(--text-tertiary)] opacity-0 transition-all hover:bg-[var(--danger-softer)] hover:text-[var(--danger)] group-hover/row:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>

          {isAddingProperty ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-tertiary)]/30 px-3 py-2">
              <input
                autoFocus
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder={t('properties.property_name')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitNewProperty();
                  if (e.key === 'Escape') setIsAddingProperty(false);
                }}
                className="h-7 w-32 rounded border border-[var(--border-default)] bg-[var(--surface-primary)] px-2 text-[11.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={t('properties.property_value')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitNewProperty();
                  if (e.key === 'Escape') setIsAddingProperty(false);
                }}
                className="h-7 min-w-[140px] flex-1 rounded border border-[var(--border-default)] bg-[var(--surface-primary)] px-2 text-[11.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCommitNewProperty}
                  className="inline-flex h-7 items-center rounded bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90"
                >
                  <Check size={12} className="mr-1" />
                  {t('overlay.confirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingProperty(false)}
                  className="inline-flex h-7 items-center rounded px-2 text-[11.5px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-tertiary)]/20 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddingProperty(true);
                  setNewKey('');
                  setNewValue('');
                }}
                className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
              >
                <Plus size={12} />
                {t('properties.add_property')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
