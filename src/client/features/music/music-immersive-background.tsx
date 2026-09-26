import { useEffect, useRef, useState } from 'react'
import { Wallpaper } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Segmented } from '../../components/form'
import { Tooltip } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useCurrentTrack, useMusic } from './music-store'
import { coverGradientFromUrl } from './music-cover-colors'
import { MusicPopover } from './music-popover'

// The blurred cover layer is aria-decorative wallpaper: heavy blur over a token scrim
// keeps the content columns' token contrast intact.
const COVER_BLUR_LAYER_CLASS = 'size-full scale-125 object-cover opacity-60 blur-[64px]'

// FEA-C2: the background modes. The theme mode paints nothing (the modal's token
// surface shows); the cover modes sit under a token scrim so text tiers keep the
// contrast the token system calibrates. Falls back to a token gradient when the
// cover cannot be sampled (canvas unavailable, load failure, no cover).
export function ImmersiveBackground({ track }: { track: ReturnType<typeof useCurrentTrack> }) {
  const mode = useMusic((state) => state.immersiveBackground)
  const coverUrl = track?.coverUrl ?? null
  const [gradient, setGradient] = useState<string | null>(null)
  useEffect(() => {
    if (mode !== 'gradient' || !coverUrl) {
      setGradient(null)
      return
    }
    let cancelled = false
    void coverGradientFromUrl(coverUrl).then((value) => {
      if (!cancelled) setGradient(value)
    })
    return () => { cancelled = true }
  }, [mode, coverUrl])

  if (mode === 'theme' || !coverUrl) return null
  if (mode === 'gradient') {
    return (
      <div
        aria-hidden='true'
        data-immersive-background='gradient'
        className='absolute inset-0'
        style={{ backgroundImage: gradient ?? 'linear-gradient(135deg, var(--bg-raised), var(--bg-base))' }}
      />
    )
  }
  return (
    <div aria-hidden='true' data-immersive-background='blur' className='absolute inset-0'>
      <img src={coverUrl} alt='' className={COVER_BLUR_LAYER_CLASS} />
      <div className='absolute inset-0 bg-[var(--bg-base)] opacity-70' />
    </div>
  )
}

// The mode control sits with the other transport toggles; three options, radio
// semantics, names spelled out because the wallpaper is a visual-only affordance.
export function MusicBackgroundButton() {
  const mode = useMusic((state) => state.immersiveBackground)
  const setImmersiveBackground = useMusic((state) => state.setImmersiveBackground)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const options = [
    { value: 'theme', label: t('music.background_theme') },
    { value: 'blur', label: t('music.background_blur') },
    { value: 'gradient', label: t('music.background_gradient') },
  ] as const
  return (
    <>
      <Tooltip label={t('music.background_mode')} side='top'>
        <IconButton
          ref={anchorRef}
          label={t('music.background_mode')}
          highlight={mode !== 'theme'}
          onClick={() => setOpen((value) => !value)}
        >
          <Wallpaper size={14} />
        </IconButton>
      </Tooltip>
      <MusicPopover open={open} onClose={() => setOpen(false)} label={t('music.background_mode')} anchorRef={anchorRef} className='w-40 p-2'>
        <Segmented
          size='sm'
          className='w-full'
          label={t('music.background_mode')}
          value={mode}
          onChange={(value) => { setImmersiveBackground(value); setOpen(false) }}
          options={options.map((option) => ({ value: option.value, label: option.label, title: option.label }))}
        />
      </MusicPopover>
    </>
  )
}
