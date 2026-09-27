import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { registerMusicAlistRoutes } from './alist'
import { registerMusicCoverLookupRoutes } from './lookup'
import { registerMusicHealthRoutes } from './health'
import { registerMusicLibraryRoutes } from './library'
import { registerMusicLyricLookupRoutes } from './lyrics'
import { registerMusicPlaybackRoutes } from './playback'
import { registerMusicPlaylistRoutes } from './playlists'
import { registerMusicPodcastRoutes } from './podcasts'
import { registerMusicProviderRoutes } from './provider'
import { registerMusicSettingsRoutes } from './settings'
import { registerMusicTrashRoutes } from './trash'
import { registerMusicTagRoutes } from './tags'
import { registerMusicTrackRoutes } from './tracks'
import { registerMusicUploadRoutes } from './upload'
import { registerMusicWebdavRoutes } from './webdav-routes'

export const musicRoutes = new Hono<AppBindings>()

registerMusicLibraryRoutes(musicRoutes)
registerMusicPlaybackRoutes(musicRoutes)
registerMusicUploadRoutes(musicRoutes)
registerMusicWebdavRoutes(musicRoutes)
registerMusicTrackRoutes(musicRoutes)
registerMusicCoverLookupRoutes(musicRoutes)
registerMusicLyricLookupRoutes(musicRoutes)
registerMusicTagRoutes(musicRoutes)
registerMusicPlaylistRoutes(musicRoutes)
registerMusicSettingsRoutes(musicRoutes)
registerMusicTrashRoutes(musicRoutes)
registerMusicAlistRoutes(musicRoutes)
registerMusicPodcastRoutes(musicRoutes)
registerMusicProviderRoutes(musicRoutes)
registerMusicHealthRoutes(musicRoutes)

export { registerMusicPublicRoutes } from './public'
export { purgeExpiredMusicTrash } from './trash'
export { musicPageRoutes } from './page'
// M-53b: the bundle restore validates stored object references with the exact
// rules the upload and WebDAV import paths enforce.
export { isDerivedMusicObjectKey, isWebdavRelativePath } from './keys'
// M-53b and the upload path both measure the quota the same way: WebDAV references
// cost this deployment nothing.
export { isStoredMusicSource, storedMusicBytes } from './quota'
