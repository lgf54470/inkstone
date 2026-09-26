import { useRef, useState } from 'react'
import { ALargeSmall } from 'lucide-react'
import { Segmented } from '../../components/form'
import { IconButton } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import type { MusicLyricAlign, MusicLyricTextSize } from './music-store'
import { MusicPopover } from './music-popover'

// Both lyric surfaces render the same text, so the tiers are per surface: the
// immersive panel starts larger and keeps the gap across every setting.
export const LYRIC_ALIGN_CLASSES: Record<MusicLyricAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

export const LYRIC_COLUMN_SIZE_CLASSES: Record<MusicLyricTextSize, string> = {
  small: 'text-[length:var(--text-11)]',
  default: 'text-[length:var(--text-12)]',
  large: 'text-[length:var(--text-14)]',
}

export const LYRIC_IMMERSIVE_SIZE_CLASSES: Record<MusicLyricTextSize, string> = {
  small: 'text-[length:var(--text-13)]',
  default: 'text-[length:var(--text-15)]',
  large: 'text-[length:var(--text-18)]',
}

export function MusicLyricStyleButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const align = useMusic((state) => state.lyricAlign)
  const textSize = useMusic((state) => state.lyricTextSize)
  const setLyricAlign = useMusic((state) => state.setLyricAlign)
  const setLyricTextSize = useMusic((state) => state.setLyricTextSize)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Tooltip label={t('music.lyric_style')} side='top'>
        <IconButton
          ref={anchorRef}
          label={t('music.lyric_style')}
          size={size}
          highlight={align !== 'left' || textSize !== 'default'}
          onClick={() => setOpen((value) => !value)}
        >
          <ALargeSmall size={14} />
        </IconButton>
      </Tooltip>
      <MusicPopover open={open} onClose={() => setOpen(false)} label={t('music.lyric_style')} anchorRef={anchorRef} className='w-48 space-y-2 p-2'>
        <Segmented
          size='sm'
          className='w-full'
          label={t('music.lyric_align')}
          value={align}
          onChange={setLyricAlign}
          options={[
            { value: 'left', label: t('music.lyric_align_left'), title: t('music.lyric_align_left') },
            { value: 'center', label: t('music.lyric_align_center'), title: t('music.lyric_align_center') },
            { value: 'right', label: t('music.lyric_align_right'), title: t('music.lyric_align_right') },
          ]}
        />
        <Segmented
          size='sm'
          className='w-full'
          label={t('music.lyric_size')}
          value={textSize}
          onChange={setLyricTextSize}
          options={[
            { value: 'small', label: t('music.lyric_size_small'), title: t('music.lyric_size_small') },
            { value: 'default', label: t('music.lyric_size_default'), title: t('music.lyric_size_default') },
            { value: 'large', label: t('music.lyric_size_large'), title: t('music.lyric_size_large') },
          ]}
        />
      </MusicPopover>
    </>
  )
}
