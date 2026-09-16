export { CLIENT_ID, ApiError } from './transport'
export {
  musicStreamUrl, musicCoverLookupUrl, uploadMusicTrack, uploadMusicToWebdav,
  type MusicBatchAction, type MusicUploadResult, type MusicTrackPatch,
  type MusicWebdavImportInput, type MusicWebdavListing,
} from './music'
import { account } from './account'
import { vault } from './vault'
import { files } from './files'
import { settings } from './settings'
import { share } from './share'
import { music } from './music'
import { boardLibrary } from './board-library'
import { uploadKanbanFile, deleteKanbanFile } from './kanban'
export const api = {
  ...account,
  ...vault,
  ...files,
  ...settings,
  ...share,
  music,
  boardLibrary,
  kanban: {
    upload: uploadKanbanFile,
    remove: deleteKanbanFile,
  },
}
export { uploadKanbanFile, deleteKanbanFile }
