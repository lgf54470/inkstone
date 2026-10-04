// jsdom has no canvas backend, and chart.js only ever assigns to the 2D context. Tests that let
// the real chart.js build a chart stub that context instead of mocking chart.js, so what they
// exercise is the app's own render path. A fresh object per call keeps chart.js's assignments
// (and its own state) from leaking between tests.

export function stubCanvasContext(): () => void {
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = (() => ({
    canvas: document.createElement('canvas'),
    clearRect: () => { },
    fillRect: () => { },
    beginPath: () => { },
    moveTo: () => { },
    lineTo: () => { },
    stroke: () => { },
    fill: () => { },
    arc: () => { },
    save: () => { },
    restore: () => { },
    measureText: () => ({ width: 0 }),
  })) as never
  return () => {
    HTMLCanvasElement.prototype.getContext = original
  }
}

// jsdom lays nothing out, so an element reports zero width and height and a library that projects
// geometry into the drawing box (an echarts map divides its bounds by the box it measured) throws on
// the way in. Tests that let the real library build a chart hand it a box instead of mocking the
// library, so what they exercise stays the app's own render path.
export function stubElementSize(width = 320, height = 200): () => void {
  const keys = ['clientWidth', 'clientHeight'] as const
  const values = { clientWidth: width, clientHeight: height }
  const before = keys.map((key) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, key))
  keys.forEach((key) => {
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => values[key] })
  })
  return () => {
    keys.forEach((key, index) => {
      const original = before[index]
      if (original) Object.defineProperty(HTMLElement.prototype, key, original)
      else Reflect.deleteProperty(HTMLElement.prototype, key)
    })
  }
}
