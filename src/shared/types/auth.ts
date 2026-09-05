import type { UserSettings } from './settings';
import type { SiteInfo } from './site';

export type UserRole = 'owner' | 'member'

export interface PublicUser {
  id: string
  login: string
  name: string
  avatarUrl: string
  role: UserRole
  createdAt: number

  username: string
}

export interface SessionInfo {
  user: PublicUser | null
  site: SiteInfo
  settings: UserSettings | null
}

export interface TotpLoginChallenge {
  twoFactorRequired: true
  challengeToken: string
  expiresAt: number
}

export type PasswordLoginResult = SessionInfo | TotpLoginChallenge

export type TotpLoginResult = SessionInfo & {
  recoveryCodeUsed: boolean
  recoveryCodesRemaining: number | null
}

export interface TotpStatus {
  available: boolean
  enabled: boolean
  enabledAt: number | null
  recoveryCodesRemaining: number
}

export interface TotpSetupInfo {
  setupToken: string
  secret: string
  uri: string
  expiresAt: number
}

export interface TotpRecoveryCodesResult {
  recoveryCodes: string[]
  recoveryCodesRemaining: number
  generatedAt: number
}
