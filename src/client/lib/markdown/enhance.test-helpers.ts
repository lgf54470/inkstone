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
