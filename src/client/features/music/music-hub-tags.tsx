import { useMemo, useState } from 'react'
import { ChevronsDownUp, ChevronsUpDown, Plus, Search, Settings2 } from 'lucide-react'
import type { Tag } from '@shared/types'
import { IconButton, SectionLabel } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { TagDraftRow, TagTreeList, TagTreeListEmpty, useTagTree } from '../tags'
import type { TagRowActions } from '../tags'
import { useMusic, useTagCounts } from './music-store'
import { leafTagName, toTagRows } from './music-tag-rows'

export function MusicHubTags({ onManage }: { onManage: () => void }) {
  const [draftPrefix, setDraftPrefix] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const data = useMusicTags(onManage, (tag) => { setDraftPrefix(tag.name + '/'); setIsCreating(true) })
  const [query, setQuery] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  return (
    <section aria-label={t('music.tags')}>
      <MusicTagsHeader
        canToggle={data.tree.canToggle}
        allExpanded={data.tree.allExpanded}
        onToggleAll={data.tree.toggleAll}
        onManage={onManage}
        onCreate={() => { setDraftPrefix(''); setIsCreating(true) }}
      />
      {data.rows.length > 0 && <MusicTagsSearch query={query} onChange={setQuery} />}
      <div className='mt-0.5 space-y-px'>
        {isCreating && (
          <TagDraftRow
            initialValue={draftPrefix}
            onFinish={(value) => { setIsCreating(false); data.create(value) }}
            onCancel={() => setIsCreating(false)}
          />
        )}
        <MusicTagsList data={data} query={query} renamingId={renamingId} onRenamingChange={setRenamingId} />
        {data.rows.length === 0 && !isCreating && <TagTreeListEmpty title={t('music.no_tags')} />}
      </div>
    </section>
  )
}

interface MusicTagData {
  rows: Tag[]
  tree: ReturnType<typeof useTagTree>
  actions: (tag: Tag) => TagRowActions
  activeName: string | null
  select: (name: string) => void
  rename: (tag: Tag, value: string) => void
  create: (value: string) => void
}

function useMusicTags(onManage: () => void, onCreateChild: (tag: Tag) => void): MusicTagData {
  const tags = useMusic((state) => state.tags)
  const scope = useMusic((state) => state.scope)
  const counts = useTagCounts()
  const rows = useMemo(() => toTagRows(tags, counts), [tags, counts])
  const tree = useTagTree(rows)
  const actions = (tag: Tag): TagRowActions => ({
    onTogglePin: () => void useMusic.getState().patchTag(tag.id, { isPinned: !tag.isPinned }),
    onSelectColor: (color) => void useMusic.getState().patchTag(tag.id, { color }),
    onManageTags: onManage,
    onDelete: () => void useMusic.getState().deleteTag(tag.id),
    onCreateChild: () => onCreateChild(tag),
  })
  return {
    rows,
    tree,
    actions,
    activeName: scope.kind === 'tag' ? rows.find((row) => row.id === scope.tagId)?.name ?? null : null,
    select: (name) => {
      const row = rows.find((entry) => entry.name === name)
      if (row) useMusic.getState().setScope({ kind: 'tag', tagId: row.id })
    },
    rename: (tag, value) => void useMusic.getState().patchTag(tag.id, { name: leafTagName(value) }),
    create: (value) => void useMusic.getState().createTag(value, null),
  }
}

function MusicTagsList({ data, query, renamingId, onRenamingChange }: {
  data: MusicTagData
  query: string
  renamingId: string | null
  onRenamingChange: (id: string | null) => void
}) {
  const normalized = query.trim().toLocaleLowerCase()
  const results = useMemo(
    () => (normalized ? data.rows.filter((row) => row.name.toLocaleLowerCase().includes(normalized)) : undefined),
    [data.rows, normalized],
  )
  return (
    <>
      <TagTreeList
        nodes={data.tree.nodes}
        expandedPaths={data.tree.expandedPaths}
        onTogglePath={data.tree.togglePath}
        actions={data.actions}
        activeName={data.activeName}
        searchQuery={query}
        searchResults={results}
        renamingId={renamingId}
        onSelect={(name) => data.select(name)}
        onStartRename={onRenamingChange}
        onFinishRename={(tag, value) => { onRenamingChange(null); data.rename(tag, value) }}
        onCancelRename={() => onRenamingChange(null)}
      />
      {results && results.length === 0 && <TagTreeListEmpty />}
    </>
  )
}

function MusicTagsSearch({ query, onChange }: { query: string; onChange: (value: string) => void }) {
  return (
    <div className='relative mt-1.5'>
      <Search size={12} className='pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[var(--text-quaternary)]' />
      <input
        aria-label={t('notes.tag_filter_search')}
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('notes.tag_filter_search')}
        className='h-7 w-full rounded-[var(--r-sm)] bg-[var(--bg-inset)] pr-2 pl-6 text-[length:var(--text-12)] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:outline-none'
      />
    </div>
  )
}

function MusicTagsHeader({ canToggle, allExpanded, onToggleAll, onManage, onCreate }: {
  canToggle: boolean
  allExpanded: boolean
  onToggleAll: () => void
  onManage: () => void
  onCreate: () => void
}) {
  const actionClass = 'opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100'
  return (
    <div className='group/head flex items-center justify-between pr-1'>
      <SectionLabel>{t('music.tags')}</SectionLabel>
      <div className='flex items-center gap-0.5'>
        {canToggle && (
          <Tooltip label={allExpanded ? t('tags.collapse_all') : t('tags.expand_all')} side='left'>
            <IconButton label={allExpanded ? t('tags.collapse_all') : t('tags.expand_all')} size='sm' onClick={onToggleAll} className={actionClass}>
              {allExpanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip label={t('tags.manage_tags')} side='left'>
          <IconButton label={t('tags.manage_tags')} size='sm' onClick={onManage} className={actionClass}>
            <Settings2 size={13} />
          </IconButton>
        </Tooltip>
        <Tooltip label={t('tags.new')} side='right'>
          <IconButton label={t('tags.new')} size='sm' onClick={onCreate} className={actionClass}>
            <Plus size={13} />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  )
}