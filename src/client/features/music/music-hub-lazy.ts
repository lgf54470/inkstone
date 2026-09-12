import { lazy } from 'react'

export const MusicHubModal = lazy(() => import('./music-hub-modal').then((m) => ({ default: m.MusicHubModal })))
