import { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn'
import { ensureAudioAnalyser } from './audio-engine'
import { useMusic } from './music-store'

const BAR_COUNT = 26
const MIN_LEVEL = 0.05
const IDLE_LEVEL = 0.04
const SPECTRUM_SHARE = 0.72
const LOW_END_CURVE = 1.6
const ACCENT_REFRESH_FRAMES = 60
const WAVE_HEIGHT_SHARE = 0.42
const FALLBACK_BINS = 128

export type VisualizerVariant = 'bars' | 'wave'

// Frequencies are sampled on a curve so the bass bins do not swallow the whole picture.
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

export function MusicVisualizer({
  variant = 'bars',
  barCount = BAR_COUNT,
  className,
}: {
  variant?: VisualizerVariant
  barCount?: number
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const isPlaying = useMusic((state) => state.isPlaying)

  useEffect(() => {
    if (!isPlaying || analyserRef.current) return
    let cancelled = false
    void ensureAudioAnalyser().then((node) => {
      if (!cancelled && node) analyserRef.current = node
    })
    return () => {
      cancelled = true
    }
  }, [isPlaying])

  useEffect(() => paintLoop(canvasRef.current, analyserRef, variant, barCount, isPlaying), [variant, barCount, isPlaying])

  return <canvas ref={canvasRef} aria-hidden='true' className={cn('block h-7 w-full', className)} />
}

// A paused player still shows a calm baseline so the strip keeps its place in the layout.
function paintLoop(
  canvas: HTMLCanvasElement | null,
  analyserRef: { current: AnalyserNode | null },
  variant: VisualizerVariant,
  barCount: number,
  isPlaying: boolean,
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
    if (analyser && isPlaying) analyser.getByteFrequencyData(spectrum)
    else spectrum.fill(0)
    const levels = visualizerLevels(spectrum, barCount)
    paintFrame(canvas, context, levels, accent, variant, isPlaying)
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
  variant: VisualizerVariant,
  isPlaying: boolean,
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
  context.strokeStyle = accent
  const idle = isPlaying ? MIN_LEVEL : IDLE_LEVEL
  if (variant === 'wave') drawWave(context, levels, width, height, idle, ratio)
  else drawBars(context, levels, width, height, idle)
}

function drawBars(
  context: CanvasRenderingContext2D,
  levels: number[],
  width: number,
  height: number,
  idle: number,
): void {
  const slot = width / levels.length
  const barWidth = Math.max(1, slot * 0.58)
  for (let index = 0; index < levels.length; index += 1) {
    const level = Math.max(idle, levels[index] ?? 0)
    const barHeight = Math.max(barWidth * 0.6, level * height)
    const x = index * slot + (slot - barWidth) / 2
    context.beginPath()
    context.roundRect(x, (height - barHeight) / 2, barWidth, barHeight, barWidth / 2)
    context.fill()
  }
}

function drawWave(
  context: CanvasRenderingContext2D,
  levels: number[],
  width: number,
  height: number,
  idle: number,
  ratio: number,
): void {
  const middle = height / 2
  const span = height * WAVE_HEIGHT_SHARE
  context.lineWidth = Math.max(1.5, 1.6 * ratio)
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.beginPath()
  for (let index = 0; index < levels.length; index += 1) {
    const x = (index / Math.max(1, levels.length - 1)) * width
    const level = Math.max(idle, levels[index] ?? 0)
    const y = middle - level * span
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.stroke()
  context.beginPath()
  for (let index = levels.length - 1; index >= 0; index -= 1) {
    const x = (index / Math.max(1, levels.length - 1)) * width
    const level = Math.max(idle, levels[index] ?? 0)
    context.lineTo(x, middle + level * span)
  }
  context.closePath()
  context.globalAlpha = 0.35
  context.fill()
  context.globalAlpha = 1
}

function readAccent(element: Element): string {
  const styles = window.getComputedStyle(element)
  return styles.getPropertyValue('--accent').trim() || styles.color
}
