import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { registerMusicCoverLookupRoutes } from './lookup'
import { registerMusicLibraryRoutes } from './library'
import { registerMusicLyricLookupRoutes } from './lyrics'
import { registerMusicPlaybackRoutes } from './playback'
import { registerMusicPlaylistRoutes } from './playlists'
import { registerMusicSettingsRoutes } from './settings'
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

export { registerMusicPublicRoutes } from './public'
export { musicPageRoutes } from './page'
// M-53b: the bundle restore validates stored object references with the exact
// rules the upload and WebDAV import paths enforce.
export { isDerivedMusicObjectKey, isWebdavRelativePath } from './keys'
