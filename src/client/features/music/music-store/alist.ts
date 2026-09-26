import { api } from '../../../lib/api'
import { toastMusic, toastMusicError } from '../music-feedback'
import type { MusicAlistCreateInput, MusicAlistPatchInput } from '../../../lib/api'
import type { MusicSet } from './types'

// FEA-A3: the Alist slice mirrors the WebDAV slice's shape — server registrations
// and (from A3-2 on) a browse state. The token never reaches the client; the view
// type carries name, URL and root path only.
export async function loadAlistServers(set: MusicSet): Promise<void> {
  set({ alistServersLoading: true })
  try {
    const { servers } = await api.music.listAlistServers()
    set({ alistServers: servers, alistServersLoading: false })
  } catch (error) {
    set({ alistServersLoading: false })
    toastMusicError(error, 'music.action_failed')
  }
}

export async function createAlistServer(set: MusicSet, input: MusicAlistCreateInput): Promise<boolean> {
  try {
    const created = await api.music.createAlistServer(input)
    set((state) => ({ alistServers: [...state.alistServers, created] }))
    toastMusic('music.saved')
    return true
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
    return false
  }
}

export async function patchAlistServer(set: MusicSet, id: string, patch: MusicAlistPatchInput): Promise<boolean> {
  try {
    const updated = await api.music.patchAlistServer(id, patch)
    set((state) => ({ alistServers: state.alistServers.map((entry) => (entry.id === id ? updated : entry)) }))
    toastMusic('music.saved')
    return true
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
    return false
  }
}

export async function deleteAlistServer(set: MusicSet, id: string): Promise<void> {
  try {
    await api.music.deleteAlistServer(id)
    set((state) => ({ alistServers: state.alistServers.filter((entry) => entry.id !== id) }))
    toastMusic('music.deleted')
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}
