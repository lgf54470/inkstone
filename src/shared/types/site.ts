export interface SiteInfo {
  name: string

  initialized: boolean

  registrationOpen: boolean

  r2Enabled: boolean

  kvEnabled: boolean

  attachmentStorage: 'r2' | 'kv' | null

  realtimeEnabled: boolean

  /** Whether this instance keeps a visitor fingerprint — the only thing unique visitors can be counted from. */
  visitorFingerprints: boolean

  version: string
}
