import type { ReactElement, ReactNode, RefObject } from 'react'
import { Loader2, Search, X } from 'lucide-react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  clearLabel: string
  /** 输入为空且非加载中时右侧的占位内容（如快捷键提示） */
  trailingEmpty?: ReactNode
  /** 加载中显示 spinner 并隐藏清除按钮，避免误触清除在途请求 */
  loading?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  /** boxed=带边框小输入框（侧边栏），bare=无边框行内输入（弹窗） */
  variant?: 'boxed' | 'bare'
}

// 全站搜索框统一实现：输入有内容即显示清除按钮，保证交互一致
export default function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearLabel,
  trailingEmpty,
  loading = false,
  inputRef,
  variant = 'boxed',
}: SearchInputProps): ReactElement {
  return (
    <div
      className={`flex items-center gap-1.5 ${
        variant === 'boxed' ? 'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-1.5' : ''
      }`}
    >
      <Search className='w-3.5 h-3.5 text-[var(--text-quaternary)] shrink-0' aria-hidden='true' />
      <input
        ref={inputRef}
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`flex-1 min-w-0 bg-transparent focus:outline-none placeholder:text-[var(--text-quaternary)] text-[var(--text-primary)] ${
          variant === 'boxed' ? 'text-xs' : 'text-sm'
        }`}
      />
      {loading ? (
        <Loader2 className='w-4 h-4 text-[var(--accent)] animate-spin shrink-0' aria-hidden='true' />
      ) : value !== '' ? (
        <button
          type='button'
          onClick={() => onChange('')}
          aria-label={clearLabel}
          className='p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer shrink-0'
        >
          <X className='w-3.5 h-3.5' aria-hidden='true' />
        </button>
      ) : (
        trailingEmpty ?? null
      )}
    </div>
  )
}