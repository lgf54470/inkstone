// The playback element belongs to the engine, not to whichever panel is showing it: surfaces
// unmount on breakpoint changes and when overlays close, and an element that holds the stream
// cannot be recreated without losing playback. So a surface claims a container and the engine
// moves its element in. This module owns only the question "which container is showing it".

type Placer = (host: HTMLElement | null) => void

// A stack, because now-playing surfaces nest: the hub column stays mounted under the immersive
// overlay, and closing the overlay has to hand the picture back to what was underneath it.
const hosts: HTMLElement[] = []
let place: Placer | null = null

export function registerMediaStagePlacer(placer: Placer): void {
  place = placer
  apply()
}

export function claimMediaStage(host: HTMLElement): () => void {
  hosts.push(host)
  apply()
  return () => {
    const index = hosts.lastIndexOf(host)
    if (index >= 0) hosts.splice(index, 1)
    apply()
  }
}

export function currentMediaStage(): HTMLElement | null {
  return hosts.length ? hosts[hosts.length - 1] : null
}

function apply(): void {
  place?.(currentMediaStage())
}
