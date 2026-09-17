import type {
  ChartDatum,
  ChartElement,
  CodeElement,
  ImageElement,
  ShapeElement,
  ShapeType,
  TableElement,
  TextElement,
} from '../types'

export function createDefaultText(): TextElement {
  return {
    id: `text-${Date.now()}`,
    type: 'text',
    html: 'Click to edit text',
    fontSize: 28,
    fontWeight: 400,
    x: 200,
    y: 200,
    w: 400,
    h: 80,
  }
}

export function createDefaultShape(shape: ShapeType, fill: string): ShapeElement {
  return {
    id: `shape-${Date.now()}`,
    type: 'shape',
    shape,
    fill,
    x: 300,
    y: 250,
    w: 240,
    h: 160,
    radius: 12,
  }
}

export function createDefaultImage(): ImageElement {
  return {
    id: `img-${Date.now()}`,
    type: 'image',
    src: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800',
    x: 240,
    y: 180,
    w: 480,
    h: 300,
    radius: 12,
  }
}

export function createDefaultTable(): TableElement {
  return {
    id: `tbl-${Date.now()}`,
    type: 'table',
    columns: [{ w: 160 }, { w: 220 }, { w: 180 }],
    rows: [
      {
        cells: [
          { html: 'Item', bold: true },
          { html: 'Description', bold: true },
          { html: 'Status', bold: true },
        ],
      },
      {
        cells: [
          { html: 'Architecture' },
          { html: 'Offline-first, 1 file' },
          { html: 'Complete' },
        ],
      },
      {
        cells: [
          { html: 'Presentation' },
          { html: 'Morph transitions & HUD' },
          { html: 'Active' },
        ],
      },
    ],
    x: 180,
    y: 160,
    w: 640,
    h: 220,
  }
}

export function createDefaultChart(preset: 'bar' | 'line' | 'pie' | 'scatter'): ChartElement {
  const chartData: ChartDatum[] = [
    { label: 'Jan', value: 35 },
    { label: 'Feb', value: 55 },
    { label: 'Mar', value: 80 },
    { label: 'Apr', value: 120 },
  ]
  return {
    id: `chart-${Date.now()}`,
    type: 'chart',
    preset,
    data: chartData,
    title: 'Monthly Progress',
    x: 220,
    y: 160,
    w: 520,
    h: 300,
  }
}

export function createDefaultCode(): CodeElement {
  return {
    id: `code-${Date.now()}`,
    type: 'code',
    lang: 'typescript',
    code: `const deck = await loadBentoSlides()\ndeck.present({ transition: 'morph' })`,
    fontSize: 16,
    x: 200,
    y: 180,
    w: 560,
    h: 220,
  }
}
