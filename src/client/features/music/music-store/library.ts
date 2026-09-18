import type { MusicBatchAction } from '../../../lib/api'
import {
  clearSearchHistory, clearSelection, commitQuery, closeTrackMenu, invertSelection, loadLibrary, openTrackMenu, prepareRomanization,
  selectAll, setQuery, setScope, setSort, setSourceFilter, setViewMode, toggleSelect,
} from './library-load'
import { batchTracks, deleteTrack, ensureTrackLyric, patchTrack, refreshTrackMetadata, toggleFavorite, togglePin } from './library-tracks'
import { matchMissingCovers } from './library-covers'
import { dismissDownload, dismissLibraryJob, downloadTracks, setTransfersOpen, setUploadTarget } from './transfers'
import {
  addSelectionToPlaylist, addToPlaylist, createPlaylist, createTag, deletePlaylist, deleteTag, dismissUpload,
  moveSelectionToTag, patchTag, removeFromPlaylist, renamePlaylist, uploadFiles,
} from './library-collections'
import { browseWebdav, deleteWebdavObjects, importWebdavFolder, importWebdavTrack } from './webdav'
import type { MusicGet, MusicSet, MusicStoreState } from './types'

type LibrarySlice = Pick<MusicStoreState,
  | 'loadLibrary' | 'setScope' | 'setQuery' | 'commitQuery' | 'clearSearchHistory' | 'setSort' | 'prepareRomanization'
  | 'setViewMode' | 'openTrackMenu' | 'closeTrackMenu' | 'setSourceFilter' | 'browseWebdav' | 'importWebdavTrack' | 'importWebdavFolder' | 'deleteWebdavFiles'
  | 'toggleSelect' | 'selectAll' | 'invertSelection' | 'clearSelection'
  | 'moveSelectionToTag' | 'addSelectionToPlaylist'
  | 'patchTrack' | 'ensureTrackLyric' | 'refreshTrackMetadata' | 'matchMissingCovers' | 'toggleFavorite' | 'togglePin' | 'deleteTrack' | 'batchTracks'
  | 'createTag' | 'patchTag' | 'deleteTag'
  | 'createPlaylist' | 'renamePlaylist' | 'deletePlaylist' | 'addToPlaylist' | 'removeFromPlaylist'
  | 'uploadFiles' | 'dismissUpload'
  | 'downloadTracks' | 'dismissDownload' | 'dismissLibraryJob' | 'setTransfersOpen' | 'setUploadTarget'>

export function librarySlice(set: MusicSet, get: MusicGet): LibrarySlice {
  return {
    loadLibrary: (force) => loadLibrary(set, get, force),
    setScope: (scope) => setScope(set, scope),
    setQuery: (query) => setQuery(set, get, query),
    commitQuery: (query) => commitQuery(set, get, query),
    clearSearchHistory: () => clearSearchHistory(set),
    setSort: (sort) => setSort(set, sort),
    setViewMode: (mode) => setViewMode(set, mode),
    openTrackMenu: (menu) => openTrackMenu(set, menu),
    closeTrackMenu: () => closeTrackMenu(set),
    setSourceFilter: (filter) => setSourceFilter(set, filter),
    prepareRomanization: () => prepareRomanization(set, get),
    toggleSelect: (id, additive) => toggleSelect(set, id, additive),
    selectAll: (ids) => selectAll(set, ids),
    invertSelection: (ids) => invertSelection(set, ids),
    clearSelection: () => clearSelection(set),
    moveSelectionToTag: (tagId) => moveSelectionToTag(set, get, tagId),
    addSelectionToPlaylist: (playlistId) => addSelectionToPlaylist(set, get, playlistId),
    patchTrack: (id, patch) => patchTrack(set, get, id, patch),
    ensureTrackLyric: (id) => ensureTrackLyric(set, get, id),
    refreshTrackMetadata: (ids) => refreshTrackMetadata(set, get, ids),
    matchMissingCovers: () => matchMissingCovers(set, get),
    toggleFavorite: (id) => toggleFavorite(set, get, id),
    togglePin: (id) => togglePin(set, get, id),
    deleteTrack: (id) => deleteTrack(set, get, id),
    batchTracks: (action) => batchTracks(set, get, action as MusicBatchAction),
    createTag: (name, color) => createTag(set, get, name, color),
    patchTag: (id, patch) => patchTag(set, id, patch),
    deleteTag: (id) => deleteTag(set, id),

    createPlaylist: (name, description) => createPlaylist(set, name, description),
    renamePlaylist: (id, name, description) => renamePlaylist(set, id, name, description),
    deletePlaylist: (id) => deletePlaylist(set, id),
    addToPlaylist: (playlistId, trackId) => addToPlaylist(set, get, playlistId, trackId),
    removeFromPlaylist: (playlistId, itemId) => removeFromPlaylist(set, playlistId, itemId),

    uploadFiles: (files, target) => uploadFiles(set, get, files, target),
    browseWebdav: (path) => browseWebdav(set, path),
    importWebdavTrack: (entry) => importWebdavTrack(set, get, entry),
    importWebdavFolder: () => importWebdavFolder(set, get),
    deleteWebdavFiles: (paths) => deleteWebdavObjects(paths),
    dismissUpload: (id) => dismissUpload(set, id),
    downloadTracks: (ids) => downloadTracks(set, get, ids),
    dismissDownload: (id) => dismissDownload(set, id),
    dismissLibraryJob: (kind) => dismissLibraryJob(set, kind),
    setTransfersOpen: (open) => setTransfersOpen(set, open),
    setUploadTarget: (target) => setUploadTarget(set, target),
  }
}