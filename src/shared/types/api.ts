export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'bad_request'
  | 'payload_too_large'
  | 'media_too_large'
  | 'playlist_full'
  | 'storage_quota_reached'
  | 'tag_name_taken'
  | 'storage_unavailable'
  | 'webdav_listing_too_large'
  | 'internal'
  | 'invalid_username'
  | 'invalid_profile_name'
  | 'invalid_avatar'
  | 'weak_password'
  | 'username_taken'
  | 'invalid_credentials'
  | 'invalid_two_factor_code'
  | 'wrong_password'
  | 'too_many_attempts'
  | 'registration_closed'
  | 'server_misconfigured'
  | 'two_factor_already_enabled'
  | 'two_factor_challenge_expired'
  | 'two_factor_not_enabled'
  | 'two_factor_setup_expired'
  | 'two_factor_unavailable'

export interface DateRangeFilter {
  start: string
  end: string
}

/** A rolling date filter: N days ending either at the newest edit (`edit`) or at today (`today`). */
export interface RelativeFilter {
  days: number
  direction: 'edit' | 'today'
}
