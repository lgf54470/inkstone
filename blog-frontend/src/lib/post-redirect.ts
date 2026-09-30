/**
 * 文章改名后旧地址要不要 301：只要服务端给出了一个不同的当前地址就跳，
 * 否则把请求留成 404。抽成纯函数是因为这个判断就决定了「改名后旧链接还能不能打开」，
 * 而它只有三种输入，值得单独钉住（页面里只剩一行调用）。
 */
export function redirectTargetFor(requested: string, current: string | null | undefined): string | null {
  if (!current || current === requested) return null
  return `/posts/${current}`
}
