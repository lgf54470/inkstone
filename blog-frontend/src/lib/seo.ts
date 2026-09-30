import type { BlogPost } from './types'

export interface PostSeo {
  title: string
  description: string
  image: string | null
  canonicalUrl: string
  noindex: boolean
}

/**
 * 文章级 SEO 字段（后台的文章设置里填）优先于文章本身的标题、摘要与封面：
 * 留空即使用文章自己的值，因此没有填过这些字段的文章渲染出来与从前完全一致。
 * canonical 缺省取当前页面地址，noindex 缺省为可收录。
 * 抽出为纯函数便于单测——页面只剩一行调用，优先级规则在这里被钉住。
 */
export function resolvePostSeo(post: BlogPost, pageUrl: string): PostSeo {
  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    image: post.seoImageUrl || post.coverUrl || null,
    canonicalUrl: post.seoCanonicalUrl || pageUrl,
    noindex: post.seoNoindex === true,
  }
}
