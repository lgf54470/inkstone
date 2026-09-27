import { MUSIC_PROVIDER_QUALITIES, type MusicProviderQuality } from '@shared/constants'
import { Button } from '../../components/primitives'
import { Segmented, Select, SettingRow, Switch } from '../../components/form'
import { t, type MessageKey } from '../../lib/i18n'
import {
  IMMERSIVE_BACKGROUNDS, LYRIC_ALIGNS, LYRIC_TEXT_SIZES, MusicEqPanel, listProviders, useMusic,
  type MusicImmersiveBackground, type MusicLyricAlign, type MusicLyricTextSize, type MusicProvider,
} from '../music'

const QUALITY_LABELS: Record<MusicProviderQuality, MessageKey> = {
  128: 'music.quality_128',
  192: 'music.quality_192',
  320: 'music.quality_320',
  740: 'music.quality_740',
  999: 'music.quality_999',
}

const BACKGROUND_LABELS: Record<MusicImmersiveBackground, MessageKey> = {
  theme: 'music.background_theme',
  blur: 'music.background_blur',
  gradient: 'music.background_gradient',
}

const ALIGN_LABELS: Record<MusicLyricAlign, MessageKey> = {
  left: 'music.lyric_align_left',
  center: 'music.lyric_align_center',
  right: 'music.lyric_align_right',
}

const SIZE_LABELS: Record<MusicLyricTextSize, MessageKey> = {
  small: 'music.lyric_size_small',
  default: 'music.lyric_size_default',
  large: 'music.lyric_size_large',
}

// FB-F4: the one page where the music preferences live. It is not a second settings system —
// every control here writes the same store the player popovers write, and the equalizer group is
// literally the popover's own panel rather than a copy of it.
export function MusicSettings() {
  return (
    <div className='space-y-6'>
      <OnlineSources />
      <PlaybackDefaults />
    </div>
  )
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className='mb-1.5'>
      <h3 className='text-[length:var(--text-11)] font-semibold tracking-[var(--tracking-label)] text-[var(--text-quaternary)]'>
        {title}
      </h3>
      {hint && <p className='pt-1 text-[length:var(--text-12)] leading-relaxed text-[var(--text-quaternary)]'>{hint}</p>}
    </div>
  )
}

function OnlineSources() {
  const accepted = useMusic((state) => state.providerNoticeAccepted)
  const accept = useMusic((state) => state.acceptProviderNotice)
  const quality = useMusic((state) => state.providerQuality)
  const setQuality = useMusic((state) => state.setProviderQuality)
  const showSourceBadge = useMusic((state) => state.showSourceBadge)
  const setShowSourceBadge = useMusic((state) => state.setShowSourceBadge)
  return (
    <section>
      <SectionTitle title={t('music.settings_sources')} hint={t('music.settings_sources_hint')} />
      {!accepted && <ProviderNotice onAccept={accept} />}
      {listProviders().map((provider) => (
        <ProviderSwitch key={provider.id} provider={provider} locked={!accepted} />
      ))}
      <SettingRow title={t('music.settings_quality')} description={t('music.settings_quality_hint')}>
        <Select
          aria-label={t('music.settings_quality')}
          value={quality}
          onChange={(event) => setQuality(Number(event.target.value) as MusicProviderQuality)}
        >
          {MUSIC_PROVIDER_QUALITIES.map((tier) => (
            <option key={tier} value={tier}>{t(QUALITY_LABELS[tier])}</option>
          ))}
        </Select>
      </SettingRow>
      <SettingRow title={t('music.settings_show_source_badge')} description={t('music.settings_show_source_badge_desc')}>
        <Switch
          checked={showSourceBadge}
          onChange={setShowSourceBadge}
          label={t('music.settings_show_source_badge')}
        />
      </SettingRow>
    </section>
  )
}

// FB-S6: the opt-in is a decision with consequences — the notice is stated where the switch is,
// and the switch stays shut until it is acknowledged.
function ProviderNotice({ onAccept }: { onAccept: () => void }) {
  return (
    <div className='mb-2 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-inset)] p-3'>
      <p className='text-[length:var(--text-12)] font-semibold text-[var(--text-primary)]'>{t('music.settings_risk_title')}</p>
      <p className='pt-1 text-[length:var(--text-12)] leading-relaxed text-[var(--text-secondary)]'>{t('music.settings_risk_body')}</p>
      <Button size='sm' variant='secondary' className='mt-2' onClick={onAccept}>{t('music.settings_risk_accept')}</Button>
    </div>
  )
}

function ProviderSwitch({ provider, locked }: { provider: MusicProvider; locked: boolean }) {
  const enabled = useMusic((state) => state.providerEnabled[provider.id] === true)
  const setProviderEnabled = useMusic((state) => state.setProviderEnabled)
  return (
    <SettingRow title={t(provider.labelKey)} description={t('music.settings_provider_gds_desc')}>
      <Switch
        checked={enabled}
        disabled={locked}
        onChange={(next) => setProviderEnabled(provider.id, next)}
        label={t(provider.labelKey)}
      />
    </SettingRow>
  )
}

function PlaybackDefaults() {
  const background = useMusic((state) => state.immersiveBackground)
  const setBackground = useMusic((state) => state.setImmersiveBackground)
  const align = useMusic((state) => state.lyricAlign)
  const setAlign = useMusic((state) => state.setLyricAlign)
  const size = useMusic((state) => state.lyricTextSize)
  const setSize = useMusic((state) => state.setLyricTextSize)
  const floatingVisible = useMusic((state) => state.floatingVisible)
  const setFloatingVisible = useMusic((state) => state.setFloatingVisible)
  return (
    <section>
      <SectionTitle title={t('music.settings_playback')} hint={t('music.settings_playback_hint')} />
      <MusicEqPanel />
      <SettingRow title={t('music.background_mode')}>
        <Segmented
          label={t('music.background_mode')}
          size='sm'
          value={background}
          options={IMMERSIVE_BACKGROUNDS.map((mode) => ({ value: mode, label: t(BACKGROUND_LABELS[mode]) }))}
          onChange={setBackground}
        />
      </SettingRow>
      <SettingRow title={t('music.lyric_align')}>
        <Segmented
          label={t('music.lyric_align')}
          size='sm'
          value={align}
          options={LYRIC_ALIGNS.map((option) => ({ value: option, label: t(ALIGN_LABELS[option]) }))}
          onChange={setAlign}
        />
      </SettingRow>
      <SettingRow title={t('music.lyric_size')}>
        <Segmented
          label={t('music.lyric_size')}
          size='sm'
          value={size}
          options={LYRIC_TEXT_SIZES.map((option) => ({ value: option, label: t(SIZE_LABELS[option]) }))}
          onChange={setSize}
        />
      </SettingRow>
      <SettingRow title={t('music.mini_player')}>
        <Switch checked={floatingVisible} onChange={setFloatingVisible} label={t('music.mini_player')} />
      </SettingRow>
    </section>
  )
}
