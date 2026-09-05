import type { AppLocale, PasswordLoginResult, PublicUser, SessionInfo, TotpRecoveryCodesResult, TotpLoginResult, TotpSetupInfo, TotpStatus } from '@shared/types';
import { publishBroadcast } from '../db';
import { getLocale } from '../i18n';
import { CLIENT_ID, request } from './transport';
export const account = {
  session: () => request<SessionInfo>('/api/auth/session'),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  auth: {
    register: (username: string, password: string, locale: AppLocale = getLocale()) =>
      request<SessionInfo>('/api/auth/register', {
        method: 'POST',
        body: { username, password, locale },
      }),
    login: (username: string, password: string) =>
      request<PasswordLoginResult>('/api/auth/login', { method: 'POST', body: { username, password } }),
    totp: {
      status: () => request<TotpStatus>('/api/auth/totp/status'),
      startSetup: (currentPassword: string) =>
        request<TotpSetupInfo>('/api/auth/totp/setup', {
          method: 'POST',
          body: { currentPassword },
        }),
      confirmSetup: (setupToken: string, code: string) =>
        request<TotpRecoveryCodesResult & { enabledAt: number }>('/api/auth/totp/setup/confirm', {
          method: 'POST',
          body: { setupToken, code },
        }),
      cancelSetup: (setupToken: string) =>
        request<{ ok: true }>('/api/auth/totp/setup', {
          method: 'DELETE',
          body: { setupToken },
        }),
      completeLogin: (challengeToken: string, code: string) =>
        request<TotpLoginResult>('/api/auth/totp/login', {
          method: 'POST',
          body: { challengeToken, code },
        }),
      regenerateRecoveryCodes: (currentPassword: string, code: string) =>
        request<TotpRecoveryCodesResult>('/api/auth/totp/recovery-codes', {
          method: 'POST',
          body: { currentPassword, code },
        }),
      disable: (currentPassword: string, code: string) =>
        request<{ ok: true }>('/api/auth/totp', {
          method: 'DELETE',
          body: { currentPassword, code },
        }),
    },
    setPassword: (body: {
      currentPassword: string
      newPassword: string
    }) =>
      request<{ ok: true }>('/api/auth/password', { method: 'POST', body }),
    updateProfile: async (body: { name?: string; avatarUrl?: string }) => {
      const user = await request<PublicUser>('/api/auth/profile', {
        method: 'PUT',
        body,
        timeoutMs: 30_000,
      })
      publishBroadcast({ type: 'profile-changed', clientId: CLIENT_ID })
      return user
    },
    updateRegistration: async (enabled: boolean, password: string) => {
      const result = await request<{ ok: true; registrationOpen: boolean }>('/api/settings/registration', {
        method: 'PUT',
        body: { enabled, password },
      })
      publishBroadcast({ type: 'site-changed', clientId: CLIENT_ID })
      return result
    },
  },
}

