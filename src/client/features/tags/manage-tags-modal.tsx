import { useMemo, useState } from 'react';
import { Hash, Plus, Search, X } from 'lucide-react';
import type { Tag } from '@shared/types';
import { Modal, Tooltip, confirm } from '../../components/overlay';
import { Button, IconButton } from '../../components/primitives';
import { useNotes } from '../../store/notes';
import { useUi } from '../../store/ui';
import { t } from '../../lib/i18n';
import { createTag, deleteTag } from './tag-mutations';
import { TagManageRow } from './manage-tags-row';

export function ManageTagsModal({ onClose }: { onClose: () => void }) {
  const tags = useNotes((s) => s.tags ?? []);
  const openView = useUi((s) => s.openView);
  const openTag = (name: string) => {
    openView('tag', { tag: name });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('tags.manage_tags')}
      description={t('tags.manage_description')}
      width={640}
    >
      <TagsManagerPanel tags={tags} onOpenTag={openTag} />
    </Modal>
  );
}

function TagsManagerPanel({
  tags,
  onOpenTag,
}: {
  tags: Tag[];
  onOpenTag: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  return (
    <div className='space-y-3 pt-1'>
      <TagsSearchRow
        tags={tags}
        query={query}
        onQueryChange={setQuery}
        isCreating={isCreating}
        onToggleCreating={() => setIsCreating((open) => !open)}
      />
      {isCreating && <TagCreateForm onDone={() => setIsCreating(false)} />}
      <TagManageList tags={tags} query={query} onOpenTag={onOpenTag} />
    </div>
  );
}

function TagsSearchRow({
  tags,
  query,
  onQueryChange,
  isCreating,
  onToggleCreating,
}: {
  tags: Tag[];
  query: string;
  onQueryChange: (query: string) => void;
  isCreating: boolean;
  onToggleCreating: () => void;
}) {
  const unusedTags = useMemo(() => tags.filter((tag) => tag.count === 0), [tags]);
  return (
    <div className='flex items-center gap-2'>
      <div className='relative flex-1'>
        <Search
          size={14}
          className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]'
        />
        <input
          type='text'
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('notes.tag_filter_search')}
          className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] pl-9 pr-3 text-[length:var(--text-12\\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:shadow-[var(--shadow-focus)]"
        />
      </div>
      {unusedTags.length > 0 && !isCreating && (
        <Tooltip label={t('tags.clean_unused')}>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => void cleanUnusedTags(unusedTags)}
            className='h-8 shrink-0 text-[var(--danger)] hover:bg-[var(--danger-soft)]'
          >
            {t('tags.clean_unused_value0', { value0: unusedTags.length })}
          </Button>
        </Tooltip>
      )}
      {!isCreating && (
        <Tooltip label={t('tags.new')}>
          <Button
            variant='primary'
            size='sm'
            icon={<Plus size={14} className='shrink-0' />}
            onClick={onToggleCreating}
            className='h-8 shrink-0'
          >
            {t('tags.new')}
          </Button>
        </Tooltip>
      )}
    </div>
  );
}

async function cleanUnusedTags(unusedTags: Tag[]): Promise<void> {
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
}

function TagCreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (createTag(trimmed)) {
      setName('');
      onDone();
    }
  };
  return (
    <form
      onSubmit={submit}
      className='flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--accent-soft)]/25 p-2'
    >
      <Hash size={16} className='ml-1 shrink-0 text-[var(--accent)]' />
      <input
        autoFocus
        type='text'
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone();
        }}
        placeholder={t('tags.new_placeholder')}
        className="h-8 flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[length:var(--text-12\\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <Button
        variant='primary'
        size='sm'
        type='submit'
        disabled={!name.trim()}
        className='h-8 shrink-0'
      >
        {t('tags.create')}
      </Button>
      <Tooltip label={t('common.cancel')}>
        <IconButton label={t('common.cancel')} size='sm' type='button' onClick={onDone}>
          <X size={14} />
        </IconButton>
      </Tooltip>
    </form>
  );
}

function TagManageList({
  tags,
  query,
  onOpenTag,
}: {
  tags: Tag[];
  query: string;
  onOpenTag: (name: string) => void;
}) {
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
  return (
    <div className='max-h-[420px] overflow-y-auto space-y-1 divide-y divide-[var(--border-subtle)]/50'>
      {choices.map((tag) => (
        <TagManageRow key={tag.id} tag={tag} onOpenTag={onOpenTag} />
      ))}
      {choices.length === 0 && (
        <div className="py-10 text-center text-[length:var(--text-12\\.5)] text-[var(--text-quaternary)]">
          {t('tags.no_match')}
        </div>
      )}
    </div>
  );
}


