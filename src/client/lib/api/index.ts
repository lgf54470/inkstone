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
export const api = {
  ...account,
  ...vault,
  ...files,
  ...settings,
  ...share,
  music,
}
