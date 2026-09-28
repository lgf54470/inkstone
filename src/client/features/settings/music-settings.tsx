import { useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { MUSIC_PROVIDER_QUALITIES, type MusicProviderQuality } from '@shared/constants'
import { Button, IconButton } from '../../components/primitives'
import { Segmented, Select, SettingRow, Switch } from '../../components/form'
import { t, type MessageKey } from '../../lib/i18n'
import {
  IMMERSIVE_BACKGROUNDS, LYRIC_ALIGNS, LYRIC_SOURCES, LYRIC_TEXT_SIZES, MusicEqPanel, MusicRateButton, MusicSleepButton,
  MusicVolumeSlider, listProviders, orderedSources, providerSourceLabel, useMusic,
  type MusicImmersiveBackground, type MusicLyricAlign, type MusicLyricSource, type MusicLyricTextSize, type MusicProvider,
} from '../music'
import { MusicServers } from './music-servers'

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

const LYRIC_SOURCE_LABELS: Record<MusicLyricSource, MessageKey> = {
  auto: 'music.lyric_source_auto',
  lrclib: 'music.lyric_source_lrclib',
  catalogue: 'music.lyric_source_catalogue',
}

// FB-F4: the one page where the music preferences live. It is not a second settings system —
// every control here writes the same store the player popovers write, and the equalizer group is
// literally the popover's own panel rather than a copy of it.
export function MusicSettings() {
  return (
    <div className='space-y-6'>
      <OnlineSources />
      <MusicServers />
      <PlaybackDefaults />
    </div>
  )
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
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
  // FB-F8: the automatic repair of a dead online link is a preference, not a law.
  const autoSwap = useMusic((state) => state.providerAutoSwap)
  const setAutoSwap = useMusic((state) => state.setProviderAutoSwap)
  return (
    <section>
      <SectionTitle title={t('music.settings_sources')} hint={t('music.settings_sources_hint')} />
      {!accepted && <ProviderNotice onAccept={accept} />}
      {listProviders().map((provider) => (
        <ProviderSwitch key={provider.id} provider={provider} locked={!accepted} />
      ))}
      <SourceTable locked={!accepted} />
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
      <SettingRow title={t('music.settings_auto_swap')} description={t('music.settings_auto_swap_desc')}>
        <Switch
          checked={autoSwap}
          onChange={setAutoSwap}
          label={t('music.settings_auto_swap')}
        />
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

// FB3-F2: the aggregate was one switch over five catalogues the reader could neither see nor
// arrange — and the order is not cosmetic: it is the merge order of an answer and the order the
// switch-source candidates are ranked in. One row per catalogue, each with its own switch and its
// place in the ask order.
function SourceTable({ locked }: { locked: boolean }) {
  const sourceEnabled = useMusic((state) => state.providerSourceEnabled)
  const sourceOrder = useMusic((state) => state.providerSourceOrder)
  const setEnabled = useMusic((state) => state.setProviderSourceEnabled)
  const move = useMusic((state) => state.moveProviderSource)
  const order = useMemo(() => orderedSources({ enabled: sourceEnabled, order: sourceOrder }), [sourceEnabled, sourceOrder])
  return (
    <div className='mb-2 rounded-[var(--r-md)] border border-[var(--border-subtle)] p-1'>
      <div className='flex items-baseline justify-between gap-2 px-2 py-1'>
        <span className='text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>{t('music.settings_source_order')}</span>
        <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.settings_source_order_hint')}</span>
      </div>
      <ul>
        {order.map((source, index) => {
          const label = providerSourceLabel(source)
          return (
            <li key={source} className='flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1 hover:bg-[var(--bg-hover)]'>
              <span className='min-w-0 flex-1 truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{label}</span>
              <IconButton
                size='sm'
                label={t('music.source_move_up', { value0: label })}
                disabled={index === 0}
                onClick={() => move(source, -1)}
              >
                <ChevronUp size={13} />
              </IconButton>
              <IconButton
                size='sm'
                label={t('music.source_move_down', { value0: label })}
                disabled={index === order.length - 1}
                onClick={() => move(source, 1)}
              >
                <ChevronDown size={13} />
              </IconButton>
              <Switch
                checked={sourceEnabled[source] !== false}
                disabled={locked}
                onChange={(next) => setEnabled(source, next)}
                label={label}
              />
            </li>
          )
        })}
      </ul>
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
  const floatingVisible = useMusic((state) => state.floatingVisible)
  const setFloatingVisible = useMusic((state) => state.setFloatingVisible)
  return (
    <section>
      <SectionTitle title={t('music.settings_playback')} hint={t('music.settings_playback_hint')} />
      {/* FB3-F3: three capabilities the module already had and the settings page did not offer — the
          volume only lived in the player popover, and the sleep timer and playback speed only in the
          transport menus. They are the same components, not copies, so a change here is a change there. */}
      <SettingRow title={t('music.volume')}>
        <MusicVolumeSlider className='w-56 max-w-full' />
      </SettingRow>
      <SettingRow title={t('music.playback_rate')}>
        <MusicRateButton size='md' />
      </SettingRow>
      <SettingRow title={t('music.sleep_timer')}>
        <MusicSleepButton size='md' />
      </SettingRow>
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
      <LyricDefaults />
      <SettingRow title={t('music.mini_player')}>
        <Switch checked={floatingVisible} onChange={setFloatingVisible} label={t('music.mini_player')} />
      </SettingRow>
    </section>
  )
}

// FEA-C4 + FB-F13: how lyrics are drawn and where a lookup starts — one group, because both are
// answers to "what do I want when I press play".
function LyricDefaults() {
  const align = useMusic((state) => state.lyricAlign)
  const setAlign = useMusic((state) => state.setLyricAlign)
  const size = useMusic((state) => state.lyricTextSize)
  const setSize = useMusic((state) => state.setLyricTextSize)
  const lyricSource = useMusic((state) => state.lyricSource)
  const setLyricSource = useMusic((state) => state.setLyricSource)
  return (
    <>
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
      <SettingRow title={t('music.settings_lyric_source')} description={t('music.settings_lyric_source_hint')}>
        <Select
          aria-label={t('music.settings_lyric_source')}
          value={lyricSource}
          onChange={(event) => setLyricSource(event.target.value as MusicLyricSource)}
        >
          {LYRIC_SOURCES.map((option) => (
            <option key={option} value={option}>{t(LYRIC_SOURCE_LABELS[option])}</option>
          ))}
        </Select>
      </SettingRow>
    </>
  )
}
