/** 每页文章数兜底值（站点配置 postsPerPage 缺失/离线 fallback 时使用） */
export const POSTS_PER_PAGE_DEFAULT = 10
/** 搜索弹窗首次打开时的预取上限 */
export const SEARCH_PREFETCH_LIMIT = 100
/** 搜索结果列表最多展示条数 */
export const SEARCH_RESULT_LIMIT = 8
/** 弹窗打开后聚焦输入框的延迟（ms） */
export const SEARCH_FOCUS_DELAY_MS = 30
/** 复制成功反馈文字持续时长（ms） */
export const COPY_FEEDBACK_MS = 2000
/** 阅读时间估算速度（字/分钟） */
export const WORDS_PER_MINUTE = 350
/** 标签云“热门标签”的最小文章数 */
export const POPULAR_TAG_MIN_POSTS = 2
/** 后端 API 兜底地址（优先使用 PUBLIC_API_URL / meta / window 注入） */
export const DEFAULT_API_URL = 'https://inkstone.333096.xyz'