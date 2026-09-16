import type { DiagramTemplate } from './diagram-templates'

export const KANBAN_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'outline',
    labelKey: 'contextmenu.kanban_outline',
    code: `## To Do
- [ ] Task 1 [priority: high]
- [ ] Task 2 [priority: medium]

## In Progress
- [ ] Feature Development [priority: high] [progress: 40]

## Done
- [x] Initial Research`,
  },
  {
    id: 'json',
    labelKey: 'contextmenu.kanban_json',
    code: `{
  "title": "Kanban",
  "columns": [
    {
      "id": "status",
      "name": "Status",
      "type": "select",
      "options": [
        { "id": "todo", "label": "To Do", "color": "gray" },
        { "id": "in_progress", "label": "In Progress", "color": "blue" },
        { "id": "done", "label": "Done", "color": "green" }
      ]
    },
    {
      "id": "priority",
      "name": "Priority",
      "type": "select",
      "options": [
        { "id": "low", "label": "Low", "color": "green" },
        { "id": "medium", "label": "Medium", "color": "yellow" },
        { "id": "high", "label": "High", "color": "red" }
      ]
    }
  ],
  "items": [
    { "id": "item-1", "title": "Design Mockups", "properties": { "status": "done", "priority": "medium" } },
    { "id": "item-2", "title": "Implement Feature", "properties": { "status": "in_progress", "priority": "high", "progress": 50 } },
    { "id": "item-3", "title": "Unit Tests", "properties": { "status": "todo", "priority": "high" } }
  ]
}`,
  },
]
