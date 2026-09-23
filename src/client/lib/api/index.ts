export { CLIENT_ID, ApiError } from './transport'
export {
  musicStreamUrl, musicCoverLookupUrl, uploadMusicTrack, uploadMusicToWebdav,
  type MusicBatchAction, type MusicUploadResult, type MusicTrackPatch,
  type MusicWebdavImportInput, type MusicWebdavListing, type MusicPlaylistPatch,
  type PublicPlaylist, type PublicPlaylistTrack,
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
