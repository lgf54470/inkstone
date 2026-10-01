import type { BlogSiteInfo } from './types'

/**
 * 站点身份的显示兜底，**不是内容兜底**（BF-1）：名字/副标题/简介/社交入口缺失时页面仍需要
 * 可读的标题与页脚，这些字段不声称任何一篇文章存在。取数失败的文章/时间轴/日历一律让错误
 * 向上走，页面与 feed/sitemap 用 5xx + no-store 回答——失败就是失败。
 */
export const FALLBACK_SITE_INFO: BlogSiteInfo = {
  siteName: 'Inkstone Blog',
  subtitle: '静水流深，石上墨香 · 基于 Inkstone & Astro 驱动',
  bio: '记录思考、技术与生活。使用现代化 Markdown 双链笔记与高性能静态博客驱动。',
  authorName: 'Inkstone Author',
  authorAvatar: '',
  socialLinks: {
    github: 'https://github.com/shuaiplus/inkstone',
  },
  postsPerPage: 10,
  requireCommentApproval: false,
}
