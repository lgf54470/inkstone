import { EditorSelection, type StateCommand } from '@codemirror/state';
import type { MessageKey } from '../lib/i18n';

export interface DiagramTemplate {
  id: string;
  labelKey: MessageKey;
  code: string;
}

export const MERMAID_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'flowchart',
    labelKey: 'contextmenu.mermaid_flowchart',
    code: `flowchart TD
    A[Start] --> B{Condition}
    B -->|Yes| C[Success]
    B -->|No| D[Handle Error]`,
  },
  {
    id: 'sequence',
    labelKey: 'contextmenu.mermaid_sequence',
    code: `sequenceDiagram
    autonumber
    actor User
    participant App
    participant Server
    User->>App: Action
    App->>Server: API Request
    Server-->>App: Response Data
    App-->>User: Render View`,
  },
  {
    id: 'gantt',
    labelKey: 'contextmenu.mermaid_gantt',
    code: `gantt
    title Project Schedule
    dateFormat YYYY-MM-DD
    section Planning
    Requirements :2026-09-01, 5d
    Architecture :2026-09-06, 4d
    section Development
    Core Features :2026-09-10, 14d
    Testing & QA :2026-09-24, 7d`,
  },
  {
    id: 'class',
    labelKey: 'contextmenu.mermaid_class',
    code: `classDiagram
    class User {
        +String id
        +String name
        +login()
    }
    class Admin {
        +manageUsers()
    }
    User <|-- Admin`,
  },
  {
    id: 'pie',
    labelKey: 'contextmenu.mermaid_pie',
    code: `pie title Expense Distribution
    "Engineering" : 45
    "Operations" : 25
    "Marketing" : 20
    "Other" : 10`,
  },
  {
    id: 'state',
    labelKey: 'contextmenu.mermaid_state',
    code: `stateDiagram-v2
    [*] --> Pending
    Pending --> InProgress: Start
    InProgress --> Review: Submit
    Review --> Completed: Approve
    Review --> InProgress: Reject
    Completed --> [*]`,
  },
  {
    id: 'er',
    labelKey: 'contextmenu.mermaid_er',
    code: `erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : refers`,
  },
  {
    id: 'mindmap',
    labelKey: 'contextmenu.mermaid_mindmap',
    code: `mindmap
  root((Core Topic))
    Product
      Target Audience
      Key Value
    Architecture
      Web Client
      Edge Runtime
      Database
    Operations
      Community
      Ecosystem`,
  },
  {
    id: 'timeline',
    labelKey: 'contextmenu.mermaid_timeline',
    code: `timeline
    title Milestone History
    2024 : Concept : Prototype
    2025 : Version 1.0 : Cross Platform
    2026 : Version 2.0 : AI Integration`,
  },
  {
    id: 'journey',
    labelKey: 'contextmenu.mermaid_journey',
    code: `journey
    title User Onboarding Journey
    section Discovery
      Visit Homepage: 5: User
      Read Docs: 4: User
    section Sign Up
      Enter Email: 3: User
      Verify Account: 4: User
      Enter Workspace: 5: User`,
  },
  {
    id: 'quadrant',
    labelKey: 'contextmenu.mermaid_quadrant',
    code: `quadrantChart
    title Feature Priority Matrix
    x-axis Low Complexity --> High Complexity
    y-axis Low Value --> High Value
    quadrant-1 Strategic Priority
    quadrant-2 Quick Win
    quadrant-3 Re-evaluate
    quadrant-4 Avoid
    Feature A: [0.3, 0.85]
    Feature B: [0.75, 0.9]
    Feature C: [0.2, 0.3]
    Feature D: [0.8, 0.25]`,
  },
  {
    id: 'gitgraph',
    labelKey: 'contextmenu.mermaid_gitgraph',
    code: `gitGraph
    commit
    commit
    branch feature
    checkout feature
    commit
    commit
    checkout main
    merge feature
    commit`,
  },
  {
    id: 'c4',
    labelKey: 'contextmenu.mermaid_c4',
    code: `C4Context
    title System Context Diagram
    Person(customer, "User", "A customer of the notebook system.")
    System(app, "Inkstone", "Markdown notes and live preview.")
    System_Ext(s3, "S3 Storage", "Encrypted backup storage.")
    Rel(customer, app, "Edits and views notes")
    Rel(app, s3, "Performs scheduled backup")`,
  },
  {
    id: 'kanban',
    labelKey: 'contextmenu.mermaid_kanban',
    code: `kanban
  Todo
    [Improve unit test coverage]
    [Optimize mobile typography]
  InProgress
    [Extend chart and diagram options]
  Done
    [Upgrade code block highlighting]
    [Table visual alignment]`,
  },
];

export const CHARTJS_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'bar',
    labelKey: 'contextmenu.chart_bar',
    code: `{
  "type": "bar",
  "data": {
    "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    "datasets": [
      {
        "label": "Revenue ($k)",
        "data": [12, 19, 15, 25, 22, 30],
        "backgroundColor": "rgba(59, 130, 246, 0.6)",
        "borderColor": "rgb(59, 130, 246)",
        "borderWidth": 1
      }
    ]
  },
  "options": {
    "responsive": true,
    "plugins": {
      "legend": {
        "position": "top"
      }
    }
  }
}`,
  },
  {
    id: 'line',
    labelKey: 'contextmenu.chart_line',
    code: `{
  "type": "line",
  "data": {
    "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "datasets": [
      {
        "label": "Active Users (UV)",
        "data": [1200, 1900, 1700, 2100, 2400, 2800, 3100],
        "fill": false,
        "borderColor": "rgb(16, 185, 129)",
        "tension": 0.25
      }
    ]
  },
  "options": {
    "responsive": true
  }
}`,
  },
  {
    id: 'pie',
    labelKey: 'contextmenu.chart_pie',
    code: `{
  "type": "pie",
  "data": {
    "labels": ["Direct", "Search", "Social", "Referral"],
    "datasets": [
      {
        "data": [35, 40, 15, 10],
        "backgroundColor": [
          "#3b82f6",
          "#10b981",
          "#f59e0b",
          "#ec4899"
        ]
      }
    ]
  },
  "options": {
    "responsive": true
  }
}`,
  },
  {
    id: 'doughnut',
    labelKey: 'contextmenu.chart_doughnut',
    code: `{
  "type": "doughnut",
  "data": {
    "labels": ["Completed", "In Progress", "Pending"],
    "datasets": [
      {
        "data": [60, 25, 15],
        "backgroundColor": [
          "#10b981",
          "#3b82f6",
          "#9ca3af"
        ]
      }
    ]
  },
  "options": {
    "responsive": true
  }
}`,
  },
  {
    id: 'radar',
    labelKey: 'contextmenu.chart_radar',
    code: `{
  "type": "radar",
  "data": {
    "labels": ["Quality", "Velocity", "Architecture", "Collaboration", "Agility", "Coverage"],
    "datasets": [
      {
        "label": "Evaluation",
        "data": [85, 90, 80, 88, 82, 75],
        "fill": true,
        "backgroundColor": "rgba(59, 130, 246, 0.2)",
        "borderColor": "rgb(59, 130, 246)",
        "pointBackgroundColor": "rgb(59, 130, 246)"
      }
    ]
  },
  "options": {
    "responsive": true
  }
}`,
  },
  {
    id: 'polarArea',
    labelKey: 'contextmenu.chart_polar_area',
    code: `{
  "type": "polarArea",
  "data": {
    "labels": ["Engineering", "Design", "Operations", "Marketing", "Finance"],
    "datasets": [
      {
        "data": [11, 16, 7, 14, 8],
        "backgroundColor": [
          "rgba(244, 63, 94, 0.6)",
          "rgba(16, 185, 129, 0.6)",
          "rgba(245, 158, 11, 0.6)",
          "rgba(139, 92, 246, 0.6)",
          "rgba(59, 130, 246, 0.6)"
        ]
      }
    ]
  },
  "options": {
    "responsive": true
  }
}`,
  },
  {
    id: 'bubble',
    labelKey: 'contextmenu.chart_bubble',
    code: `{
  "type": "bubble",
  "data": {
    "datasets": [
      {
        "label": "Project Matrix",
        "data": [
          { "x": 20, "y": 30, "r": 15 },
          { "x": 40, "y": 10, "r": 10 },
          { "x": 25, "y": 50, "r": 25 }
        ],
        "backgroundColor": "rgba(244, 63, 94, 0.6)"
      }
    ]
  },
  "options": {
    "responsive": true
  }
}`,
  },
];

export function insertDiagramCode(lang: 'mermaid' | 'chart', code: string): StateCommand {
  return ({ state, dispatch }) => {
    const range = state.selection.main;
    const insert = `\`\`\`${lang}\n${code}\n\`\`\`\n`;
    dispatch(state.update({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.cursor(range.from + insert.length),
      scrollIntoView: true,
      userEvent: 'input.insert',
    }));
    return true;
  };
}
