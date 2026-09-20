// 与主应用 `src/shared/music-media.ts` 同一规则的一份镜像：博客是独立 Astro 工程，
// 与 Workers 端不共享构建，跨仓库的引用会把两个应用的依赖图焊在一起。
const VIDEO_MIME_RE = /^video\//i

export type MediaKind = 'audio' | 'video'

export function isVideoMime(mime: string | null | undefined): boolean {
  return mime !== null && mime !== undefined && VIDEO_MIME_RE.test(mime)
}

export function mediaKindOfMime(mime: string | null | undefined): MediaKind {
  return isVideoMime(mime) ? 'video' : 'audio'
}
