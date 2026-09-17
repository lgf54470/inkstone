import { memo, useState, useRef, useEffect } from 'react'
import {
  Undo2,
  Redo2,
  Printer,
  Share2,
  Save,
  Settings,
  HelpCircle,
  X,
  ChevronDown,
  Type,
  Square,
  Image as ImageIcon,
  LayoutGrid,
  Table as TableIcon,
  BarChart3,
  Code2,
  MessageSquare,
} from 'lucide-react'
import type { ShapeType } from '../types'
import { t } from '../../../i18n'

const BENTO_LOGO_BASE = '#16273E'
const BENTO_LOGO_STEEL = '#5E7699'
const BENTO_LOGO_PEACH = '#FF9E8A'
const BENTO_LOGO_PAPER = '#F0EBE0'
const DIRTY_DOT_COLOR = '#F7A600'
const LOGO_VIEW_SIZE = 20
const TILE_MAIN_SIZE = 32
const TILE_LEFT_W = 7
const TILE_LEFT_H = 22
const TILE_RIGHT_W = 13
const TILE_RIGHT_H = 10

interface SlidesTopbarProps {
  title: string
  canUndo: boolean
  canRedo: boolean
  isSaved?: boolean
  onUndo: () => void
  onRedo: () => void
  onUpdateTitle: (title: string) => void
  onAddText: () => void
  onAddShape: (shape: ShapeType) => void
  onAddImage: () => void
  onAddTable: () => void
  onAddChart: (preset: 'bar' | 'line' | 'pie' | 'scatter') => void
  onAddCode: () => void
  onClose: () => void
  onExportPdf?: () => void
  onShare?: () => void
  onSave?: () => void
  onOpenSettings?: () => void
  onOpenHelp?: () => void
}

export const SlidesTopbar = memo(function SlidesTopbar({
  title,
  canUndo,
  canRedo,
  isSaved = true,
  onUndo,
  onRedo,
  onUpdateTitle,
  onAddText,
  onAddShape,
  onAddImage,
  onAddTable,
  onAddChart,
  onAddCode,
  onClose,
  onExportPdf,
  onShare,
  onSave,
  onOpenSettings,
  onOpenHelp,
}: SlidesTopbarProps) {
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false)
  const [chartMenuOpen, setChartMenuOpen] = useState(false)
  const shapeRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (e: globalThis.MouseEvent) => {
      if (shapeRef.current && !shapeRef.current.contains(e.target as Node)) {
        setShapeMenuOpen(false)
      }
      if (chartRef.current && !chartRef.current.contains(e.target as Node)) {
        setChartMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  return (
    <header className='flex h-11 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 select-none shrink-0 z-30'>
      <div className='flex items-center gap-2'>
        <div className='flex items-center gap-2'>
          <svg className='shrink-0 rounded-xs' viewBox='0 0 32 32' width={LOGO_VIEW_SIZE} height={LOGO_VIEW_SIZE} aria-hidden='true'>
            <rect width={TILE_MAIN_SIZE} height={TILE_MAIN_SIZE} rx='7' fill={BENTO_LOGO_BASE} />
            <rect x='5' y='5' width={TILE_LEFT_W} height={TILE_LEFT_H} rx='2.5' fill={BENTO_LOGO_STEEL} />
            <rect x='14' y='5' width={TILE_RIGHT_W} height={TILE_RIGHT_H} rx='2.5' fill={BENTO_LOGO_PEACH} />
            <rect x='14' y='17' width={TILE_RIGHT_W} height={TILE_RIGHT_H} rx='2.5' fill={BENTO_LOGO_PAPER} />
          </svg>
          <span className='font-bold text-sm tracking-tight text-[var(--text-primary)]'>
            <span>{'bento'}</span>
            <span style={{ color: BENTO_LOGO_PEACH }}>{'/'}</span>
            <span>{'slides'}</span>
          </span>
        </div>

        <input
          type='text'
          value={title}
          onChange={(e) => onUpdateTitle(e.target.value)}
          placeholder={t('slides.click_to_edit_title')}
          className='h-7 w-44 rounded border border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--accent)] bg-transparent px-2 text-xs font-semibold text-[var(--text-primary)] outline-none transition-colors'
        />

        <div className='h-4 w-px bg-[var(--border-subtle)] mx-1' />

        <div className='flex items-center gap-0.5'>
          <button
            type='button'
            onClick={onUndo}
            disabled={!canUndo}
            title={t('common.undo')}
            className='flex size-7 items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] disabled:opacity-30'
          >
            <Undo2 size={14} />
          </button>
          <button
            type='button'
            onClick={onRedo}
            disabled={!canRedo}
            title={t('contextmenu.redo')}
            className='flex size-7 items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] disabled:opacity-30'
          >
            <Redo2 size={14} />
          </button>
        </div>

        <div className='h-4 w-px bg-[var(--border-subtle)] mx-1' />

        <div className='flex items-center gap-0.5 text-xs'>
          <button
            type='button'
            onClick={onAddText}
            className='flex items-center gap-1 h-7 rounded px-2 font-medium hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          >
            <Type size={13} />
            <span>{t('slides.insert_text')}</span>
          </button>

          <div ref={shapeRef} className='relative'>
            <button
              type='button'
              onClick={() => setShapeMenuOpen((o) => !o)}
              className='flex items-center gap-1 h-7 rounded px-2 font-medium hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            >
              <Square size={13} />
              <span>{t('slides.insert_shape')}</span>
              <ChevronDown size={11} className='opacity-60' />
            </button>
            {shapeMenuOpen && (
              <div className='absolute left-0 top-full mt-1 w-32 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 shadow-lg z-50'>
                <button
                  type='button'
                  onClick={() => {
                    onAddShape('rect')
                    setShapeMenuOpen(false)
                  }}
                  className='flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
                >
                  <Square size={12} />
                  <span>{t('slides.shape_rect')}</span>
                </button>
                <button
                  type='button'
                  onClick={() => {
                    onAddShape('rounded')
                    setShapeMenuOpen(false)
                  }}
                  className='flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
                >
                  <Square size={12} className='rounded-xs' />
                  <span>{t('slides.shape_rounded_rect')}</span>
                </button>
                <button
                  type='button'
                  onClick={() => {
                    onAddShape('circle')
                    setShapeMenuOpen(false)
                  }}
                  className='flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
                >
                  <span className='size-3 rounded-full border border-current' />
                  <span>{t('slides.shape_circle')}</span>
                </button>
                <button
                  type='button'
                  onClick={() => {
                    onAddShape('card')
                    setShapeMenuOpen(false)
                  }}
                  className='flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
                >
                  <LayoutGrid size={12} />
                  <span>{t('slides.shape_bento_box')}</span>
                </button>
              </div>
            )}
          </div>

          <button
            type='button'
            onClick={onAddImage}
            className='flex items-center gap-1 h-7 rounded px-2 font-medium hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          >
            <ImageIcon size={13} />
            <span>{t('slides.insert_image')}</span>
          </button>

          <button
            type='button'
            onClick={() => onAddShape('card')}
            className='flex items-center gap-1 h-7 rounded px-2 font-medium hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          >
            <LayoutGrid size={13} />
            <span>{t('slides.tool_media')}</span>
          </button>

          <button
            type='button'
            onClick={onAddTable}
            className='flex items-center gap-1 h-7 rounded px-2 font-medium hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          >
            <TableIcon size={13} />
            <span>{t('slides.insert_table')}</span>
          </button>

          <div ref={chartRef} className='relative'>
            <button
              type='button'
              onClick={() => setChartMenuOpen((o) => !o)}
              className='flex items-center gap-1 h-7 rounded px-2 font-medium hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            >
              <BarChart3 size={13} />
              <span>{t('slides.insert_chart')}</span>
              <ChevronDown size={11} className='opacity-60' />
            </button>
            {chartMenuOpen && (
              <div className='absolute left-0 top-full mt-1 w-32 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 shadow-lg z-50'>
                <button
                  type='button'
                  onClick={() => {
                    onAddChart('bar')
                    setChartMenuOpen(false)
                  }}
                  className='flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
                >
                  <BarChart3 size={12} />
                  <span>{t('slides.chart_bar')}</span>
                </button>
                <button
                  type='button'
                  onClick={() => {
                    onAddChart('pie')
                    setChartMenuOpen(false)
                  }}
                  className='flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
                >
                  <span className='size-3 rounded-full border-2 border-current' />
                  <span>{t('slides.chart_pie')}</span>
                </button>
                <button
                  type='button'
                  onClick={() => {
                    onAddChart('line')
                    setChartMenuOpen(false)
                  }}
                  className='flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-hover)] text-[var(--text-primary)]'
                >
                  <span>📈</span>
                  <span>{t('slides.chart_line')}</span>
                </button>
              </div>
            )}
          </div>

          <button
            type='button'
            onClick={onAddCode}
            className='flex items-center gap-1 h-7 rounded px-2 font-medium hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          >
            <Code2 size={13} />
            <span>{t('slides.insert_code')}</span>
          </button>

          <button
            type='button'
            onClick={onOpenSettings}
            className='flex items-center gap-1 h-7 rounded px-2 font-medium hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          >
            <MessageSquare size={13} />
            <span>{t('slides.tool_comment')}</span>
          </button>
        </div>
      </div>

      <div className='flex items-center gap-1.5 text-xs text-[var(--text-secondary)]'>
        <button
          type='button'
          onClick={onExportPdf}
          title={t('slides.tool_print')}
          className='flex size-7 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Printer size={14} />
        </button>

        <button
          type='button'
          onClick={onShare}
          title={t('slides.tool_share')}
          className='flex items-center gap-1 h-7 rounded px-2 font-medium hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Share2 size={13} />
          <span>{t('slides.tool_share')}</span>
        </button>

        <button
          type='button'
          onClick={onSave}
          title={t('slides.tool_save')}
          className='relative flex items-center gap-1 h-7 rounded px-2 font-medium hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Save size={13} />
          <span>{t('slides.tool_save')}</span>
          {!isSaved && (
            <span
              className='size-1.5 rounded-full'
              style={{ backgroundColor: DIRTY_DOT_COLOR }}
            />
          )}
        </button>

        <button
          type='button'
          onClick={onOpenSettings}
          title={t('slides.tool_settings')}
          className='flex size-7 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Settings size={14} />
        </button>

        <button
          type='button'
          onClick={onOpenHelp}
          title={t('slides.tool_help')}
          className='flex size-7 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <HelpCircle size={14} />
        </button>

        <div className='h-4 w-px bg-[var(--border-subtle)] mx-0.5' />

        <button
          type='button'
          onClick={onClose}
          title={t('common.close')}
          className='flex size-7 items-center justify-center rounded hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <X size={15} />
        </button>
      </div>
    </header>
  )
})
