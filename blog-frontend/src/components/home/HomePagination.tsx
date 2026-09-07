import type { ReactElement } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buildPageItems } from '../../lib/pagination'
import { t, DEFAULT_LOCALE, type BlogLocale } from '../../lib/i18n'

export interface HomePaginationProps {
  currentPage: number
  totalPages: number
  pageSize: number
  total: number
  pageSizeOptions?: number[]
  locale?: BlogLocale
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50]

function PageSizeSelector({
  pageSize,
  total,
  options,
  locale,
  onPageSizeChange,
}: {
  pageSize: number
  total: number
  options: number[]
  locale: BlogLocale
  onPageSizeChange: (size: number) => void
}): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] focus:border-[var(--accent)] focus:outline-hidden"
        aria-label={t('pagination.page_size', { size: pageSize }, locale)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {t('pagination.page_size', { size: opt }, locale)}
          </option>
        ))}
      </select>
      <span className="text-xs text-[var(--text-tertiary)]">
        {t('pagination.total_count', { total }, locale)}
      </span>
    </div>
  )
}

function PageNumberButton({
  item,
  isCurrent,
  onPageChange,
}: {
  item: number | '...'
  isCurrent: boolean
  onPageChange: (page: number) => void
}): ReactElement {
  if (item === '...') {
    return (
      <span className="px-1.5 text-xs text-[var(--text-tertiary)]">
        ...
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onPageChange(item)}
      className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-medium transition-all ${
        isCurrent
          ? 'bg-[var(--accent)] text-white shadow-[var(--shadow-xs)] font-bold'
          : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer'
      }`}
      aria-current={isCurrent ? 'page' : undefined}
    >
      {item}
    </button>
  )
}

function NavArrowButton({
  direction,
  disabled,
  label,
  onClick,
}: {
  direction: 'prev' | 'next'
  disabled: boolean
  label: string
  onClick: () => void
}): ReactElement {
  const isPrev = direction === 'prev'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-xs transition-colors ${
        !disabled
          ? 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer'
          : 'bg-[var(--bg-surface)] text-[var(--text-quaternary)] opacity-50 cursor-not-allowed'
      }`}
      aria-label={label}
    >
      {isPrev && <ChevronLeft size={13} aria-hidden="true" />}
      <span className="hidden sm:inline">{label}</span>
      {!isPrev && <ChevronRight size={13} aria-hidden="true" />}
    </button>
  )
}

function PageNavButtons({
  currentPage,
  totalPages,
  locale,
  onPageChange,
}: {
  currentPage: number
  totalPages: number
  locale: BlogLocale
  onPageChange: (page: number) => void
}): ReactElement {
  const pages = buildPageItems(currentPage, Math.max(1, totalPages))
  return (
    <div className="flex items-center gap-1">
      <NavArrowButton
        direction="prev"
        disabled={currentPage <= 1}
        label={t('pagination.prev', {}, locale)}
        onClick={() => onPageChange(currentPage - 1)}
      />
      {pages.map((item, idx) => (
        <PageNumberButton
          key={typeof item === 'number' ? item : `ellipsis-${idx}`}
          item={item}
          isCurrent={item === currentPage}
          onPageChange={onPageChange}
        />
      ))}
      <NavArrowButton
        direction="next"
        disabled={currentPage >= totalPages}
        label={t('pagination.next', {}, locale)}
        onClick={() => onPageChange(currentPage + 1)}
      />
    </div>
  )
}

export default function HomePagination({
  currentPage,
  totalPages,
  pageSize,
  total,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  locale = DEFAULT_LOCALE,
  onPageChange,
  onPageSizeChange,
}: HomePaginationProps): ReactElement {
  return (
    <nav
      className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)]/70 pt-4"
      aria-label={t('pagination.aria', {}, locale)}
    >
      <PageSizeSelector
        pageSize={pageSize}
        total={total}
        options={pageSizeOptions}
        locale={locale}
        onPageSizeChange={onPageSizeChange}
      />
      <PageNavButtons
        currentPage={currentPage}
        totalPages={totalPages}
        locale={locale}
        onPageChange={onPageChange}
      />
    </nav>
  )
}
