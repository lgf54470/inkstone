import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { registerMusicCoverLookupRoutes } from './lookup'
import { registerMusicLibraryRoutes } from './library'
import { registerMusicPlaybackRoutes } from './playback'
import { registerMusicPlaylistRoutes } from './playlists'
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
registerMusicTagRoutes(musicRoutes)
registerMusicPlaylistRoutes(musicRoutes)
