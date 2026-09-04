


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

export interface SiteInfo {
  name: string

  initialized: boolean

  registrationOpen: boolean

  r2Enabled: boolean

  kvEnabled: boolean

  attachmentStorage: 'r2' | 'kv' | null

  realtimeEnabled: boolean
  version: string
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

export type UpdateCheckStatus = 'ok' | 'unavailable'

export interface UpdateCheckResponse {
  currentVersion: string
  latestVersion: string | null
  updateUrl: string | null
  checkedAt: number | null
  status: UpdateCheckStatus
}


export type ThemePref = 'light' | 'dark' | 'system'
export type AppLocale = 'zh-CN' | 'en-US'
export type AccentName = 'cinnabar' | 'indigo' | 'celadon' | 'amber' | 'terracotta' | 'wisteria' | 'graphite'
export type BackgroundName = 'paper' | 'white'
export type UiDensity = 'comfortable' | 'compact'
export type ProseFont = 'sans' | 'serif'
export type ProseWidth = 'narrow' | 'normal' | 'wide' | 'full'
export type EditorLayout = 'edit' | 'split' | 'preview'
export type BackupSchedule = 'off' | 'hourly' | 'sixHourly' | 'daily'

export interface AppearanceSettings {
  language: AppLocale
  theme: ThemePref
  accent: AccentName
  background: BackgroundName
  density: UiDensity
  proseFont: ProseFont
  proseSize: number
  proseWidth: ProseWidth
  proseLineHeight: number
}

export interface EditorSettings {
  fontSize: number
  fontFamily: 'mono' | 'sans'
  lineNumbers: boolean
  typewriter: boolean
  focusMode: boolean
  spellcheck: boolean
  showToolbar: boolean
  tabSize: number
  autoSaveDelay: number
}

export interface PreviewSettings {
  layout: EditorLayout
  syncScroll: boolean
  showToc: boolean
  math: boolean
  mermaid: boolean
  codeBlockCollapse: boolean
  codeBlockCollapseLines: number
  linkHover: boolean
  linkHoverDelayMs: number
  linkPreviewLength: number
  /** Load external (https) images in rendered notes. Off by default: external
   *  images are replaced with a blocked placeholder (renderer-level), and the
   *  server drops `https:` from CSP `img-src` while it is off — so raw-HTML
   *  images in notes stay blocked on the app page and are ALWAYS blocked on
   *  share pages (/s/*), where visitors never opt in. */
  externalImages: boolean
}

export interface BackupSettings {
  schedule: BackupSchedule
}

export interface SyncSettings {
  realtime: boolean
  pollIntervalMs: number
}

export interface NoteSettings {
  newNoteTemplate: string
  syncTitleToFrontMatter: boolean
  syncFrontMatterTitle: boolean
  /** Tag(s, comma-separated) that file notes into the sidebar to-do tree; null falls back to the locale default. */
  todoTag: string | null
}

export interface UserSettings {
  appearance: AppearanceSettings
  editor: EditorSettings
  preview: PreviewSettings
  backup: BackupSettings
  sync: SyncSettings
  notes: NoteSettings
}


export interface NoteSummary {
  id: string
  title: string
  excerpt: string
  folderId: string | null
  tags: string[]
  isPinned: boolean
  isStarred: boolean
  isArchived: boolean
  wordCount: number
  charCount: number
  rev: number
  position: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Note extends NoteSummary {
  content: string
}

export interface Folder {
  id: string
  parentId: string | null
  name: string
  icon: string | null
  color: string | null
  position: number
  createdAt: number
  updatedAt: number

  noteCount?: number
}

export interface Tag {
  id: string
  name: string
  color: string | null
  isPinned?: boolean
  count: number
  createdAt: number
}

export interface NoteTemplateCategory {
  id: string
  name: string
  /** True for categories shipped with the app; they cannot be renamed or deleted. */
  builtin: boolean
  position: number
  createdAt: number
}

export interface NoteTemplate {
  id: string
  categoryId: string | null
  name: string
  description: string
  content: string
  /** True for templates shipped with the app; they can be edited but not deleted. */
  builtin: boolean
  isPinned: boolean
  isStarred: boolean
  /** Free-form labels shown in the gallery and used as a filter. */
  tags: string[]
  /** Manual sort position within the category; falls back to `updatedAt` when absent. */
  position?: number
  createdAt: number
  updatedAt: number
}

export interface CommunityTemplate {
  id: string
  authorId: string
  authorName: string
  name: string
  description: string
  content: string
  tags: string[]
  category: string
  createdAt: number
}

export interface CommunityTemplateInput {
  id?: string
  name: string
  description: string
  content: string
  tags: string[]
  category: string
}

export interface NoteVersionMeta {
  id: string
  noteId: string
  title: string
  size: number
  createdAt: number
}

export interface NoteVersion extends NoteVersionMeta {
  content: string
}

export interface Backlink {
  id: string
  title: string
  context: string
}

export interface Attachment {
  id: string
  noteId: string | null
  folderId?: string | null
  filename: string
  mime: string
  size: number
  width: number | null
  height: number | null
  url: string
  createdAt: number
  isStarred?: boolean
  isPinned?: boolean
  tags?: string[]
}

export interface AttachmentWithUsage extends Attachment {
  references: number
}

export interface AttachmentFolder {
  id: string
  userId?: string
  parentId: string | null
  name: string
  icon?: string | null
  color?: string | null
  position?: number
  createdAt: number
  updatedAt: number
}

export interface AttachmentTag {
  id: string
  userId?: string
  name: string
  color?: string | null
  isPinned?: boolean
  createdAt: number
}

export interface AttachmentStats {
  totalCount: number
  totalBytes: number
  totalQuotaBytes: number
  imageBytes: number
  documentBytes: number
  mediaBytes: number
  archiveBytes: number
  codeBytes: number
  otherBytes: number
  unreferencedCount: number
  folderCount?: number
  tagCount?: number
  extensionBreakdown?: Record<string, { count: number; bytes: number }>
  largestFiles?: AttachmentWithUsage[]
}


export type ViewKind =
  | 'all'
  | 'recent'
  | 'starred'
  | 'pinned'
  | 'shared'
  | 'unfiled'
  | 'archived'
  | 'trash'
  | 'folder'
  | 'tag'
  | 'untagged'

export type SortKey = 'updated' | 'created' | 'title'
export type SortOrder = 'asc' | 'desc'

export interface ListNotesQuery {
  view?: ViewKind
  folderId?: string
  tag?: string
  sort?: SortKey
  order?: SortOrder
  limit?: number
  cursor?: string
}

export interface ListNotesResponse {
  notes: NoteSummary[]
  nextCursor: string | null
  /** Exact row count of the current view; only present on the first page to keep deep-paging cheap. */
  total: number | null
}

export interface CreateNoteBody {
  id?: string
  title?: string
  content?: string
  folderId?: string | null
  isStarred?: boolean
}

export interface PatchNoteBody {
  rev: number
  title?: string
  content?: string
  folderId?: string | null
  isPinned?: boolean
  isStarred?: boolean
  isArchived?: boolean

  quiet?: boolean
  preserveVersion?: boolean
}

export interface ConflictPayload {
  code: 'conflict'
  message: string
  server: Note
}


export type SearchMode = 'fts' | 'like'

export interface SearchHit {
  note: NoteSummary
  snippet: string
  score: number
}

export interface SearchResponse {
  results: SearchHit[]
  mode: SearchMode
  took: number
  query: {
    text: string
    tags: string[]
    folder: string | null
    starred: boolean | null
    archived: boolean | null
  }
}

export interface GraphNode {
  id: string
  title: string
  kind: 'note' | 'unresolved'
  degree: number
  inDegree: number
  outDegree: number
  folderId: string | null
  folderName: string | null
  folderColor: string | null
  tags: Array<{ name: string; color: string | null }>
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  meta: {
    mode: 'global' | 'local'
    centerId: string | null
    depth: number
    totalNodes: number
    totalEdges: number
    truncated: boolean
    limit: number
  }
}

export interface GraphQuery {
  mode?: 'global' | 'local'
  center?: string
  depth?: number
  q?: string
  folderId?: string
  tag?: string
  /** Tags to filter by. Overrides `tag`; sent comma-separated. */
  tags?: string[]
  /** How multiple tags combine: `any` (default) for union, `all` for intersection. */
  tagsMatch?: 'any' | 'all'
  includeOrphans?: boolean
  includeUnresolved?: boolean
  limit?: number
}


export interface SyncDeletion {
  entity: 'note' | 'folder' | 'tag'
  id: string
}

export interface SyncResponse {
  cursor: number
  full: boolean

  hasMore: boolean

  nextKey: string | null

  facetsFull: boolean

  settingsChanged: boolean
  profileChanged?: boolean
  siteChanged?: boolean
  notes: NoteSummary[]
  folders: Folder[]
  tags: Tag[]
  deletions: SyncDeletion[]
  serverTime: number
}

export type RealtimeMessage =
  | { type: 'changed'; cursor: number; origin: string | null }
  | { type: 'ping' }
  | { type: 'pong'; serverTime: number }


export type BackupTargetType = 'webdav' | 's3'
export type BackupMode = 'archive' | 'mirror'

export interface S3Config {
  endpoint: string
  region: string
  bucket: string
  prefix: string
  pathStyle: boolean
  mode: BackupMode
}

export interface WebdavConfig {
  url: string
  username: string
  prefix: string
  mode: BackupMode
}

export type BackupTargetConfig = S3Config | WebdavConfig

export interface BackupTarget {
  id: string
  type: BackupTargetType
  name: string
  enabled: boolean
  config: BackupTargetConfig
  hasSecret: boolean
  lastRunAt: number | null
  lastStatus: 'success' | 'failed' | null
  lastError: string | null
  createdAt: number
  updatedAt: number
}

export interface BackupTargetInput {
  type: BackupTargetType
  name: string
  enabled?: boolean
  config: Partial<S3Config> & Partial<WebdavConfig>

  secret?: {
    password?: string
    accessKeyId?: string
    secretAccessKey?: string
  }
}

export type BackupTargetPatchInput = Partial<BackupTargetInput> & {
  expectedUpdatedAt?: number
}

export interface BackupTargetResult {
  targetId: string
  targetName: string
  targetType: BackupTargetType
  ok: boolean
  files: number
  bytes: number
  ms: number
  error: string | null
}

export interface BackupRun {
  id: string
  trigger: 'manual' | 'cron'
  status: 'running' | 'success' | 'partial' | 'failed'
  startedAt: number
  finishedAt: number | null
  noteCount: number
  fileCount: number
  bytes: number
  results: BackupTargetResult[]
}

export interface TestConnectionResult {
  ok: boolean
  message: string
  detail?: string
  latencyMs?: number
}


export interface ShareFolder {
  id: string
  userId?: string
  parentId: string | null
  name: string
  icon?: string | null
  color?: string | null
  position?: number
  createdAt: number
  updatedAt: number
}

export interface ShareTag {
  id: string
  userId?: string
  name: string
  color?: string | null
  isPinned?: boolean
  createdAt: number
}

export interface ShareInfo {
  slug: string
  noteId: string
  url: string
  hasPassword: boolean
  expiresAt: number | null
  views: number
  createdAt: number
  isEnabled: boolean
  lastViewedAt: number | null
  uniqueVisitors?: number
  noteTitle?: string
  noteExcerpt?: string
  folderId?: string | null
  tags?: string[]
  shareFolderId?: string | null
  shareTags?: string[]
  isPinned?: boolean
  isStarred?: boolean
}

export type ShareCategory =
  | 'dashboard'
  | 'all'
  | 'active'
  | 'paused'
  | 'pinned'
  | 'starred'
  | 'password'
  | 'expiring'
  | 'permanent'
  | 'expired'

export type ShareTimelineRange = '24h' | '7d' | '30d' | 'all'

export interface ShareBreakdownItem {
  name: string
  count: number
  percentage?: number
}

export interface ShareTimelinePoint {
  label: string
  timestamp: number
  views: number
  visitors: number
}

export interface ShareAnalyticsFilters {
  excludeBots: boolean
  excludeSelfReferrers: boolean
  excludeOwner: boolean
}

export interface ShareVisitLog {
  id: number
  noteId: string
  noteTitle: string
  slug: string
  visitedAt: number
  country: string | null
  region: string | null
  city: string | null
  referrer: string | null
  referrerHost: string | null
  deviceType: string | null
  os: string | null
  browser: string | null
  isBot: boolean
  isSelfReferrer?: boolean
  isOwner?: boolean
  botName?: string | null
  visitorFp?: string | null
}

export interface ShareGlobalAnalytics {
  range: ShareTimelineRange
  totalShares: number
  activeShares: number
  totalViews: number
  totalVisitors: number
  viewsDelta?: number
  visitorsDelta?: number
  viewsPerDay: number
  sparklineViews: number[]
  sparklineVisitors: number[]
  timeline: ShareTimelinePoint[]
  topNotes: Array<{
    noteId: string
    noteTitle: string
    slug: string
    views: number
    visitors: number
  }>
  topCountries: ShareBreakdownItem[]
  topReferrers: ShareBreakdownItem[]
  devices: ShareBreakdownItem[]
  osList: ShareBreakdownItem[]
  browsers: ShareBreakdownItem[]
  recentVisits: ShareVisitLog[]
  filterStats?: {
    bots: number
    selfReferrals: number
    owner: number
  }
}

export interface ShareNoteAnalytics {
  range: ShareTimelineRange
  noteId: string
  noteTitle: string
  slug: string
  url: string
  createdAt: number
  expiresAt: number | null
  hasPassword: boolean
  isEnabled: boolean
  totalViews: number
  totalVisitors: number
  timeline: ShareTimelinePoint[]
  topCountries: ShareBreakdownItem[]
  topReferrers: ShareBreakdownItem[]
  devices: ShareBreakdownItem[]
  osList: ShareBreakdownItem[]
  browsers: ShareBreakdownItem[]
  recentVisits: ShareVisitLog[]
}

export interface ShareListResponse {
  shares: ShareInfo[]
  total: number
  globalStats: {
    totalShares: number
    activeShares: number
    pinnedShares?: number
    starredShares?: number
    pausedShares?: number
    expiredShares?: number
    totalViews: number
    totalVisitors: number
    folderCounts: Record<string, { total: number; shared: number }>
    tagCounts: Record<string, { total: number; shared: number }>
  }
}

export interface ShareVisitsResponse {
  visits: ShareVisitLog[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface PublicNote {
  title: string
  content: string
  updatedAt: number
  createdAt: number
  author: { name: string; avatarUrl: string }
  site: { name: string }
  share: { slug: string }
}


export interface ExportBundle {

  format: string
  version: 1
  exportedAt: number
  user: { login: string; name: string }
  folders: Folder[]
  tags: Tag[]
  notes: Note[]

  attachments: ExportAttachment[]
}

export interface ExportAttachment {
  id: string
  noteId: string | null
  filename: string
  mime: string
  size: number
  width: number | null
  height: number | null
  createdAt: number
  path: string
  sha256: string
}

export interface ImportResult {
  createdNotes: number
  updatedNotes: number
  skippedNotes: number
  createdFolders: number
  createdAttachments: number
  skippedAttachments: number
  warnings: string[]
}


export interface McpPreferences {
  writeEnabled: boolean
  trashEnabled: boolean
  updatedAt: number
}

export interface McpGrant {
  id: string
  clientId: string
  clientName: string
  clientUri: string | null
  scopes: string[]
  createdAt: number
  expiresAt: number | null
}

export interface McpApiKey {
  id: string
  name: string
  scopes: string[]
  createdAt: number
  lastUsedAt: number | null
}

export interface McpAiSearchStatus {
  available: boolean
  enabled: boolean
  model: string
  indexedCount: number
  pendingCount: number
  reason: 'no_ai_binding' | null
}

export interface McpSettingsInfo {
  enabled: boolean
  canManageGlobal: boolean
  endpoint: string
  oauth: true
  preferences: McpPreferences
  apiKeys: McpApiKey[]
  aiSearch: McpAiSearchStatus
  grants: McpGrant[]
  privacy: {
    publicEndpoint: false
    perUserIndex: true
    externalClientReceivesSelectedContent: true
  }
}


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
  | 'storage_unavailable'
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
