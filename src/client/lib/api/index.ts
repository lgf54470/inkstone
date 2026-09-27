export { CLIENT_ID, ApiError } from './transport'
export {
  musicStreamUrl, musicCoverLookupUrl, musicProviderCoverUrl, uploadMusicTrack, uploadMusicToWebdav,
  type MusicBatchAction, type MusicUploadResult, type MusicTrackPatch,
  type MusicWebdavImportInput, type MusicWebdavListing, type MusicPlaylistPatch,
  type MusicAlistServerView, type MusicAlistCreateInput, type MusicAlistPatchInput,
  type MusicServerSourceView, type MusicServerSourceInput, type MusicServerHit,
  type MusicServerSearchResult, type MusicServerTrackInput,
  type MusicAlistEntry, type MusicAlistImportInput,
  type MusicPodcastFeedView, type MusicPodcastCreateInput, type MusicPodcastPatchInput,
  type MusicPodcastEpisode, type MusicPodcastEpisodeImportInput,
  type MusicProviderTrack, type MusicProviderTrackImportInput,
  type MusicTrashEntry, type PublicPlaylist, type PublicPlaylistTrack,
} from './music'
import { account } from './account'
import { vault } from './vault'
import { files } from './files'
import { settings } from './settings'
import { share } from './share'
import { music } from './music'
import { boardLibrary } from './board-library'
export const api = {
  ...account,
  ...vault,
  ...files,
  ...settings,
  ...share,
  music,
  boardLibrary,
}
export { uploadKanbanFile, deleteKanbanFile } from './kanban'
