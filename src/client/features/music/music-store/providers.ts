import { persist } from './persist'
import type { MusicGet, MusicSet } from './types'

// FEA-A1-1: the online-source switches. Nothing else here — the searches and
// the play path arrive with A1-3, behind these opt-ins.
export function setProviderEnabled(set: MusicSet, get: MusicGet, providerId: string, enabled: boolean): void {
  set((state) => ({ providerEnabled: { ...state.providerEnabled, [providerId]: enabled } }))
  persist(get)
}
