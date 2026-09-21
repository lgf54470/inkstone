import { useState } from 'react'
import { KeyRound, Lock, LockOpen, Moon, Sun } from 'lucide-react'
import { LIMITS } from '@shared/constants'
import type { PublicCollectionNote } from '@shared/types'
import { Badge, Button, IconButton, Logo } from '../../../components/primitives'
import { Input } from '../../../components/form'
import { LoadingBlock } from '../../../components/feedback'
import { Tooltip } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { useCollectionPage } from './use-collection-page'

/**
 * The collection a visitor lands on (ADR-0005). It is a directory and nothing more: every entry is a
 * link to that note's own page, carrying `?ref=collection` so the owner can see which visits came
 * from here. A member that has its own password says so, because clicking through and meeting a
 * password prompt without warning reads as a broken link.
 */
export function CollectionPage({ slug }: { slug: string }) {
  const bundle = useCollectionPage(slug)
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
  }
  return (
    <div className='h-full overflow-y-auto overscroll-contain bg-[var(--bg-base)]'>
      <header className='sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/85 pt-[env(safe-area-inset-top)] backdrop-blur'>
        <div className='mx-auto flex h-12 max-w-215 items-center gap-3 px-4 md:px-5'>
          <span className='flex items-center gap-1.5 text-[var(--accent)]'>
            <Logo size={15} />
          </span>
          <span className='text-[length:var(--text-12\.5)] font-semibold tracking-[var(--tracking-heading)] text-[var(--text-primary)]'>
            {bundle.title || t('share.category_collections')}
          </span>
          <span className='flex-1' />
          <Tooltip label={t('share.switch_theme')} side='left'>
            <IconButton label={t('share.switch_theme')} onClick={toggleTheme} className='text-[var(--text-tertiary)]'>
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </IconButton>
          </Tooltip>
        </div>
      </header>
      <main className='mx-auto max-w-215 px-4 pb-[calc(64px+env(safe-area-inset-bottom))] md:px-5 md:pb-24'>
        <CollectionBody bundle={bundle} />
      </main>
    </div>
  )
}

function CollectionBody({ bundle }: { bundle: ReturnType<typeof useCollectionPage> }) {
  const { isPasswordRequired, isLoading, error, notes, nextCursor, isLoadingMore, loadMore, count, title } = bundle
  if (isLoading && notes.length === 0) {
    return <div className='pt-24'><LoadingBlock label={t('share.collection_page_opening')} /></div>
  }
  if (isPasswordRequired) return <CollectionPasswordGate bundle={bundle} />
  if (error && notes.length === 0) return <CollectionUnavailable message={error} />
  if (notes.length === 0) return <CollectionEmpty />
  return (
    <CollectionDirectory
      title={title}
      count={count}
      notes={notes}
      hasMore={Boolean(nextCursor)}
      isLoadingMore={isLoadingMore}
      onLoadMore={() => void loadMore()}
    />
  )
}

function CollectionPasswordGate({ bundle }: { bundle: ReturnType<typeof useCollectionPage> }) {
  const { password, setPassword, error, isLoading, load } = bundle
  return (
    <div className='anim-rise mx-auto max-w-85 pt-[16vh] text-center'>
      <div className='mx-auto mb-4 flex size-12 items-center justify-center rounded-[var(--r-xl)] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-tertiary)]'>
        <Lock size={20} />
      </div>
      <h1 className='text-[length:var(--text-16)] font-semibold text-[var(--text-primary)]'>
        {t('share.collection_page_requires_password')}
      </h1>
      <p className='mt-1.5 text-[length:var(--text-12\.5)] text-[var(--text-tertiary)]'>
        {t('share.collection_page_passcode_hint')}
      </p>
      <form
        className='mt-5 space-y-2.5'
        onSubmit={(event) => {
          event.preventDefault()
          void load(password)
        }}
      >
        <Input
          aria-label={t('common.access_passcode')}
          type='password'
          value={password}
          maxLength={LIMITS.passwordMaxLength}
          autoComplete='current-password'
          autoFocus
          leading={<KeyRound size={13} />}
          invalid={Boolean(error)}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p role='alert' className='text-[length:var(--text-12)] text-[var(--danger)]'>{error}</p>}
        <Button type='submit' variant='primary' block loading={isLoading}>{t('share.collection_page_open')}</Button>
      </form>
    </div>
  )
}

function CollectionUnavailable({ message }: { message: string }) {
  return (
    <div className='mx-auto max-w-95 pt-[18vh] text-center'>
      <h1 className='text-[length:var(--text-16)] font-semibold text-[var(--text-primary)]'>
        {t('share.collection_page_unavailable')}
      </h1>
      <p role='alert' className='mt-2 text-[length:var(--text-13)] leading-relaxed text-[var(--text-tertiary)]'>{message}</p>
    </div>
  )
}

function CollectionEmpty() {
  return (
    <div className='mx-auto max-w-95 pt-[18vh] text-center'>
      <h1 className='text-[length:var(--text-16)] font-semibold text-[var(--text-primary)]'>
        {t('share.collection_page_empty')}
      </h1>
    </div>
  )
}

/** One entry: the link, an excerpt to recognise it by, and whether it will ask for its own password. */
function DirectoryNote({ note }: { note: PublicCollectionNote }) {
  return (
    <li className='flex items-start gap-3 py-3'>
      <div className='min-w-0 flex-1'>
        <a
          href={noteLink(note.slug)}
          className='text-[length:var(--text-14)] font-medium text-[var(--text-primary)] underline-offset-2 hover:text-[var(--accent)] hover:underline'
        >
          {note.title || t('common.untitled_note')}
        </a>
        {note.excerpt && (
          <p className='mt-1 line-clamp-2 text-[length:var(--text-12)] leading-relaxed text-[var(--text-tertiary)]'>
            {note.excerpt}
          </p>
        )}
      </div>
      {note.hasPassword && (
        <Badge tone='warning' className='mt-0.5 shrink-0'>
          <Lock size={9} className='mr-1' />
          {t('share.collection_page_needs_password')}
        </Badge>
      )}
    </li>
  )
}

function CollectionDirectory({ title, count, notes, hasMore, isLoadingMore, onLoadMore }: {
  title: string
  count: number
  notes: PublicCollectionNote[]
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}) {
  return (
    <article className='pt-7 md:pt-10'>
      <header className='mb-5'>
        <h1 className='text-[length:var(--text-24)] leading-[1.25] font-bold tracking-[var(--tracking-share-h1)] text-[var(--text-primary)] md:text-[length:var(--text-30)]'>
          {title || t('share.category_collections')}
        </h1>
        <p className='mt-2 text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
          {t('share.collection_page_count', { count })}
        </p>
      </header>
      <ul className='divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]'>
        {notes.map((note) => <DirectoryNote key={note.slug} note={note} />)}
      </ul>
      {hasMore && (
        <div className='mt-5 text-center'>
          <Button variant='secondary' loading={isLoadingMore} onClick={onLoadMore}>
            {t('share.collection_page_load_more')}
          </Button>
        </div>
      )}
      <footer className='mt-16 border-t border-[var(--border-subtle)] pt-6 text-center'>
        <span className='inline-flex items-center gap-1.5 text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]'>
          <LockOpen size={12} />
          {t('share.collection_view_not_snapshot')}
        </span>
      </footer>
    </article>
  )
}

/**
 * Where a directory entry goes: the note's own share page, marked as having come from here. The
 * marker is the same `?ref=` contract the rest of the module uses (ADR-0004), so a visit from a
 * collection is counted as a visit to that note — with the collection as its channel.
 */
function noteLink(slug: string): string {
  return `/s/${slug}?ref=collection`
}
