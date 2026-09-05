import { SHOWCASE_CONTENT } from '../data/showcase'
import type { BlogSiteInfo, BlogPost } from './types'

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

export const FALLBACK_POSTS: BlogPost[] = [
  {
    id: 'demo-1',
    noteId: 'note-1',
    title: '欢迎来到 Inkstone 博客',
    slug: 'welcome-to-inkstone-blog',
    excerpt: '这是一篇演示博文，展示了与 Inkstone 笔记预览 100% 保持一致的高品质排版系统。',
    content: `# 欢迎使用 Inkstone 博客

这是一篇演示博文。基于 **Astro** 现代前端架构与 **Inkstone** 笔记系统紧密联动驱动！

## 🎯 核心特性

- **100% 样式一致性**：与 Inkstone 客户端预览样式像素级复刻，包括标题、引用、代码高亮、公式与表格；
- **全套外观令牌**：支持 7 款传统典雅强调色、浅色/深色/跟随系统、暖纸与纯白背景底色、舒适与紧凑界面密度；
- **组件丰富美观**：包含发文日历组件、动态标签云、时间线归档、即时快捷搜索与双向联动审核评论区；
- **极速高性能**：Astro 架构驱动，页面秒开，SEO 友好！

> “石墨为骨，静水流深。” —— 打造专注纯粹的沉浸式写作与阅读体验。

### 常用数学公式支持

$$
E = mc^2 \\quad \\text{与} \\quad \\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

### 代码块与高亮

\`\`\`typescript
interface BlogPost {
  title: string;
  slug: string;
  isPublished: boolean;
}

function publish(post: BlogPost) {
  console.log(\`Successfully published: \${post.title}\`);
}
\`\`\`

欢迎在下方留言互动！
`,
    coverUrl: 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1200&q=80',
    categoryId: 'cat-tech',
    tags: ['Inkstone', 'Astro', 'Markdown'],
    isPublished: true,
    publishedAt: Date.now() - 3600 * 1000 * 24,
    allowComments: true,
    isPinned: true,
    views: 128,
    commentsCount: 2,
    createdAt: Date.now() - 3600 * 1000 * 48,
    updatedAt: Date.now(),
  },
  {
    id: 'syntax-showcase',
    noteId: 'note-syntax-showcase',
    title: 'Inkstone 完整 Markdown 语法全景展示',
    slug: 'markdown-syntax-showcase',
    excerpt: '展示 Inkstone 当前所支持的全部 Markdown 语法与扩展功能，包含 14 种 Mermaid 图表、7 种 Chart.js 数据图表及全部自定义扩展样式。',
    content: SHOWCASE_CONTENT,
    coverUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80',
    categoryId: 'cat-tech',
    tags: ['markdown', 'showcase', 'cheatsheet', 'inkstone'],
    isPublished: true,
    publishedAt: Date.now() - 3600 * 1000 * 12,
    allowComments: true,
    isPinned: true,
    views: 356,
    commentsCount: 4,
    createdAt: Date.now() - 3600 * 1000 * 24,
    updatedAt: Date.now(),
  },
]