import { t, type MessageKey } from '../../../lib/i18n'

// FB-U5: an online hit used to name its catalogue with the upstream's own slug
// ("netease"), which is neither localized nor a name anyone reads. Each source the
// aggregate fronts has a label of its own; an unknown slug still says something
// rather than going blank.
const PROVIDER_SOURCE_KEYS: Record<string, MessageKey> = {
  netease: 'music.provider_source_netease',
  kuwo: 'music.provider_source_kuwo',
  migu: 'music.provider_source_migu',
  qq: 'music.provider_source_qq',
  bilibili: 'music.provider_source_bilibili',
}

export function providerSourceLabel(source: string): string {
  const key = PROVIDER_SOURCE_KEYS[source]
  return key ? t(key) : source
}
