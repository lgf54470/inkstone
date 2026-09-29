interface Window {
  /** 运行时注入的 API 地址（部署脚本可挂载到 window 上覆盖环境变量）。 */
  __INKSTONE_API_URL__?: string
  /** 运行时注入的博客归属账号，公开 API 以 `?owner=` 指出请求的是哪个账号的博客。 */
  __INKSTONE_BLOG_OWNER__?: string
}
