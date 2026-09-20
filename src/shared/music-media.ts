// `format` only names a track's container extension, and the mp4/webm containers carry
// either kind, so the stored mime is the single authority on what a track is.
const VIDEO_MIME_RE = /^video\//i

export function isVideoMime(mime: string | null | undefined): boolean {
  return mime !== null && mime !== undefined && VIDEO_MIME_RE.test(mime)
}
