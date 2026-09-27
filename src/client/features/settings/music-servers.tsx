import { t } from '../../lib/i18n'
import { MusicServerManager, useLoadServerSources } from '../music'
import { SectionTitle } from './music-settings'

// FB-M16: the settings home of the reader's own music servers. Registration is the whole job here;
// searching the server and adding songs is a library act, so the toolbar carries that entry and this
// group says where it is.
export function MusicServers() {
  useLoadServerSources()
  return (
    <section>
      <SectionTitle title={t('music.server_title')} hint={t('music.server_hint')} />
      <MusicServerManager />
    </section>
  )
}
