import type { DiagramTemplate } from './diagram-templates'

export const BENTO_SLIDES_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'outline',
    labelKey: 'contextmenu.slides_outline',
    code: `# Bento Slides Showcase
The file is the software. One file for deck, viewer and editor together.
- Local-first & offline native design
- Clean interactive preview and presentation mode
- Full two-way editing with instant sync
[bg: #0e131f] [transition: fade]

---

# Key Features & Architecture
- Rich text, cards, tables, charts and code elements
- Adaptive theme with inkstone accent color
- Distraction-free presentation view
[bg: #0b132b] [transition: slide] [notes: Introduce core presentation features]`,
  },
  {
    id: 'json',
    labelKey: 'contextmenu.slides_json',
    code: `{
  "format": "bento/slides",
  "version": 1,
  "title": "Bento Slides",
  "size": { "width": 1280, "height": 720 },
  "theme": {
    "background": "#0e131f",
    "color": "#e2e8f0",
    "accent": "#3b82f6"
  },
  "slides": [
    {
      "id": "slide-1",
      "title": "Bento Slides",
      "elements": [
        {
          "id": "title-1",
          "type": "text",
          "html": "The file is the software.",
          "fontSize": 56,
          "fontWeight": 800,
          "align": "left",
          "valign": "top",
          "x": 96,
          "y": 140,
          "w": 1088,
          "h": 120
        },
        {
          "id": "desc-1",
          "type": "text",
          "html": "One HTML file — deck, viewer and editor together.",
          "fontSize": 24,
          "fontWeight": 400,
          "align": "left",
          "valign": "top",
          "x": 96,
          "y": 300,
          "w": 800,
          "h": 80
        }
      ]
    },
    {
      "id": "slide-2",
      "title": "Performance & Metrics",
      "elements": [
        {
          "id": "title-2",
          "type": "text",
          "html": "Growth Metrics",
          "fontSize": 44,
          "fontWeight": 700,
          "align": "left",
          "valign": "top",
          "x": 96,
          "y": 80,
          "w": 1088,
          "h": 80
        },
        {
          "id": "chart-1",
          "type": "chart",
          "preset": "bar",
          "data": [
            { "label": "Q1", "value": 30 },
            { "label": "Q2", "value": 65 },
            { "label": "Q3", "value": 90 },
            { "label": "Q4", "value": 140 }
          ],
          "title": "Active Users (k)",
          "x": 96,
          "y": 180,
          "w": 1088,
          "h": 460
        }
      ]
    }
  ]
}`,
  },
]
