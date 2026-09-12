import { useEffect, useRef } from 'react'
import { ensureMusicAnalyser, useMusicPlayer } from './music-player'

const BAR_COUNT = 26
const MIN_LEVEL = 0.05
const IDLE_LEVEL = 0.04
const SPECTRUM_SHARE = 0.72
const LOW_END_CURVE = 1.6
const ACCENT_REFRESH_FRAMES = 60
const FALLBACK_BINS = 128
const BAR_WIDTH_SHARE = 0.58
const BAR_MIN_HEIGHT_SHARE = 0.6

// 频率按曲线取样，否则低频会吞掉整条频谱
export function visualizerLevels(spectrum: Uint8Array, barCount: number): number[] {
  const levels: number[] = []
  const usable = Math.max(1, Math.floor(spectrum.length * SPECTRUM_SHARE))
  for (let bar = 0; bar < barCount; bar += 1) {
    const from = Math.floor(Math.pow(bar / barCount, LOW_END_CURVE) * usable)
    const to = Math.max(from + 1, Math.floor(Math.pow((bar + 1) / barCount, LOW_END_CURVE) * usable))
    let peak = 0
    for (let index = from; index < to && index < spectrum.length; index += 1) peak = Math.max(peak, spectrum[index] ?? 0)
    levels.push(peak / 255)
  }
  return levels
}

/** 悬浮播放器里的频谱条，暂停时保留一条平静的基线 */
export function MusicVisualizer({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const playing = useMusicPlayer().playing

  useEffect(() => {
    if (!playing || analyserRef.current) return
    let cancelled = false
    void ensureMusicAnalyser().then((node) => {
      if (!cancelled && node) analyserRef.current = node
    })
    return () => {
      cancelled = true
    }
  }, [playing])

  useEffect(() => paintLoop(canvasRef.current, analyserRef, playing), [playing])

  return <canvas ref={canvasRef} aria-hidden='true' className={`block h-7 w-full ${className}`} />
}

function paintLoop(
  canvas: HTMLCanvasElement | null,
  analyserRef: { current: AnalyserNode | null },
  playing: boolean,
): () => void {
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return () => undefined
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const spectrum = new Uint8Array(analyserRef.current?.frequencyBinCount ?? FALLBACK_BINS)
  let frame = 0
  let tick = 0
  let accent = readAccent(canvas)
  const step = (): void => {
    if (tick % ACCENT_REFRESH_FRAMES === 0) accent = readAccent(canvas)
    tick += 1
    const analyser = analyserRef.current
    if (analyser && playing) analyser.getByteFrequencyData(spectrum)
    else spectrum.fill(0)
    paintFrame(canvas, context, visualizerLevels(spectrum, BAR_COUNT), accent, playing)
    if (!reduceMotion) frame = window.requestAnimationFrame(step)
  }
  step()
  if (reduceMotion) return () => undefined
  return () => window.cancelAnimationFrame(frame)
}

function paintFrame(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  levels: number[],
  accent: string,
  playing: boolean,
): void {
  const ratio = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio))
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  context.clearRect(0, 0, width, height)
  context.fillStyle = accent
  const idle = playing ? MIN_LEVEL : IDLE_LEVEL
  const slot = width / levels.length
  const barWidth = Math.max(1, slot * BAR_WIDTH_SHARE)
  for (let index = 0; index < levels.length; index += 1) {
    const level = Math.max(idle, levels[index] ?? 0)
    const barHeight = Math.max(barWidth * BAR_MIN_HEIGHT_SHARE, level * height)
    context.beginPath()
    context.roundRect(index * slot + (slot - barWidth) / 2, (height - barHeight) / 2, barWidth, barHeight, barWidth / 2)
    context.fill()
  }
}

function readAccent(element: Element): string {
  const styles = window.getComputedStyle(element)
  return styles.getPropertyValue('--accent').trim() || styles.color
}
