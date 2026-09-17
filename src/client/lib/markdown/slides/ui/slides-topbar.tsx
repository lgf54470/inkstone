import { memo, useState } from 'react'
import { t } from '../../../i18n'

interface SlidesTopbarProps {
  title: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onUpdateTitle: (title: string) => void
  onAddText: () => void
  onAddShape: (shape: 'rect' | 'rounded' | 'circle' | 'card') => void
  onAddImage: () => void
  onAddTable: () => void
  onAddChart: (preset: 'bar' | 'line' | 'pie') => void
  onAddCode: () => void
  onPresent: () => void
  onClose: () => void
  zoom: number
  onZoomChange: (delta: number) => void
}

export const SlidesTopbar = memo(function SlidesTopbar({
  title,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onUpdateTitle,
  onAddText,
  onAddShape,
  onAddImage,
  onAddTable,
  onAddChart,
  onAddCode,
  onPresent,
  onClose,
  zoom,
  onZoomChange,
}: SlidesTopbarProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(title)

  const handleTitleSubmit = () => {
    setIsEditingTitle(false)
    if (editTitle.trim() && editTitle !== title) {
      onUpdateTitle(editTitle.trim())
    }
  }

  return (
    <header className='flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 select-none shrink-0'>
      <div className='flex items-center gap-3'>
        <div className='flex items-center gap-2 font-semibold text-sm'>
          <span className='px-1.5 py-0.5 rounded bg-[var(--accent)] text-white text-xs'>
            {'Bento'}
          </span>
          {isEditingTitle ? (
            <input
              type='text'
              value={editTitle}
              autoFocus
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
              className='rounded border border-[var(--accent)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-sm font-semibold outline-none'
            />
          ) : (
            <span
              onClick={() => {
                setEditTitle(title)
                setIsEditingTitle(true)
              }}
              title={t('slides.click_to_edit_title')}
              className='cursor-pointer rounded px-1.5 py-0.5 hover:bg-[var(--bg-hover)]'
            >
              {title}
            </span>
          )}
        </div>

        <div className='h-4 w-px bg-[var(--border-subtle)]' />

        <div className='flex items-center gap-1'>
          <button
            type='button'
            onClick={onUndo}
            disabled={!canUndo}
            title={t('common.undo')}
            className='flex size-7 items-center justify-center rounded hover:bg-[var(--bg-hover)] disabled:opacity-30'
          >
            ↩
          </button>
          <button
            type='button'
            onClick={onRedo}
            disabled={!canRedo}
            title={t('contextmenu.redo')}
            className='flex size-7 items-center justify-center rounded hover:bg-[var(--bg-hover)] disabled:opacity-30'
          >
            ↪
          </button>
        </div>

        <div className='h-4 w-px bg-[var(--border-subtle)]' />

        <div className='flex items-center gap-1 text-xs'>
          <button
            type='button'
            onClick={onAddText}
            className='flex items-center gap-1.5 rounded px-2.5 py-1 font-medium hover:bg-[var(--bg-hover)]'
          >
            <span>{'T'}</span>
            <span>{t('slides.insert_text')}</span>
          </button>

          <button
            type='button'
            onClick={() => onAddShape('rounded')}
            className='flex items-center gap-1.5 rounded px-2.5 py-1 font-medium hover:bg-[var(--bg-hover)]'
          >
            <span>▢</span>
            <span>{t('slides.insert_shape')}</span>
          </button>

          <button
            type='button'
            onClick={onAddImage}
            className='flex items-center gap-1.5 rounded px-2.5 py-1 font-medium hover:bg-[var(--bg-hover)]'
          >
            <span>🖼</span>
            <span>{t('slides.insert_image')}</span>
          </button>

          <button
            type='button'
            onClick={onAddTable}
            className='flex items-center gap-1.5 rounded px-2.5 py-1 font-medium hover:bg-[var(--bg-hover)]'
          >
            <span>⊞</span>
            <span>{t('slides.insert_table')}</span>
          </button>

          <button
            type='button'
            onClick={() => onAddChart('bar')}
            className='flex items-center gap-1.5 rounded px-2.5 py-1 font-medium hover:bg-[var(--bg-hover)]'
          >
            <span>📊</span>
            <span>{t('slides.insert_chart')}</span>
          </button>

          <button
            type='button'
            onClick={onAddCode}
            className='flex items-center gap-1.5 rounded px-2.5 py-1 font-medium hover:bg-[var(--bg-hover)]'
          >
            <span>{'</>'}</span>
            <span>{t('slides.insert_code')}</span>
          </button>
        </div>
      </div>

      <div className='flex items-center gap-3'>
        <div className='flex items-center gap-1 text-xs text-[var(--text-secondary)]'>
          <button
            type='button'
            onClick={() => onZoomChange(-0.1)}
            className='flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]'
          >
            -
          </button>
          <span className='w-12 text-center font-mono'>{Math.round(zoom * 100)}%</span>
          <button
            type='button'
            onClick={() => onZoomChange(0.1)}
            className='flex size-6 items-center justify-center rounded hover:bg-[var(--bg-hover)]'
          >
            +
          </button>
        </div>

        <button
          type='button'
          onClick={onPresent}
          className='flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:brightness-110'
        >
          <span>▶</span>
          <span>{t('slides.slideshow')}</span>
        </button>

        <div className='h-4 w-px bg-[var(--border-subtle)]' />

        <button
          type='button'
          onClick={onClose}
          className='flex size-7 items-center justify-center rounded-lg hover:bg-[var(--bg-hover)] text-sm font-semibold'
          title={t('common.close')}
        >
          ✕
        </button>
      </div>
    </header>
  )
})
