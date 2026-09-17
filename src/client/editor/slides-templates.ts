import type { DiagramTemplate } from './diagram-templates'

export const BENTO_SLIDES_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'json',
    labelKey: 'contextmenu.slides_json',
    code: `{
  "format": "bento/slides",
  "version": 1,
  "title": "Bento Slides Showcase",
  "size": { "width": 1280, "height": 720 },
  "theme": {
    "background": "#0D1B2E",
    "color": "#FFFFFF",
    "accent": "#FF9E8A",
    "fontFamily": "'Instrument Sans', -apple-system, sans-serif"
  },
  "present": {
    "slideNumber": true,
    "progress": true,
    "controls": false,
    "numberHidden": false
  },
  "slides": [
    {
      "id": "slide-1",
      "title": "The file is the software.",
      "background": "#0D1B2E",
      "transition": "fade",
      "notes": "Welcome! This whole deck — data, viewer, editor — lives in one HTML file. Right advances, Esc edits.",
      "elements": [
        {
          "id": "kicker-1",
          "type": "text",
          "html": "BENTO/SLIDES",
          "fontSize": 14,
          "fontWeight": 700,
          "color": "#FF9E8A",
          "letterSpacing": 4,
          "x": 96,
          "y": 54,
          "w": 700,
          "h": 26
        },
        {
          "id": "line-1",
          "type": "shape",
          "shape": "rect",
          "fill": "rgba(255,255,255,0.12)",
          "radius": 0,
          "x": 96,
          "y": 86,
          "w": 1088,
          "h": 2
        },
        {
          "id": "title-1",
          "type": "text",
          "html": "The file<br>is the<br>software.",
          "fontSize": 104,
          "lineHeight": 1.02,
          "fontWeight": 900,
          "fontFamily": "'Fraunces', Georgia, serif",
          "color": "#FFFFFF",
          "x": 88,
          "y": 120,
          "w": 660,
          "h": 360
        },
        {
          "id": "card-bg",
          "type": "shape",
          "shape": "rect",
          "fill": "#16273E",
          "fillGradient": {
            "angle": 0,
            "stops": [{ "at": 0, "color": "#101F33" }, { "at": 1, "color": "#1D3049" }]
          },
          "radius": 36,
          "x": 830,
          "y": 170,
          "w": 340,
          "h": 340
        },
        {
          "id": "card-steel",
          "type": "shape",
          "shape": "rect",
          "fill": "#5E7699",
          "fillGradient": {
            "angle": 0,
            "stops": [{ "at": 0, "color": "#48607F" }, { "at": 1, "color": "#7089A8" }]
          },
          "radius": 16,
          "x": 868,
          "y": 208,
          "w": 90,
          "h": 264
        },
        {
          "id": "card-peach",
          "type": "shape",
          "shape": "rect",
          "fill": "#FF9E8A",
          "fillGradient": {
            "angle": 0,
            "stops": [{ "at": 0, "color": "#ED8266" }, { "at": 1, "color": "#FFB29B" }]
          },
          "radius": 16,
          "x": 974,
          "y": 208,
          "w": 160,
          "h": 120
        },
        {
          "id": "card-paper",
          "type": "shape",
          "shape": "rect",
          "fill": "#EFECE3",
          "fillGradient": {
            "angle": 0,
            "stops": [{ "at": 0, "color": "#DDD9CD" }, { "at": 1, "color": "#F6F3EB" }]
          },
          "radius": 16,
          "x": 974,
          "y": 344,
          "w": 160,
          "h": 128
        },
        {
          "id": "desc-1",
          "type": "text",
          "html": "One HTML file — deck, viewer and editor together.<br>Open it anywhere. It saves itself.",
          "fontSize": 20,
          "fontWeight": 500,
          "lineHeight": 1.6,
          "color": "#B6C1D2",
          "x": 96,
          "y": 516,
          "w": 620,
          "h": 76
        },
        {
          "id": "key-shape-1",
          "type": "shape",
          "shape": "rect",
          "fill": "rgba(255,255,255,0.06)",
          "stroke": "rgba(255,255,255,0.2)",
          "strokeWidth": 1,
          "radius": 8,
          "x": 96,
          "y": 624,
          "w": 36,
          "h": 30
        },
        {
          "id": "key-text-1",
          "type": "text",
          "html": "→",
          "fontSize": 13,
          "align": "center",
          "color": "rgba(230,237,247,0.9)",
          "x": 96,
          "y": 628,
          "w": 36,
          "h": 20
        },
        {
          "id": "key-label-1",
          "type": "text",
          "html": "ADVANCE",
          "fontSize": 11,
          "fontWeight": 700,
          "letterSpacing": 2,
          "color": "rgba(182,193,210,0.6)",
          "x": 144,
          "y": 631,
          "w": 90,
          "h": 18
        },
        {
          "id": "key-shape-2",
          "type": "shape",
          "shape": "rect",
          "fill": "rgba(255,255,255,0.06)",
          "stroke": "rgba(255,255,255,0.2)",
          "strokeWidth": 1,
          "radius": 8,
          "x": 258,
          "y": 624,
          "w": 46,
          "h": 30
        },
        {
          "id": "key-text-2",
          "type": "text",
          "html": "ESC",
          "fontSize": 12,
          "align": "center",
          "color": "rgba(230,237,247,0.9)",
          "x": 258,
          "y": 629,
          "w": 46,
          "h": 20
        },
        {
          "id": "key-label-2",
          "type": "text",
          "html": "EDIT",
          "fontSize": 11,
          "fontWeight": 700,
          "letterSpacing": 2,
          "color": "rgba(182,193,210,0.6)",
          "x": 316,
          "y": 631,
          "w": 50,
          "h": 18
        },
        {
          "id": "key-shape-3",
          "type": "shape",
          "shape": "rect",
          "fill": "rgba(255,255,255,0.06)",
          "stroke": "rgba(255,255,255,0.2)",
          "strokeWidth": 1,
          "radius": 8,
          "x": 388,
          "y": 624,
          "w": 32,
          "h": 30
        },
        {
          "id": "key-text-3",
          "type": "text",
          "html": "S",
          "fontSize": 12,
          "align": "center",
          "color": "rgba(230,237,247,0.9)",
          "x": 388,
          "y": 629,
          "w": 32,
          "h": 20
        },
        {
          "id": "key-label-3",
          "type": "text",
          "html": "SPEAKER VIEW",
          "fontSize": 11,
          "fontWeight": 700,
          "letterSpacing": 2,
          "color": "rgba(182,193,210,0.6)",
          "x": 432,
          "y": 631,
          "w": 140,
          "h": 18
        }
      ]
    },
    {
      "id": "slide-2",
      "title": "Everything ships inside.",
      "background": "#F2F0EA",
      "transition": "morph",
      "notes": "The tiles just morphed into the file anatomy. Everything on the right is editable.",
      "elements": [
        {
          "id": "kicker-2",
          "type": "text",
          "html": "ONE FILE",
          "fontSize": 14,
          "fontWeight": 700,
          "color": "#C25A43",
          "letterSpacing": 4,
          "x": 96,
          "y": 54,
          "w": 700,
          "h": 26
        },
        {
          "id": "line-2",
          "type": "shape",
          "shape": "rect",
          "fill": "rgba(30,42,58,0.12)",
          "radius": 0,
          "x": 96,
          "y": 86,
          "w": 1088,
          "h": 2
        },
        {
          "id": "title-2",
          "type": "text",
          "html": "Everything ships inside.",
          "fontSize": 56,
          "fontWeight": 900,
          "fontFamily": "'Fraunces', Georgia, serif",
          "color": "#0D1B2E",
          "x": 88,
          "y": 112,
          "w": 1000,
          "h": 72
        },
        {
          "id": "card-dashed",
          "type": "shape",
          "shape": "rect",
          "fill": "transparent",
          "stroke": "#FF9E8A",
          "strokeWidth": 2,
          "strokeStyle": "dashed",
          "radius": 24,
          "x": 84,
          "y": 208,
          "w": 444,
          "h": 420
        },
        {
          "id": "file-deck",
          "type": "shape",
          "shape": "rect",
          "fill": "#FF9E8A",
          "radius": 12,
          "x": 120,
          "y": 244,
          "w": 372,
          "h": 104
        },
        {
          "id": "deck-text",
          "type": "text",
          "html": "<b>your deck</b> — JSON in a &lt;script&gt; block",
          "fontSize": 18,
          "fontWeight": 500,
          "color": "#0D1B2E",
          "x": 144,
          "y": 272,
          "w": 330,
          "h": 50
        },
        {
          "id": "file-viewer",
          "type": "shape",
          "shape": "rect",
          "fill": "#5E7699",
          "radius": 12,
          "x": 120,
          "y": 364,
          "w": 372,
          "h": 124
        },
        {
          "id": "viewer-text",
          "type": "text",
          "html": "<b>viewer + presenter</b> — morphs, charts, speaker view",
          "fontSize": 18,
          "fontWeight": 500,
          "color": "#FFFFFF",
          "x": 144,
          "y": 396,
          "w": 330,
          "h": 60
        },
        {
          "id": "file-editor",
          "type": "shape",
          "shape": "rect",
          "fill": "#EFECE3",
          "radius": 12,
          "x": 120,
          "y": 504,
          "w": 372,
          "h": 88
        },
        {
          "id": "editor-text",
          "type": "text",
          "html": "<b>the editor itself</b> — press Esc, it’s right there",
          "fontSize": 18,
          "fontWeight": 500,
          "color": "#142236",
          "x": 144,
          "y": 530,
          "w": 330,
          "h": 46
        },
        {
          "id": "body-text-2",
          "type": "text",
          "html": "No cloud account. No subscription.<br>No dependencies to break in five years.<br><br>Double-click to view. Open anywhere in your browser.<br>The document <i>is</i> the application.",
          "fontSize": 22,
          "lineHeight": 1.6,
          "color": "#1E2A3A",
          "x": 580,
          "y": 260,
          "w": 580,
          "h": 320
        }
      ]
    },
    {
      "id": "slide-3",
      "title": "Performance & Metrics",
      "background": "#0D1B2E",
      "transition": "slide",
      "elements": [
        {
          "id": "kicker-3",
          "type": "text",
          "html": "ANALYTICS",
          "fontSize": 14,
          "fontWeight": 700,
          "color": "#FF9E8A",
          "letterSpacing": 4,
          "x": 96,
          "y": 54,
          "w": 700,
          "h": 26
        },
        {
          "id": "title-3",
          "type": "text",
          "html": "Performance & Metrics",
          "fontSize": 54,
          "fontWeight": 900,
          "fontFamily": "'Fraunces', Georgia, serif",
          "color": "#FFFFFF",
          "x": 88,
          "y": 100,
          "w": 1000,
          "h": 72
        },
        {
          "id": "chart-1",
          "type": "chart",
          "preset": "bar",
          "title": "Monthly Views & Edits",
          "color": "#FF9E8A",
          "data": [
            { "label": "Mon", "value": 42 },
            { "label": "Tue", "value": 68 },
            { "label": "Wed", "value": 54 },
            { "label": "Thu", "value": 86 },
            { "label": "Fri", "value": 73 }
          ],
          "x": 96,
          "y": 200,
          "w": 530,
          "h": 440
        },
        {
          "id": "chart-2",
          "type": "chart",
          "preset": "pie",
          "title": "Audience Distribution",
          "color": "#5E7699",
          "data": [
            { "label": "Desktop", "value": 55 },
            { "label": "Mobile", "value": 30 },
            { "label": "Tablet", "value": 15 }
          ],
          "x": 660,
          "y": 200,
          "w": 520,
          "h": 440
        }
      ]
    }
  ]
}`,
  },
  {
    id: 'outline',
    labelKey: 'contextmenu.slides_outline',
    code: `# Bento Slides Showcase
The file is the software. One HTML file — deck, viewer and editor together.
- Local-first & offline native design
- Clean interactive preview and presentation mode
- Full two-way editing with instant sync
[bg: #0D1B2E] [transition: fade]

---

# Everything ships inside.
No cloud account. No subscription. No dependencies to break.
- your deck — JSON data
- viewer + presenter — morphs, charts, speaker view
- the editor itself — press Esc, it's right there
[bg: #F2F0EA] [transition: morph]

---

# Performance & Metrics
- Views & active edits count
- Visual distribution breakdown
[bg: #0D1B2E] [transition: slide] [notes: Presenting key analytics and metrics]`,
  },
]
