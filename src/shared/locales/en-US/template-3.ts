export const messages = {
"template.project_review.content": `---
title: {{title}} Retrospective
createdAt: {{createdAt}}
tags: [review]
---

## Background
- Project:
- Period:
- Goal:

## What Went Well
1. 

## What Went Wrong
1. 

## Root Causes
- 

## Keep Doing
- 

## Improve Next Time
- [ ] 

## Lessons
- 
`,
"template.project_review.description": "Retrospective on what went well and what to improve.",
"template.project_review.name": "Project Retrospective",
"template.recipe.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [cooking]
---

## Dish

## Servings

## Time
- Prep:  min
- Cook:  min

## Ingredients
- 

## Steps
1. 

## Taste Notes
- Rating: ⭐⭐⭐
- Adjust next time:

> Remember to write down the seasoning amounts you actually used. {{cursor}}
`,
"template.recipe.description": "Standard recipe card with ingredients and steps.",
"template.recipe.name": "Recipe",
"template.shopping_list.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [shopping]
---

## Groceries
- [ ] 
- [ ] 

## Household
- [ ] 
- [ ] 

## Electronics / Other
- [ ] 

## Budget
- Planned: 
- Spent: 
- Remaining: 

> Tick items off as you put them into the cart. {{cursor}}
`,
"template.shopping_list.description": "Categorized shopping list with quantities and budget.",
"template.shopping_list.name": "Shopping List",
"template.sleep_diary.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [sleep]
---

## Last Night
- Bedtime:
- Fell asleep:
- Woke up:
- Got up:

## Quality
- Total sleep:  h
- Quality (1-5):
- Awakenings:

## Factors
- Caffeine after 14:00: 
- Screen time before bed: 
- Exercise today: 

## Tonight's Plan
- [ ] Wind down at:
- [ ] Lights off at:

> Keep a consistent schedule — weekends too. {{cursor}}
`,
"template.sleep_diary.description": "Track bedtime, wake time and sleep quality.",
"template.sleep_diary.name": "Sleep Diary",
"template.speech_draft.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [speech]
---

## Occasion
- Event:
- Duration:  min
- Audience:

## One-Minute Message
> 

## Opening
- Hook:
- Why this topic:

## Main Points
### Point 1
- 

### Point 2
- 

### Point 3
- 

## Closing
- Recap:
- Call to action:

## Delivery Notes
- Pace:
- Pauses:
`,
"template.speech_draft.description": "Draft a speech with opening, main points and call to action.",
"template.speech_draft.name": "Speech Draft",
"template.story_setting.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [story]
---

## Logline
> 

## Characters
### Protagonist
- Name:
- Want:
- Need:
- Flaw:

### Antagonist
- Name:
- Want:

## World
- Setting:
- Rules:
- Conflict source:

## Plot
### Act 1
- 

### Act 2
- 

### Act 3
- 

## Themes
- 
`,
"template.story_setting.description": "Develop characters, world and plot for a story.",
"template.story_setting.name": "Story Setting",
"template.swot.content": `---
title: {{title}} SWOT
createdAt: {{createdAt}}
tags: [swot]
---

|  | Positive | Negative |
| --- | --- | --- |
| Internal | **Strengths** | **Weaknesses** |
|  |  |  |
| External | **Opportunities** | **Threats** |
|  |  |  |

## Strategies
- SO (use strengths to seize opportunities):
- WO (fix weaknesses to grab opportunities):
- ST (use strengths to reduce threats):
- WT (avoid threats, minimize weaknesses):
`,
"template.swot.description": "Assess strengths, weaknesses, opportunities and threats.",
"template.swot.name": "SWOT Analysis",
"template.task_breakdown.content": `---
title: {{title}}
createdAt: {{createdAt}}
tags: [planning]
---

## Big Task

**Goal / Definition of done:**

## Subtasks
- [ ] 1. 
  - [ ] Details
- [ ] 2. 
  - [ ] Details
- [ ] 3. 

## Dependencies & Risks
- 

## Estimate
- Total:  hours
- Deadline: 

> Each subtask should be small enough to start without thinking. {{cursor}}
`,
"template.task_breakdown.description": "Break a big task into small, actionable subtasks.",
"template.task_breakdown.name": "Task Breakdown",
"template.todo_list.content": `---
title: {{title}} · {{date}}
createdAt: {{createdAt}}
tags: [todo]
---

## Today
- [ ] **High priority**
  - [ ] 
- [ ] **Medium priority**
  - [ ] 
- [ ] **Low priority**
  - [ ] 

## Deferred
- [ ] 

> Pick the single most important task and finish it first. {{cursor}}
`,
"template.todo_list.description": "A simple daily todo list with priorities and due dates.",
"template.todo_list.name": "Todo List",
"template.travel_guide.content": `---
title: {{title}} Travel Guide
createdAt: {{createdAt}}
tags: [travel]
---

## Trip Info
- Destination:
- Dates:
- Travelers:

## Itinerary
### Day 1 · {{today}}
- [ ] Morning:
- [ ] Afternoon:
- [ ] Evening:

### Day 2 · {{tomorrow}}
- [ ] Morning:
- [ ] Afternoon:
- [ ] Evening:

## Budget
| Item | Planned | Actual |
| --- | --- | --- |
| Transport |  |  |
| Accommodation |  |  |
| Food |  |  |
| Tickets |  |  |

## Packing
- [ ] Documents & IDs
- [ ] 

## Bookings
- [ ] Flights
- [ ] Hotel
- [ ] 

## Notes
- 
`,
"template.travel_guide.description": "Plan itinerary, budget, packing and bookings for a trip.",
"template.travel_guide.name": "Travel Guide",
"template.weekly_plan.content": `---
title: {{title}} · Week
createdAt: {{createdAt}}
tags: [weekly]
---

## This Week's Focus
1. 

## Schedule
| Day | Tasks | Notes |
| --- | --- | --- |
| Mon |  |  |
| Tue |  |  |
| Wed |  |  |
| Thu |  |  |
| Fri |  |  |
| Sat |  |  |
| Sun |  |  |

## Next Week Preview
- 

> Review on Sunday: what moved forward, what needs replanning. {{cursor}}
`,
"template.weekly_plan.description": "Plan your week: goals, schedule and reviews.",
"template.weekly_plan.name": "Weekly Plan",
"template.weekly_report.content": `---
title: {{title}} Weekly Report
createdAt: {{createdAt}}
tags: [report]
---

## Completed
1. 

## In Progress
- 

## Blockers
- 

## Learned
- 

## Next Week
- [ ] 

## Metrics
| KPI | Target | Actual |
| --- | --- | --- |
|  |  |  |
`,
"template.weekly_report.description": "Summarize what you did, learned and plan next week.",
"template.weekly_report.name": "Weekly Report",
};
