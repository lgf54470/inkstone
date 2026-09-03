import { LIMITS, mergeSettings } from '@shared/constants'
import { countText, deriveExcerpt, deriveTitle, extractTags, sortTagNames } from '@shared/markdown-utils'
import { truncateText } from '@shared/text-utils'
import { welcomeNoteTemplates } from '@shared/welcome-notes'
import type {
  Attachment,
  BackupRun,
  BackupTarget,
  CommunityTemplate,
  Folder,
  Note,
  NoteSummary,
  NoteVersion,
  PublicUser,
  ShareInfo,
  Tag,
  UserSettings,
} from '@shared/types'

export interface DemoAttachment {
  meta: Attachment
  file: File
}

export interface DemoShare {
  info: ShareInfo
  password: string | null
}

export interface DemoState {
  authenticated: boolean
  password: string
  registrationOpen: boolean
  cursor: number
  user: PublicUser
  settings: UserSettings
  notes: Map<string, Note>
  folders: Map<string, Folder>
  tagIds: Map<string, string>
  tagColors: Map<string, string | null>
  versions: Map<string, NoteVersion[]>
  attachments: Map<string, DemoAttachment>
  shares: Map<string, DemoShare>
  backupTargets: Map<string, BackupTarget>
  backupRuns: BackupRun[]
  communityTemplates: CommunityTemplate[]
}

const seedId = (value: number) => `01j${String(value).padStart(23, '0')}`

export function newDemoId(): string {
  const alphabet = '0123456789abcdefghjkmnpqrstvwxyz'
  const bytes = crypto.getRandomValues(new Uint8Array(26))
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('')
}

export function createDemoState(): DemoState {
  const now = Date.now()
  const folders: Folder[] = []
  // Welcome notes are deliberately dated a few weeks back: with no edits within the last ~10 days,
  // the rolling date filter's follow-edit window stays parked at the newest edit and the gap hint
  // (newest edit outside a today-anchored window) is directly visible in the demo.
  const notes = welcomeNoteTemplates('zh-CN').map(({ content }, index) =>
    note(seedId(20 + index), content, null, now - 86_400_000 * (21 + 7 * index), { isPinned: true, isStarred: true }),
  )
  const tagIds = new Map<string, string>()
  for (const item of notes) {
    for (const name of item.tags) if (!tagIds.has(name)) tagIds.set(name, newDemoId())
  }
  const tagColors = new Map<string, string | null>([['getting-started', '#6366f1']])
  const preferredLocaleTag = notes[0]?.tags.find((name) => name !== 'Inkstone')
  if (preferredLocaleTag) tagColors.set(preferredLocaleTag, '#b5482e')
  const welcomeShare: ShareInfo = {
    slug: 'welcome',
    noteId: notes[0]!.id,
    url: '/s/welcome',
    hasPassword: false,
    expiresAt: null,
    views: 12,
    createdAt: now - 86_400_000 * 4,
    isEnabled: true,
    lastViewedAt: null,
  }

  return {
    authenticated: false,
    password: 'password',
    registrationOpen: false,
    cursor: 1,
    user: {
      id: seedId(1),
      login: 'admin',
      username: 'admin',
      name: 'Demo Admin',
      avatarUrl: 'dicebear:0123456789abcdef0123456789abcdef',
      role: 'owner',
      createdAt: now - 86_400_000 * 30,
    },
    settings: mergeSettings({ sync: { realtime: false, pollIntervalMs: 300_000 } }),
    notes: new Map(notes.map((item) => [item.id, item])),
    folders: new Map(folders.map((item) => [item.id, item])),
    tagIds,
    tagColors,
    versions: new Map(),
    attachments: new Map(),
    shares: new Map([[welcomeShare.noteId, { info: welcomeShare, password: null }]]),
    backupTargets: new Map(),
    backupRuns: [],
    communityTemplates: [
      {
        id: 'cm-01j00000000000000000000001',
        authorId: 'community-alice',
        authorName: '阿远',
        name: '面试复盘',
        description: '记录面试过程、问题与反思，为下一次做准备。',
        content: `# 面试复盘

## 基本信息

- 公司 / 职位：
- 面试时间：{{date}}
- 面试官：

## 面试问题

- [ ] 
- [ ] 

## 我的表现

- 做得好：
- 待改进：

## 下一步

- [ ] 发送感谢信
- [ ] 准备二面`,
        tags: ['工作', '复盘'],
        category: '工作与会议',
        createdAt: now - 86_400_000 * 3,
      },
      {
        id: 'cm-01j00000000000000000000002',
        authorId: 'community-bob',
        authorName: '小林',
        name: '家庭旅行规划',
        description: '带家人出行的完整规划：路线、住宿、餐饮与应急。',
        content: `# 家庭旅行规划

## 目的地

- 城市：
- 日期：{{date}}
- 同行人：

## 行程

| 日期 | 上午 | 下午 | 晚上 |
| --- | --- | --- | --- |
| 第1天 |  |  |  |
| 第2天 |  |  |  |

## 预订清单

- [ ] 机票 / 车票
- [ ] 酒店
- [ ] 门票

## 应急联系

- 紧急联系人：
- 附近医院：`,
        tags: ['旅行', '清单'],
        category: '生活记录',
        createdAt: now - 86_400_000 * 2,
      },
      {
        id: 'cm-01j00000000000000000000003',
        authorId: 'community-cara',
        authorName: 'Momo',
        name: '极简晨间流程',
        description: '五分钟晨间仪式：喝水、伸展、写三件最重要的事。',
        content: `# 极简晨间流程

- [ ] 喝一杯水
- [ ] 伸展 5 分钟
- [ ] 写下今天最重要的三件事
- [ ] 不看手机 30 分钟

## 今日三件事

1. 
2. 
3.`,
        tags: ['每日', '健康'],
        category: '健康与习惯',
        createdAt: now - 86_400_000,
      },
    ],
  }
}

export function summarize(note: Note): NoteSummary {
  const { content: _content, ...summary } = note
  return summary
}

export function refreshNote(note: Note, content: string, title?: string): Note {
  const counted = countText(content)
  return {
    ...note,
    content,
    title: title === undefined ? note.title : truncateText(title.trim(), LIMITS.titleMaxLength),
    excerpt: deriveExcerpt(content),
    tags: sortTagNames(extractTags(content)),
    wordCount: counted.words,
    charCount: counted.chars,
  }
}

export function listFolders(state: DemoState): Folder[] {
  return [...state.folders.values()]
    .map((item) => ({
      ...item,
      noteCount: [...state.notes.values()].filter(
        (note) => note.folderId === item.id && note.deletedAt === null,
      ).length,
    }))
    .sort((left, right) => left.position - right.position || left.createdAt - right.createdAt || left.id.localeCompare(right.id))
}

export function listTags(state: DemoState): Tag[] {
  const counts = new Map<string, number>()
  for (const item of state.notes.values()) {
    if (item.deletedAt !== null) continue
    for (const name of item.tags) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const names = new Set([...state.tagIds.keys(), ...counts.keys()])
  return sortTagNames(names).map((name) => {
    let id = state.tagIds.get(name)
    if (!id) {
      id = newDemoId()
      state.tagIds.set(name, id)
    }
    return {
      id,
      name,
      color: state.tagColors.get(name) ?? null,
      count: counts.get(name) ?? 0,
      createdAt: Date.now() - 86_400_000,
    }
  })
}

function note(
  id: string,
  content: string,
  folderId: string | null,
  createdAt: number,
  flags: Partial<Pick<Note, 'isPinned' | 'isStarred' | 'isArchived' | 'deletedAt'>> = {},
): Note {
  const counted = countText(content)
  return {
    id,
    title: deriveTitle(content),
    excerpt: deriveExcerpt(content),
    content,
    folderId,
    tags: sortTagNames(extractTags(content)),
    isPinned: flags.isPinned ?? false,
    isStarred: flags.isStarred ?? false,
    isArchived: flags.isArchived ?? false,
    wordCount: counted.words,
    charCount: counted.chars,
    rev: 1,
    position: createdAt,
    createdAt,
    updatedAt: createdAt,
    deletedAt: flags.deletedAt ?? null,
  }
}
